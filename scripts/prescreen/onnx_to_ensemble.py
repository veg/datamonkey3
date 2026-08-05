#!/usr/bin/env python3
"""
onnx_to_ensemble.py — regenerate meme_hit_likelihood.ensemble.json from the .onnx.

This is the step that used to live only in someone's head. treeEnsemble.js walks the JSON this
script emits; verify_parity.py then proves the two agree. Retraining the gate is:

    python3 scripts/prescreen/onnx_to_ensemble.py path/to/new_model.onnx
    python3 scripts/prescreen/verify_parity.py

It reads the single ai.onnx.ml TreeEnsembleClassifier node, resolves each tree's per-tree node ids
to dense indices, and emits flat [feature_id, threshold_or_weight, true_child, false_child] quads
with feature_id = -1 marking a leaf. Children are NODE indices; treeEnsemble.js multiplies by 4.

Thresholds are written as the shortest decimal that round-trips to the original float32, and
treeEnsemble.js re-`fround`s them on load, so every `<=` routing decision resolves bit-identically
to ORT's float32 comparison.

Usage:  onnx_to_ensemble.py [model.onnx] [--out PATH] [--features a,b,c,d]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
from collections import defaultdict

import numpy as np
import onnx

REPO = pathlib.Path(__file__).resolve().parents[2]
PRESCREEN = REPO / "src" / "lib" / "services" / "prescreen"
DEFAULT_ONNX = PRESCREEN / "meme_hit_likelihood.onnx"
DEFAULT_OUT = PRESCREEN / "meme_hit_likelihood.ensemble.json"
DEFAULT_FEATURES = "num_seqs,num_sites,median_pos_dist,frac_p_defined"

FORMAT = "tree-ensemble-classifier/1"
NODE_LAYOUT = [
    "feature_id (-1 = leaf)",
    "threshold or leaf weight",
    "true_child_index",
    "false_child_index",
]


def shortest_f32(x: float) -> float:
    """Shortest decimal that still round-trips to the same float32."""
    target = np.float32(x)
    for prec in range(1, 18):
        cand = float(f"%.{prec}g" % float(target))
        if np.float32(cand) == target:
            return cand
    return float(target)


def attrs_of(node) -> dict:
    out = {}
    for a in node.attribute:
        if a.ints:
            out[a.name] = list(a.ints)
        elif a.floats:
            out[a.name] = list(a.floats)
        elif a.strings:
            out[a.name] = [s.decode() for s in a.strings]
        elif a.s:
            out[a.name] = a.s.decode()
        elif a.type == onnx.AttributeProto.FLOAT:
            out[a.name] = a.f
        elif a.type == onnx.AttributeProto.INT:
            out[a.name] = a.i
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("onnx", nargs="?", default=str(DEFAULT_ONNX))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--features", default=DEFAULT_FEATURES)
    args = ap.parse_args()

    onnx_path = pathlib.Path(args.onnx).resolve()
    model = onnx.load(str(onnx_path))

    tec = [n for n in model.graph.node if n.op_type == "TreeEnsembleClassifier"]
    if len(tec) != 1:
        sys.exit(f"expected exactly 1 TreeEnsembleClassifier, found {len(tec)}")
    a = attrs_of(tec[0])

    post = a.get("post_transform", "NONE")
    if post != "LOGISTIC":
        sys.exit(f"unsupported post_transform {post!r}; treeEnsemble.js only implements LOGISTIC")

    modes = a["nodes_modes"]
    unknown = set(modes) - {"BRANCH_LEQ", "LEAF"}
    if unknown:
        sys.exit(f"unsupported node modes {unknown}; treeEnsemble.js only implements BRANCH_LEQ")

    base_values = a.get("base_values", [0.0])
    if len(base_values) != 1:
        sys.exit(f"expected a single base value for a binary model, got {len(base_values)}")

    # Leaf weights, keyed by (tree, node). Binary sklearn models emit one weight per leaf.
    weights: dict[tuple[int, int], float] = {}
    for t, n, c, w in zip(
        a["class_treeids"], a["class_nodeids"], a["class_ids"], a["class_weights"]
    ):
        if c != 0:
            sys.exit("multi-class weights found; this exporter handles binary models only")
        weights[(t, n)] = w

    per_tree: dict[int, list[int]] = defaultdict(list)
    for i, t in enumerate(a["nodes_treeids"]):
        per_tree[t].append(i)

    split_counts = [0] * len(args.features.split(","))
    trees, n_nodes, n_leaves = [], 0, 0

    for t in sorted(per_tree):
        idxs = per_tree[t]
        # nodes_nodeids are per-tree ids; map them to dense positions in this tree's quad array.
        pos = {a["nodes_nodeids"][i]: k for k, i in enumerate(idxs)}
        flat: list[float] = []
        for i in idxs:
            nid = a["nodes_nodeids"][i]
            if modes[i] == "LEAF":
                flat += [-1, shortest_f32(weights[(t, nid)]), 0, 0]
                n_leaves += 1
            else:
                fid = a["nodes_featureids"][i]
                if fid < len(split_counts):
                    split_counts[fid] += 1
                flat += [
                    fid,
                    shortest_f32(a["nodes_values"][i]),
                    pos[a["nodes_truenodeids"][i]],
                    pos[a["nodes_falsenodeids"][i]],
                ]
            n_nodes += 1
        trees.append(flat)

    doc = {
        "format": FORMAT,
        "source_onnx": str(onnx_path.relative_to(REPO)) if onnx_path.is_relative_to(REPO) else onnx_path.name,
        "source_sha256": hashlib.sha256(onnx_path.read_bytes()).hexdigest(),
        "features": args.features.split(","),
        "branch_split_counts": split_counts,
        "n_trees": len(trees),
        "n_nodes": n_nodes,
        "n_leaves": n_leaves,
        "base_score": shortest_f32(base_values[0]),
        "post_transform": post,
        "node_layout": NODE_LAYOUT,
        "trees": trees,
    }

    pathlib.Path(args.out).write_text(json.dumps(doc, separators=(",", ":")))
    print(
        f"wrote {args.out}\n"
        f"  trees={doc['n_trees']} nodes={doc['n_nodes']} leaves={doc['n_leaves']} "
        f"base={doc['base_score']}\n"
        f"  split counts by feature: "
        + ", ".join(f"{n}={c}" for n, c in zip(doc["features"], split_counts))
        + f"\n  source_sha256={doc['source_sha256']}\n"
        f"\nNow run: python3 scripts/prescreen/verify_parity.py"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
