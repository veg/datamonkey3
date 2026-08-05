#!/usr/bin/env python3
"""
verify_parity.py — prove the shipped JS evaluator still matches the model it was derived from.

DM3 does not run ONNX in the browser. It walks the tree table in
src/lib/services/prescreen/meme_hit_likelihood.ensemble.json with treeEnsemble.js, ~37 KB instead
of onnxruntime-web's 13.5 MB of WASM. That is only safe while the JSON provably corresponds to the
.onnx the ML/QC teams validated, and nothing about a JSON file makes that self-evident.

This is that proof, run in CI. It:
  1. checks the .onnx on disk actually hashes to the `source_sha256` recorded in the JSON, so a
     model swap without a regenerate (or the reverse) is caught immediately;
  2. scores a deterministic grid plus adversarial rows through BOTH paths — onnxruntime here, and
     the real shipped evaluator via score_ensemble.mjs;
  3. fails on ANY level disagreement, and on a probability delta above the float32-vs-float64
     noise floor.

Level disagreement is the assertion that matters. The probability is presented to users as one of
three buckets, so a delta that never crosses a bucket boundary cannot change what anyone reads,
whereas a single crossing is a user-visible divergence between DM3 and the validated model.

Usage:  python3 scripts/prescreen/verify_parity.py [--vectors N] [--tolerance T]
Exit 0 on parity, 1 on any mismatch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import subprocess
import sys

import numpy as np
import onnxruntime as ort

REPO = pathlib.Path(__file__).resolve().parents[2]
PRESCREEN = REPO / "src" / "lib" / "services" / "prescreen"
ENSEMBLE = PRESCREEN / "meme_hit_likelihood.ensemble.json"
ONNX = PRESCREEN / "meme_hit_likelihood.onnx"
SCORER = REPO / "scripts" / "prescreen" / "score_ensemble.mjs"

# Must track LIKELY_MIN / UNLIKELY_MAX in hitLikelihoodModel.js. Asserted below.
LIKELY_MIN = 0.70
UNLIKELY_MAX = 0.35


def level(p: np.ndarray) -> np.ndarray:
    """2 = likely, 1 = uncertain, 0 = unlikely — the only thing the user actually sees."""
    return np.where(p >= LIKELY_MIN, 2, np.where(p < UNLIKELY_MAX, 0, 1))


def build_rows(n: int, seed: int = 20260805) -> list[list[float]]:
    """A reproducible sweep of the realistic band, plus rows chosen to sit on the edges."""
    rng = np.random.default_rng(seed)
    rows = np.column_stack(
        [
            rng.integers(1, 700, n),                                    # num_seqs
            rng.integers(1, 1500, n),                                   # num_sites
            np.exp(rng.uniform(np.log(1e-5), np.log(2.0), n)),          # median_pos_dist
            np.ones(n),                                                 # frac_p_defined (inert)
        ]
    ).tolist()
    # Adversarial: domain edges, the zero-distance case, and values that land on split thresholds.
    rows += [
        [0, 0, 0.0, 1.0],
        [2, 17, 0.0, 1.0],
        [4, 17, 5e-4, 1.0],          # exact FEATURE_DOMAIN minima
        [500, 2000, 0.5, 1.0],       # exact FEATURE_DOMAIN maxima
        [501, 2001, 0.500001, 1.0],  # one step outside
        [3.5, 15, 1.236e-4, 1.0],    # near the lowest observed split thresholds
        [1e9, 1e9, 1e9, 1.0],
    ]
    return rows


def js_scores(rows: list[list[float]]) -> np.ndarray:
    proc = subprocess.run(
        ["node", str(SCORER)],
        input=json.dumps({"rows": rows}),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.exit(f"FAIL: the JS scorer errored.\n{proc.stderr.strip()}")
    return np.array(json.loads(proc.stdout)["scores"], dtype=float)


def onnx_scores(rows: list[list[float]]) -> np.ndarray:
    sess = ort.InferenceSession(str(ONNX))
    name = sess.get_inputs()[0].name
    outs = sess.run(None, {name: np.array(rows, dtype=np.float32)})
    probs = [o for o in outs if getattr(o, "ndim", 0) == 2 and o.shape[1] == 2]
    if not probs:
        sys.exit("FAIL: no 2-column probabilities output on the ONNX model.")
    return probs[0][:, 1].astype(float)


def check_thresholds_match_source() -> list[str]:
    """The bucket edges live in JS; this script hard-codes them. Catch the drift."""
    src = (PRESCREEN / "hitLikelihoodModel.js").read_text()
    problems = []
    for name, want in (("LIKELY_MIN", LIKELY_MIN), ("UNLIKELY_MAX", UNLIKELY_MAX)):
        if f"export const {name} = {want}" not in src:
            problems.append(
                f"{name} in hitLikelihoodModel.js no longer matches {want} as assumed here"
            )
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vectors", type=int, default=20000)
    ap.add_argument("--tolerance", type=float, default=1e-5)
    args = ap.parse_args()

    for p in (ENSEMBLE, ONNX, SCORER):
        if not p.exists():
            sys.exit(f"FAIL: missing {p.relative_to(REPO)}")

    doc = json.loads(ENSEMBLE.read_text())
    failures: list[str] = []

    # 1. The JSON must name the .onnx actually sitting next to it.
    actual = hashlib.sha256(ONNX.read_bytes()).hexdigest()
    declared = doc.get("source_sha256", "")
    print(f"  declared source_sha256 : {declared}")
    print(f"  actual  sha256 on disk : {actual}")
    if actual != declared:
        failures.append(
            "source_sha256 does not match the .onnx on disk — the ensemble JSON was generated "
            "from a DIFFERENT model than the one committed. Regenerate with onnx_to_ensemble.py."
        )

    failures += check_thresholds_match_source()

    # 2. Score both paths.
    rows = build_rows(args.vectors)
    js = js_scores(rows)
    on = onnx_scores(rows)
    if js.shape != on.shape:
        sys.exit(f"FAIL: score count mismatch, js={js.shape} onnx={on.shape}")

    diff = np.abs(js - on)
    disagree = np.flatnonzero(level(js) != level(on))

    print(f"  vectors compared       : {len(rows)}")
    print(f"  max |ONNX - JS|        : {diff.max():.3e}   (tolerance {args.tolerance:.1e})")
    print(f"  mean |ONNX - JS|       : {diff.mean():.3e}")
    print(f"  level disagreements    : {len(disagree)}")

    if len(disagree):
        failures.append(f"{len(disagree)} vector(s) land in different levels — user-visible.")
        for i in disagree[:5]:
            failures.append(
                f"    row={rows[i]}  onnx={on[i]:.9f} (level {level(on)[i]})  "
                f"js={js[i]:.9f} (level {level(js)[i]})"
            )
    if diff.max() > args.tolerance:
        i = int(diff.argmax())
        failures.append(
            f"max delta {diff.max():.3e} exceeds tolerance {args.tolerance:.1e} at row={rows[i]}"
        )

    if failures:
        print("\nPARITY FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("\nPARITY OK — the shipped JS evaluator matches the committed .onnx.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
