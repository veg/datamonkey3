#!/usr/bin/env python3
"""
Emit REFERENCE patristic distances for a set of newick trees, for the JS port to be checked against.

WHY THIS RUNS THE ML TEAM'S CODE RATHER THAN A TRANSCRIPTION OF IT.

A parity harness that compares our JS against our Python re-implementation proves only that we made
the same mistake twice. So this does not reimplement anything: it extracts the SOURCE TEXT of
`calculate_patristic_distances` out of the handoff's predict_regression_nexus.py and execs it. What
runs is byte-for-byte their function.

It is extracted rather than imported because importing that module pulls torch, pandas, scipy and
sklearn at module scope, none of which this comparison needs — and requiring a GPU-class dependency
tree to check a tree walk is how a parity gate stops being run.

The companion is verify_preprocessing.mjs, which consumes this output. Neither script writes anything
into the repository, and neither prints taxon names or sequence data: real DataMonkey submissions are
unpublished research, so only file ids, shapes and aggregate deltas are reported.

Usage:
  python3 scripts/axomeme/verify_preprocessing.py \
      --handoff /path/to/predict_regression_nexus.py \
      --trees   '/path/to/corpus/**/*.tre' \
      --out     /tmp/axomeme_reference.json
"""

import argparse
import glob
import json
import math
import re
import sys

REFERENCE_FNS = ["calculate_patristic_distances", "compute_mds_coordinates"]


def extract_reference(handoff_path, fn_name):
    """Pull one reference function's source out of the handoff, verbatim."""
    src = open(handoff_path, "r").read()
    start = src.find(f"def {fn_name}(")
    if start < 0:
        sys.exit(f"[!] {fn_name} not found in {handoff_path}")
    # Runs to the next top-level def/class.
    rest = src[start:]
    m = re.search(r"\n(?=(?:def |class )\w)", rest)
    return rest[: m.start()] if m else rest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--handoff", required=True, help="path to predict_regression_nexus.py")
    ap.add_argument("--trees", required=True, help="glob for newick files")
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument(
        "--max-species",
        type=int,
        default=512,
        help="pad the distance matrix to this size before MDS, as the driver does (default 512)",
    )
    args = ap.parse_args()

    from Bio import Phylo  # noqa: E402
    import numpy as np  # noqa: E402

    ns = {"math": math, "np": np}
    for fn in REFERENCE_FNS:
        body = extract_reference(args.handoff, fn)
        exec(compile(body, "<reference>", "exec"), ns)
        print(f"[*] Extracted {fn} ({body.count(chr(10))} lines) from {args.handoff}")
    reference = ns["calculate_patristic_distances"]
    reference_mds = ns["compute_mds_coordinates"]

    paths = sorted(glob.glob(args.trees, recursive=True))
    if args.limit:
        paths = paths[: args.limit]
    print(f"[*] {len(paths)} tree files")

    out, crashed, unreadable = {}, [], []
    for p in paths:
        try:
            tree = Phylo.read(p, "newick")
        except Exception as ex:
            unreadable.append((p, type(ex).__name__))
            continue
        try:
            names, dist, _ = reference(tree)
        except Exception as ex:
            # EXPECTED for a real slice of the corpus, and worth counting rather than skipping: the
            # reference computes log((node_count + 1.0) / (dist + 0.1)) unconditionally, so any
            # patristic distance <= -0.1 is a math domain error. DM3's own NJ emits the negative
            # branch lengths that produce those.
            crashed.append((p, type(ex).__name__, str(ex)[:80]))
            continue
        names = [n for n in names if n]
        # The driver pads the distance matrix to max_species BEFORE running MDS, so the padded zeros
        # take part in the double-centring and the coordinates depend on max_species. Reproduce that.
        # Trees larger than the cap would go through Max-PD selection in the driver; here they are
        # simply truncated, identically on both sides, because Max-PD is covered by unit tests and
        # mixing the two would make a failure ambiguous.
        names = names[: args.max_species]
        n = args.max_species
        padded = np.zeros((n, n), dtype=np.float32)
        for i, a in enumerate(names):
            row = dist.get(a, {})
            for j, b in enumerate(names):
                padded[i, j] = row.get(b, 0.0)
        coords = reference_mds(padded, n_components=4)
        out[p] = {
            "names": names,
            "dist": [[dist[a].get(b, 0.0) for b in names] for a in names],
            "max_species": n,
            "mds": [[float(v) for v in row] for row in coords],
        }

    json.dump(out, open(args.out, "w"))
    print(f"[*] wrote {len(out)} reference matrices to {args.out}")
    print(f"[*] unreadable by Bio.Phylo: {len(unreadable)}")
    print(f"[*] REFERENCE CRASHED on {len(crashed)} trees ({100.0 * len(crashed) / max(1, len(paths)):.1f}%)")
    for p, kind, msg in crashed[:5]:
        print(f"      {p.split('/')[-1]}: {kind}: {msg}")


if __name__ == "__main__":
    main()
