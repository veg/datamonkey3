#!/usr/bin/env python3
"""
verify_parity.py — prove the JS the browser runs reproduces XGBoost's own scoring of the exact
file the browser downloads.

WHAT CHANGED, AND WHY THIS SCRIPT IS A DIFFERENT KIND OF PROOF NOW

There used to be a converter: sklearn -> an interchange graph -> a converter script -> a coefficient
table -> a JS walker. This script's job was to prove two REPRESENTATIONS of one model agreed, and it
had a sha256 joining them so a regenerate-less model swap was caught. That whole limb is deleted.
DM3 now ships XGBoost's own `Booster.save_model()` output verbatim and walks it in ~40 lines of JS.

So there is only one artifact, and "two representations agree" is no longer a meaningful claim. The
claim now is: `xgbEnsemble.js` — the module the browser imports, not a reimplementation — walks
src/lib/services/prescreen/meme_gate.json to the same numbers `xgboost.Booster.predict` gets from
the same bytes. Both sides read the same file.

THE TRAP THAT SHAPES THIS SCRIPT

Because both sides read the same file, CORRUPTING THAT FILE DOES NOT MAKE THIS GATE FAIL. Both
sides would agree on the corrupt model and report parity. A negative test that nudges meme_gate.json
would "prove" a guard that cannot fail. Every mutation in --self-test is therefore ONE-SIDED: the JS
side is pointed at a corrupted COPY (score_gate.mjs takes an optional model path for exactly this
reason) while XGBoost scores the pristine shipped file.

Run --self-test BEFORE the real comparison. A green parity run means nothing until you know the
comparison is capable of going red.

WHAT REPLACES THE SHA256 JOIN KEY

Two things, and both are load-bearing (parity alone is blind to a model swap — it stays correctly
green because the walker still reproduces whatever it is handed):
  1. PIN — the sha256 of the artifact plus the structure derived from it (tree/node/leaf counts,
     depth, base score, per-feature split counts). This is what catches a swapped or hand-edited
     model. Reported separately from parity, because it fails for a completely different reason.
  2. CONTRACT — the model's own self-declared header, which a wrong model gets wrong: objective,
     booster, num_class, num_feature, num_trees, no categorical splits, no dropout weights, format
     major >= 2. This is strictly STRONGER than the old hash: a hash caught a mismatched pair, but
     would have happily accepted a multi:softprob, a DART booster, a 4-feature retrain or a 1.x
     export, because each would have arrived with a matching hash of itself.

NOTE ON THE CLIP: hitLikelihoodModel.MODEL_INPUT_CLIP floors median_pos_dist at 0.001 and caps it at
10 before scoring. It is deliberately NOT applied to the grid or the adversarial rows here, on either
side: this script compares the walker to XGBoost, and the clip is upstream of both, so applying it
would only narrow the inputs under test. (The production corpus rows ARE clipped, because there the
point is to reproduce the real scoring path on real geometry.)

Usage:
  python3 scripts/prescreen/verify_parity.py                  # the real comparison
  python3 scripts/prescreen/verify_parity.py --self-test      # prove it can fail  (run this FIRST)
  python3 scripts/prescreen/verify_parity.py --boundary       # `<` vs `<=`, on the real thresholds
  python3 scripts/prescreen/verify_parity.py --emit-golden    # regenerate golden.fixtures.json
  python3 scripts/prescreen/verify_parity.py --emit-golden --check   # verify it, don't write
Exit 0 on success, 1 on any failure.

The 3,000 real production rows live outside the repo. Point MEME_VALIDATION_TSV at them to include
them; without it this runs the synthetic grid and the adversarial rows only, and says so.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

try:
    import numpy as np
    import xgboost as xgb
except ImportError as exc:  # pragma: no cover - operator ergonomics only
    # Without this the gate fails on a clean machine with a bare ModuleNotFoundError, which reads
    # like a broken gate rather than a missing tool. `npm run verify:model-parity` calls plain
    # python3, and system python3 does not have xgboost.
    sys.exit(
        f"FAIL: {exc}\n"
        "This script needs the verification-only dependencies:\n"
        "  python3 -m pip install -r scripts/prescreen/requirements.txt\n"
        "They are NOT application dependencies — DM3 ships no ML runtime. xgboost is here purely as "
        "an independent second implementation of the walk, so CI can prove the shipped JS "
        "reproduces the library's own scoring of the same bytes."
    )

REPO = pathlib.Path(__file__).resolve().parents[2]
PRESCREEN = REPO / "src" / "lib" / "services" / "prescreen"
MODEL = PRESCREEN / "meme_gate.json"
META = PRESCREEN / "meme_gate.meta.json"
WALKER = PRESCREEN / "xgbEnsemble.js"
SCORER = REPO / "scripts" / "prescreen" / "score_gate.mjs"
GOLDEN = PRESCREEN / "golden.fixtures.json"
# The 3,000 real production jobs. They are the most valuable third of the comparison — the only
# rows carrying real submission geometry — and they live outside the repo because they are
# production data. Overridable, and it is the SAME environment variable the vitest calibration
# block reads (src/test/meme-hit-likelihood.test.js), so one export covers both. Without it this
# script prints a NOTE and compares the synthetic grid plus the adversarial rows only.
CORPUS = pathlib.Path(
    os.environ.get(
        "MEME_VALIDATION_TSV",
        str(REPO.parent / "datamonkey-test-corpus" / "meme_validation.tsv"),
    )
)

# Must track LIKELY_MIN / UNLIKELY_MAX in hitLikelihoodModel.js. Asserted by
# check_thresholds_match_source() — these are not the source of truth, the JS is.
# Note the formatting trap there: these are interpolated with str(), so 0.70 renders as "0.7" and
# the JS must be written `= 0.7` for the grep to find it.
LIKELY_MIN = 0.70
UNLIKELY_MAX = 0.10

# The feature contract, asserted against every artifact that writes it down rather than assumed.
FEATURES = ["num_seqs", "num_sites", "median_pos_dist"]

# The clip the app applies before scoring (hitLikelihoodModel.MODEL_INPUT_CLIP / the sidecar's
# bl_floor & bl_cap). Applied only to the production corpus rows — see the docstring.
BL_FLOOR, BL_CAP = 0.001, 10.0

# --- THE PIN -----------------------------------------------------------------------------------
# What the shipped artifact IS. Not a parity assertion: parity reads the same file on both sides and
# stays green through a model swap. This is what notices the swap. On an INTENDED retrain, update
# these together with the calibration numbers in hitLikelihoodModel.js and regenerate the golden
# fixtures — that coupling is the point, a retrain should not be a one-file change.
PIN = {
    "sha256": "11c6eb47c106897adc3285eae8ef3a00a783e768ef94ab8bb7049af2f7b4e64f",
    "nTrees": 500,
    "nNodes": 9546,
    "nLeaves": 5023,
    "maxDepth": 7,
    "baseScore": 0.8516667,
    "defaultLeftNodes": 0,
    "splitCountsByFeature": {"num_seqs": 1481, "num_sites": 1756, "median_pos_dist": 1286},
}

# Tolerance. Measured on this artifact: max |JS - XGBoost| = 4.4e-07, mean 7.8e-08. The residual is
# float32 (XGBoost accumulates leaf values in float32) vs float64 (the walker accumulates in
# float64) and is 20x below this tolerance.
#
# The delta assertion is the DECORATIVE one and the band assertion is the binding one, deliberately.
# A delta inside tolerance could still cross a cut in principle, and the band is what a researcher
# actually reads. Measured margin for context: the closest any reachable score comes to a band edge
# is ~4.5e-04, three orders above the observed delta. That margin is a property of THIS model's
# reachable outputs, not a theorem — a retrain with more trees narrows the output spacing — which is
# exactly why the band agreement is asserted directly instead of being inferred from the ratio.
TOLERANCE = 1e-5


def band(p: np.ndarray) -> np.ndarray:
    """2 = likely, 1 = uncertain, 0 = unlikely — the only thing the user actually sees."""
    return np.where(p >= LIKELY_MIN, 2, np.where(p < UNLIKELY_MAX, 0, 1))


# ------------------------------------------------------------------------------------------------
# Row construction
# ------------------------------------------------------------------------------------------------


def grid_rows() -> list[list[float]]:
    """
    2,520-point deterministic grid (15 x 12 x 14).

    Chosen to straddle THIS model's real split ranges, which were measured from the shipped file:
    num_seqs [4, 298], num_sites [20, 3687], median_pos_dist [0.00102927, 0.4023226]. It includes
    the saturation shoulders on all three axes and both MODEL_INPUT_CLIP endpoints (0.001 and 10.0),
    so the rows where the walker and XGBoost are most likely to route differently are covered on
    purpose rather than by luck.
    """
    seqs = [3, 4, 5, 8, 10, 17, 25, 40, 60, 100, 150, 196, 300, 500, 1000]
    sites = [1, 8, 17, 50, 100, 200, 300, 600, 1000, 1320, 2000, 5000]
    dists = [0.001, 0.0015, 0.003, 0.005, 0.008, 0.01, 0.02, 0.05, 0.08, 0.12, 0.18, 0.3, 1.0, 10.0]
    return [[float(a), float(b), float(c)] for a in seqs for b in sites for c in dists]


def corpus_rows() -> list[list[float]]:
    """
    Every real production job, clipped exactly as clipModelInput clips. Real submission geometry is
    what a synthetic grid cannot invent. Skipped (loudly) when the corpus is not on this machine —
    it lives outside the repo, so CI runs the grid + adversarial blocks only.
    """
    if not CORPUS.exists():
        return []
    import csv

    rows = []
    with CORPUS.open() as fh:
        for r in csv.DictReader(fh, delimiter="\t"):
            bl = min(max(float(r["med_bl"]), BL_FLOOR), BL_CAP)
            rows.append([float(r["nseq"]), float(r["nsites"]), bl])
    return rows


def adversarial_rows() -> list[list[float]]:
    """
    Domain edges, parse-failure sentinels, saturation points and values sitting exactly on this
    model's real split thresholds. These still have to AGREE across the two implementations even
    where the app's own domain guard would refuse to score them.
    """
    return [
        [0, 0, 0.0],
        [2, 1, 0.0],
        [50, 200, -0.02],  # negative distance — the 0.0 "no branch lengths" sentinel
        [3, 1, 1e-9],  # FEATURE_DOMAIN minima
        [500, 2000, 10.0],  # BL_CAP exactly
        [500, 2000, 10.000001],  # one step outside it
        [4, 20, 0.00102927],  # the LOWEST split threshold on each feature, exactly
        [298, 3687, 0.4023226],  # the HIGHEST split threshold on each feature, exactly
        [196, 1320, 0.1803],
        [1e9, 1e9, 1e9],
        [3, 1, 3.4e38],
        [50, 500, 1e-38],
    ]


# ------------------------------------------------------------------------------------------------
# The two implementations
# ------------------------------------------------------------------------------------------------


def js_scores(rows: list[list[float]], model_path: pathlib.Path = MODEL):
    """Score through the SHIPPED module, in a subprocess, exactly as the browser would call it."""
    cmd = ["node", str(SCORER)]
    if model_path != MODEL:
        cmd.append(str(model_path))
    proc = subprocess.run(
        cmd, input=json.dumps({"rows": rows}), capture_output=True, text=True
    )
    if proc.returncode != 0:
        sys.exit(f"FAIL: the JS walker errored.\n{proc.stderr.strip()}")
    out = json.loads(proc.stdout)
    return np.array(out["scores"], dtype=float), out["meta"]


def js_refuses(rows, model_path: pathlib.Path) -> tuple[bool, str]:
    """
    Run the JS walker and report whether it REFUSED (non-zero exit), plus the message it refused
    with. The message matters: a refusal for the wrong reason is not a passing test, and naming it
    in the CI log is the only way that is visible.

    Pick the `Error: ...` line, not the first line of the stack — node echoes the offending SOURCE
    line first, so the naive `first line containing 'meme_gate.json'` picks the literal text of the
    `throw` statement and every refusal reads identically.
    """
    cmd = ["node", str(SCORER)]
    if model_path != MODEL:
        cmd.append(str(model_path))
    proc = subprocess.run(
        cmd, input=json.dumps({"rows": rows}), capture_output=True, text=True
    )
    lines = [l.strip() for l in proc.stderr.strip().splitlines()]
    msg = next((l for l in lines if l.startswith("Error:")), lines[0] if lines else "")
    return proc.returncode != 0, msg.removeprefix("Error: meme_gate.json: ").removeprefix("Error: ")


def js_refuses_nonfinite(literal: str) -> tuple[bool, str]:
    """
    Non-finite features cannot travel through the JSON transport score_gate.mjs uses — `NaN` and
    `Infinity` are not JSON, and Python's json.dumps emits them as bare tokens that node's
    JSON.parse rejects. Feeding them that way "passes" for entirely the wrong reason: the refusal
    comes from the JSON parser, not from the walker's finite check, and the test would stay green
    if evalXgbModel's guard were deleted.

    So call the walker DIRECTLY with a real JS NaN/Infinity.
    """
    src = (
        f"import {{ prepareXgbModel, evalXgbModel }} from {json.dumps(str(WALKER))};"
        f"import {{ readFileSync }} from 'node:fs';"
        f"const m = prepareXgbModel(JSON.parse(readFileSync({json.dumps(str(MODEL))}, 'utf8')));"
        f"console.log(evalXgbModel(m, {literal}));"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", src], capture_output=True, text=True
    )
    lines = [l.strip() for l in proc.stderr.strip().splitlines()]
    msg = next((l for l in lines if l.startswith("Error:")), lines[0] if lines else "")
    return proc.returncode != 0, msg.removeprefix("Error: meme_gate.json: ").removeprefix("Error: ")


def xgb_scores(rows: list[list[float]], model_path: pathlib.Path = MODEL) -> np.ndarray:
    bst = xgb.Booster()
    bst.load_model(str(model_path))
    return bst.inplace_predict(np.array(rows, dtype=np.float32)).astype(float)


def js_scores_with_le(rows: list[list[float]]) -> np.ndarray:
    """
    The same walk with `<` replaced by `<=`, over the SAME compiled trees.

    Not a reimplementation: it calls the shipped `prepareXgbModel`, so the only difference from
    evalXgbModel is the comparison operator. That is what makes --boundary evidence about the
    operator rather than about two separately-written walkers.
    """
    src = (
        f"import {{ prepareXgbModel }} from {json.dumps(str(WALKER))};"
        f"import {{ readFileSync }} from 'node:fs';"
        f"const m = prepareXgbModel(JSON.parse(readFileSync({json.dumps(str(MODEL))}, 'utf8')));"
        "const rows = JSON.parse(readFileSync(0, 'utf8')).rows;"
        "const out = rows.map((r) => {"
        "  const x = r.map(Math.fround);"
        "  let margin = m.base;"
        "  for (const t of m.trees) {"
        "    let i = 0;"
        "    while (t.left[i] !== -1) i = x[t.feat[i]] <= t.thr[i] ? t.left[i] : t.right[i];"
        "    margin += t.thr[i];"
        "  }"
        "  return 1 / (1 + Math.exp(-margin));"
        "});"
        "process.stdout.write(JSON.stringify(out));"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", src],
        input=json.dumps({"rows": rows}),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.exit(f"FAIL: the `<=` probe errored.\n{proc.stderr.strip()}")
    return np.array(json.loads(proc.stdout), dtype=float)


def split_thresholds(doc: dict) -> list[list[float]]:
    """Every DISTINCT split threshold in the model, per feature, as float32-exact float64 values."""
    trees = doc["learner"]["gradient_booster"]["model"]["trees"]
    out = [set() for _ in FEATURES]
    for t in trees:
        for i, l in enumerate(t["left_children"]):
            if l != -1:
                out[t["split_indices"][i]].add(float(np.float32(t["split_conditions"][i])))
    return [sorted(s) for s in out]


# ------------------------------------------------------------------------------------------------
# --boundary: `<` vs `<=`, on the only inputs that can tell them apart
# ------------------------------------------------------------------------------------------------


HOLDOUTS = [
    [4.0, 10.0, 50.0, 300.0],
    [20.0, 200.0, 1000.0, 3000.0],
    [0.001, 0.01, 0.1, 1.0],
]


def boundary_rows(doc: dict) -> tuple[list[list[float]], list[str]]:
    """
    Rows in which at least one feature sits EXACTLY on a real split value of this model.

    These are the only inputs in existence that distinguish `<` from `<=`. Everywhere else the two
    operators route identically, which is why a comparison-operator bug survives any amount of
    random or grid testing and is certain to be caught here.

    Two families, because one alone is weak:
      - ONE AXIS ON A THRESHOLD, crossed with a spread of ordinary values on the other two. A single
        holdout point would make the result an accident of that point; 16 of them make the count
        stable and give the flipped operator room to move a band rather than just a decimal.
      - ALL THREE AXES ON A THRESHOLD AT ONCE, which is where the flip compounds and is the shape
        golden.fixtures.json groups 3 and 4 pin.
    """
    thresholds = split_thresholds(doc)
    rows, labels = [], []
    for f, values in enumerate(thresholds):
        o1, o2 = [i for i in range(len(FEATURES)) if i != f]
        for v in values:
            for a in HOLDOUTS[o1]:
                for b in HOLDOUTS[o2]:
                    row = [0.0, 0.0, 0.0]
                    row[f] = v
                    row[o1] = a
                    row[o2] = b
                    rows.append(row)
                    labels.append(FEATURES[f])
    n = min(len(t) for t in thresholds)
    for i in range(n):
        rows.append([thresholds[0][i], thresholds[1][i], thresholds[2][i]])
        labels.append("all three")
    return rows, labels


def boundary_test() -> int:
    """
    Prove two things at once, which is why this is a gate and not a print-out:
      1. The SHIPPED walker (`<`) reproduces XGBoost on every on-threshold row. If `<` were the
         wrong operator, this is where it shows.
      2. `<=` DOES disagree, on a lot of them. Without this half the rows might simply be
         insensitive, and assertion 1 would be passing for free.
    """
    doc = json.loads(MODEL.read_text())
    rows, labels = boundary_rows(doc)
    print(f"=== BOUNDARY: {len(rows)} rows sitting exactly on one of this model's own split thresholds ===")
    print(f"  rows per on-threshold axis: { {k: labels.count(k) for k in FEATURES + ['all three']} }")

    py = xgb_scores(rows)
    js, _ = js_scores(rows)
    le = js_scores_with_le(rows)

    shipped_delta = float(np.nanmax(np.abs(js - py)))
    shipped_bands = int((band(js) != band(py)).sum())
    le_rows = int((np.abs(le - py) > 1e-6).sum())
    le_bands = int((band(le) != band(py)).sum())

    print(f"  shipped `<`   max|Δ| vs xgboost = {shipped_delta:.3e}   band disagreements = {shipped_bands}")
    print(f"  flipped `<=`  differs on {le_rows} of {len(rows)} rows   band moves = {le_bands}")

    failures = []
    if shipped_delta > TOLERANCE or shipped_bands:
        failures.append(
            f"the shipped walker disagrees with XGBoost on values sitting exactly on a split "
            f"threshold (max|Δ| {shipped_delta:.3e}, {shipped_bands} band moves) — `<` vs `<=` is "
            "the first thing to check"
        )
    if le_rows == 0:
        failures.append(
            "flipping `<` to `<=` changed NOTHING on these rows, so they cannot distinguish the two "
            "operators and assertion 1 above is vacuous"
        )
    if failures:
        print("\nFAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "\nOK — `<` reproduces XGBoost on every on-threshold row, and `<=` does not. This is the "
        "evidence xgbEnsemble.js cites for `x[feat[i]] < thr[i]`."
    )
    return 0


# ------------------------------------------------------------------------------------------------
# Monotonicity — a user-facing claim, so it is measured rather than taken from the training config
# ------------------------------------------------------------------------------------------------


def check_monotone(doc: dict) -> list[str]:
    """
    "Adding sequences, adding codons, or deeper branches can raise it and never lower it" is a
    sentence a researcher reads in the panel. It is true because the model was fit with
    `monotone_constraints=(1, 1, 1)` — but `Booster.save_model()` DOES NOT PERSIST that setting.
    `grep monotone meme_gate.json` comes back empty. So the only record of it in this repo is a free
    text field in meme_gate.meta.json, which no assertion read until this one.

    That is the same shape as every other claim the PIN block exists to kill: provenance asserted in
    prose. So the property is measured on the shipped artifact instead of being taken on trust.

    The grid is not arbitrary. A tree ensemble can only change its answer at a split threshold, so
    the axis under test walks EVERY DISTINCT THRESHOLD of that feature plus one float32 step either
    side of each — i.e. every routing-distinct value the model has — while the other two features
    are held at a spread of ordinary values. A monotonicity break anywhere in the reachable input
    space has to show up between two adjacent points of that sweep.
    """
    thresholds = split_thresholds(doc)
    holds = [
        [4.0, 10.0, 50.0, 300.0],
        [20.0, 200.0, 1000.0, 3000.0],
        [0.001, 0.01, 0.1, 1.0],
    ]
    problems = []
    total = 0
    for f in range(len(FEATURES)):
        axis = set()
        for v in thresholds[f]:
            v32 = np.float32(v)
            axis.add(float(np.nextafter(v32, np.float32(-np.inf))))
            axis.add(float(v32))
            axis.add(float(np.nextafter(v32, np.float32(np.inf))))
        axis = sorted(axis)
        o1, o2 = [i for i in range(len(FEATURES)) if i != f]
        rows, groups = [], []
        for a in holds[o1]:
            for b in holds[o2]:
                for x in axis:
                    row = [0.0, 0.0, 0.0]
                    row[f] = x
                    row[o1] = a
                    row[o2] = b
                    rows.append(row)
                groups.append((a, b))
        scores = xgb_scores(rows).reshape(len(groups), len(axis))
        total += scores.size - len(groups)
        drops = np.diff(scores, axis=1)
        worst = float(drops.min())
        if worst < -1e-9:
            g, i = np.unravel_index(int(np.argmin(drops)), drops.shape)
            problems.append(
                f"NOT MONOTONE in {FEATURES[f]}: holding the other two at {groups[g]}, the score "
                f"FALLS by {-worst:.3e} between {axis[i]} and {axis[i + 1]}. The panel tells users "
                "'adding sequences, adding codons, or deeper branches can raise it and never lower "
                "it' — that sentence has to come out with this model."
            )
    if not problems:
        print(f"  monotone non-decreasing in all {len(FEATURES)} features over {total:,} adjacent-pair comparisons")
        print("    (every distinct split threshold on each axis, +/- one float32 step, x 16 holdouts)")
    return problems


# ------------------------------------------------------------------------------------------------
# Contract / pin / arity checks
# ------------------------------------------------------------------------------------------------


def check_thresholds_match_source() -> list[str]:
    """
    The band edges live in JS; this script hard-codes them. Catch the drift.

    The trailing semicolon is load-bearing. Without it this is a PREFIX match, and since str(0.10)
    is "0.1", a JS file that had drifted to `= 0.15` would satisfy a search for `= 0.1` and this
    check would report green on precisely the change it exists to catch.
    """
    src = (PRESCREEN / "hitLikelihoodModel.js").read_text()
    problems = []
    for name, want in (("LIKELY_MIN", LIKELY_MIN), ("UNLIKELY_MAX", UNLIKELY_MAX)):
        if f"export const {name} = {want};" not in src:
            problems.append(
                f"{name} in hitLikelihoodModel.js no longer matches {want} as assumed here"
            )
    return problems


def check_arity(doc: dict) -> list[str]:
    """
    Every place the feature contract is written down must agree.

    This is the check that keeps the rest of the script from going vacuous. The walker is the only
    side that enforces arity at score time, and only because it was given an explicit guard: a bare
    tree walk indexes a row of the wrong width WITHOUT ERROR in both directions — a 4-wide row into
    a 3-feature model never touches the extra slot, and a 3-wide row into a 4-feature model routes
    every split on the missing feature by `undefined < threshold` (false), i.e. consistently right.
    Neither would look like anything but parity.
    """
    problems = []
    n = len(FEATURES)

    meta = json.loads(META.read_text())
    if meta.get("features") != FEATURES:
        problems.append(f"meme_gate.meta.json declares features {meta.get('features')}, expected {FEATURES}")
    if (meta.get("bl_floor"), meta.get("bl_cap")) != (BL_FLOOR, BL_CAP):
        problems.append(
            f"meme_gate.meta.json declares bl_floor/bl_cap "
            f"{meta.get('bl_floor')}/{meta.get('bl_cap')}, but MODEL_INPUT_CLIP here is {BL_FLOOR}/{BL_CAP}"
        )

    declared = doc["learner"]["learner_model_param"].get("num_feature")
    if str(declared) != str(n):
        problems.append(f"the model declares num_feature={declared}, expected {n}")

    src = WALKER.read_text()
    want_feats = (
        "export const EXPECTED_FEATURES = [" + ", ".join(f"'{f}'" for f in FEATURES) + "];"
    )
    if want_feats not in src:
        problems.append(f"xgbEnsemble.js no longer declares EXPECTED_FEATURES = {FEATURES}")
    if "export const EXPECTED_FEATURE_COUNT = EXPECTED_FEATURES.length;" not in src:
        problems.append("xgbEnsemble.js no longer derives EXPECTED_FEATURE_COUNT from EXPECTED_FEATURES")

    src = (PRESCREEN / "hitLikelihoodModel.js").read_text()
    want = "export const FEATURE_NAMES = [" + ", ".join(f"'{f}'" for f in FEATURES) + "];"
    if want not in src:
        problems.append("FEATURE_NAMES in hitLikelihoodModel.js no longer matches " + str(FEATURES))

    # And prove the walker actually REFUSES a wrong-width row rather than scoring it quietly.
    refused, _ = js_refuses([[50, 200, 0.02, 1.0]], MODEL)
    if not refused:
        problems.append(
            "the JS walker scored a 4-wide row against a 3-feature model instead of throwing — "
            "the arity guard in xgbEnsemble.js is gone, and this script can no longer detect drift"
        )
    return problems


def check_format_majors(doc: dict) -> list[str]:
    """
    The format-major window, read out of the JS rather than restated here.

    THIS USED TO BE THE ONE PLACE THE CI GATE WAS STRICTER THAN THE BROWSER. This script refused a
    1.x export by name; xgbEnsemble.js accepted it. Since the browser is the only thing that
    actually loads a model, being stricter here bought nothing — so the window now has exactly one
    definition (SUPPORTED_FORMAT_MAJORS in xgbEnsemble.js) and this reads it, which makes any future
    widening visible in this gate's log instead of only in a diff.

    Why 1.x specifically must stay out: before XGBoost 2, `learner_model_param.base_score` is
    serialised in MARGIN space, so the walker's `log(p / (1 - p))` is applied to a number that has
    already had the link applied. It does not throw — it rescales every score in the model. The
    (0, 1) range guard in parseBaseScore catches only the margins that fall outside (0, 1); the ones
    inside it are the dangerous half.
    """
    problems = []
    src = WALKER.read_text()
    m = re.search(r"const SUPPORTED_FORMAT_MAJORS = \[([0-9,\s]+)\];", src)
    if not m:
        return [
            "could not find SUPPORTED_FORMAT_MAJORS in xgbEnsemble.js — the walker's version window "
            "is no longer readable from here, so this check has gone blind"
        ]
    majors = sorted(int(x) for x in m.group(1).split(","))
    if any(v < 2 for v in majors):
        problems.append(
            f"xgbEnsemble.js accepts format major(s) {majors}: before XGBoost 2, base_score is a "
            "MARGIN, not a probability, and the walker's logit() silently rescales every score"
        )
    actual = int(doc["version"][0])
    if actual not in majors:
        problems.append(
            f"the model declares format version {doc['version']}, which xgbEnsemble.js does not "
            f"accept (SUPPORTED_FORMAT_MAJORS = {majors})"
        )
    return problems


def check_contract(doc: dict) -> list[str]:
    """
    The model's own self-declared header. What a WRONG model gets wrong.

    Each of these is a construct the walker would score without erroring and wrongly, so each is
    refused rather than approximated. xgbEnsemble.js enforces all of them at load; asserting them
    here as well means a bad model is named in CI's log by the thing that is wrong with it, rather
    than surfacing as a stack trace out of a node subprocess.
    """
    problems = []
    L = doc["learner"]
    lmp = L["learner_model_param"]
    gb = L["gradient_booster"]

    if L["objective"]["name"] != "binary:logistic":
        problems.append(f"objective is {L['objective']['name']!r}, expected 'binary:logistic'")
    if gb["name"] != "gbtree":
        problems.append(f"booster is {gb['name']!r}, expected 'gbtree'")
    if str(lmp.get("num_class", "0")) not in ("0", "1"):
        problems.append(f"num_class={lmp.get('num_class')} — this is not a binary model")
    if str(lmp.get("num_target", "1")) != "1":
        problems.append(f"num_target={lmp.get('num_target')} — multi-output model")
    problems += check_format_majors(doc)

    model = gb["model"]
    trees = model["trees"]
    declared_trees = model.get("gbtree_model_param", {}).get("num_trees")
    if declared_trees is not None and int(declared_trees) != len(trees):
        problems.append(f"num_trees={declared_trees} but {len(trees)} trees present")
    if str(model.get("gbtree_model_param", {}).get("num_parallel_tree", "1")) != "1":
        problems.append("num_parallel_tree != 1 — forest mode AVERAGES trees, the walker sums them")
    if any(g != 0 for g in model.get("tree_info", [])):
        problems.append("tree_info has more than one output group — multi-class/multi-output")

    # Categorical splits, checked from all three independent places 3.4 records them. On this model
    # tree 0's categories_nodes is empty while a categorical model can still carry per-node
    # split_type, so no one of these is sufficient on its own.
    if any(t.get("split_type") and any(s != 0 for s in t["split_type"]) for t in trees):
        problems.append("a tree carries a categorical split (split_type != 0) — not implemented")
    if any(t.get("categories_nodes") for t in trees):
        problems.append("a tree carries categories_nodes — categorical splits are not implemented")
    cats = model.get("cats") or {}
    if any(e.get("values") for e in (cats.get("enc") or []) if isinstance(e, dict)):
        problems.append("the model carries a categorical encoding table (cats.enc)")

    # DROPOUT — belt and braces. xgboost 3.4 writes booster='dart' / rate_drop models with
    # gradient_booster.name == 'gbtree', so the obvious check passes them straight through. The only
    # trace is gradient_booster.model.weight_drop, a per-tree multiplier applied AT PREDICT TIME;
    # summing leaves without it is wrong by ~0.18 in probability, which is band-moving. The path is
    # version-specific, so also grep the raw bytes in case a future release relocates the key.
    wd = model.get("weight_drop")
    if isinstance(wd, list) and any(w != 1 for w in wd):
        problems.append(f"weight_drop present with {len(wd)} non-unit entries — this is a DART/rate_drop model")
    if "weight_drop" in MODEL.read_text() and not isinstance(wd, list):
        problems.append("'weight_drop' appears in the file but not at gradient_booster.model — the dropout check has gone blind")

    return problems


def check_pin(meta: dict) -> list[str]:
    """
    Every comparison here is written to REPORT a bad value rather than to blow up on one. The point
    of this whole script is that a bad model is named in CI's log by the thing that is wrong with
    it; a traceback out of a subprocess boundary is the opposite of that. `meta` arrives as JSON
    from node, so a NaN on the JS side deserialises as `null` — and `abs(None - 0.85)` used to end
    the run with a TypeError at this line instead of saying "baseScore is null".
    """
    problems = []
    digest = hashlib.sha256(MODEL.read_bytes()).hexdigest()
    if digest != PIN["sha256"]:
        problems.append(
            f"meme_gate.json sha256 is {digest}, pinned {PIN['sha256']}. If this is an INTENDED "
            "retrain: update PIN here, re-derive the band rates in hitLikelihoodModel.js against "
            "the new model, and regenerate golden.fixtures.json (--emit-golden)."
        )
    for k in ("nTrees", "nNodes", "nLeaves", "maxDepth", "defaultLeftNodes", "splitCountsByFeature"):
        if meta.get(k) != PIN[k]:
            problems.append(f"{k}: model has {meta.get(k)!r}, pinned {PIN[k]!r}")
    base = meta.get("baseScore")
    if not isinstance(base, (int, float)) or isinstance(base, bool) or not np.isfinite(base):
        problems.append(
            f"baseScore: the walker reported {base!r}, which is not a finite number — base_score "
            "parsing is broken (JSON.stringify writes NaN as null), pinned {}".format(PIN["baseScore"])
        )
    elif abs(base - PIN["baseScore"]) > 1e-9:
        problems.append(f"baseScore: model has {base}, pinned {PIN['baseScore']}")
    return problems


# ------------------------------------------------------------------------------------------------
# Golden fixtures
# ------------------------------------------------------------------------------------------------

# The vectors the unit suite pins the walker against. FOUR groups, and the last two are the ones
# that make the fixture file a test rather than a recording.
#
# 1. ORDINARY GEOMETRY (15). Kept deliberately stable across the model swap so the diff reads as
#    "same inputs, new probabilities". The first 12 are the vectors the previous model was pinned
#    against (minus the dropped 4th feature); the next 3 were added to give the <0.10 band real
#    coverage — under this model the original 12 no longer reach it.
#
# 2. BAND-CUT BRACKETS (4). Two rows either side of 0.10 and two either side of 0.70, each within
#    5e-4 of its cut — 1000x the observed |JS - XGBoost| delta of 4.4e-07, so they are the closest
#    the walker ever gets to disagreeing with XGBoost about what a USER SEES. Without these the
#    fixtures only ever check probabilities in the flat middle of a band, where a routing bug has to
#    be enormous before it changes anything visible.
#
# 3. EXACTLY ON SPLIT THRESHOLDS (5). Every value is a real threshold from this model, on all three
#    features at once — the lowest on each axis, the three most frequent low ones, a mid one, a
#    high-frequency high one, and the highest on each axis. XGBoost routes `feature < threshold`
#    LEFT, so a value sitting exactly on a threshold goes RIGHT. Flip the walker's `<` to `<=` and
#    every one of these five moves: measured, they go 0.000274 -> 3.01e-05, 0.00515 -> 0.000108,
#    0.9281 -> 0.8745, 0.99988 -> 0.99879, 0.99997 -> 0.99992. A comparison-operator bug is
#    invisible on random inputs and certain on these.
#
# 4. ONE FLOAT32 ULP BELOW THOSE THRESHOLDS (5). The other half of the same test: these must route
#    LEFT. Group 3 alone would also pass if the walker compared `>` on the wrong child; group 3 and
#    group 4 together pin the direction. They are written as the exact float64 repr of a float32
#    value, so `Math.fround` in the walker and `np.float32` here land on the same bits.
GOLDEN_INPUTS = [
    # --- 1. ordinary geometry -------------------------------------------------------------------
    [100.0, 300.0, 0.05],
    [5.0, 100.0, 0.005],
    [50.0, 200.0, 0.02],
    [10.0, 50.0, 0.01],
    [318.0, 600.0, 0.12],
    [58.0, 150.0, 0.008],
    [20.0, 80.0, 0.03],
    [200.0, 400.0, 0.09],
    [8.0, 30.0, 0.002],
    [500.0, 1000.0, 0.2],
    [3.0, 10.0, 0.001],
    [75.0, 250.0, 0.045],
    [4.0, 120.0, 0.0021],
    [3.0, 138.0, 0.0015],
    [5.0, 60.0, 0.0012],
    # --- 2. band-cut brackets -------------------------------------------------------------------
    [4.0, 250.0, 0.005385],  # 0.099815 — 'unlikely', 1.8e-04 under the 0.10 cut
    [4.0, 200.0, 0.005872],  # 0.100180 — 'uncertain', 1.8e-04 over it
    [5.0, 150.0, 0.185128],  # 0.699553 — 'uncertain', 4.5e-04 under the 0.70 cut
    [11.0, 250.0, 0.002949],  # 0.700151 — 'likely', 1.5e-04 over it
    # --- 3. exactly on a split threshold, all three axes at once ---------------------------------
    [4.0, 20.0, 0.0010292699],  # the LOWEST threshold on each feature
    [5.0, 20.0, 0.001597865],  # the most frequent threshold on each feature (155 / 167 / 94 splits)
    [10.0, 304.0, 0.040265847],
    [223.0, 753.0, 0.19062318],
    [298.0, 3687.0, 0.4023226],  # the HIGHEST threshold on each feature
    # --- 4. one float32 ULP below each of those --------------------------------------------------
    [3.999999761581421, 19.999998092651367, 0.0010292697697877884],
    [4.999999523162842, 19.999998092651367, 0.0015978649025782943],
    [9.999999046325684, 303.9999694824219, 0.04026584327220917],
    [222.99998474121094, 752.9999389648438, 0.19062316417694092],
    [297.9999694824219, 3686.999755859375, 0.40232256054878235],
]


def build_golden() -> dict:
    """
    Generated from xgboost.predict, NEVER from the JS walker — otherwise the fixtures would be a
    recording of the thing they are supposed to check. `generated_from` records that, so a future
    regeneration from the JS side is visible in the diff rather than silent.
    """
    probs = xgb_scores(GOLDEN_INPUTS)
    levels = ["likely", "uncertain", "unlikely"]
    return {
        "generated_from": "xgboost:meme_gate.json",
        "generator": "scripts/prescreen/verify_parity.py --emit-golden",
        "xgboost_version": xgb.__version__,
        "model_sha256": hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        "features": FEATURES,
        "likely_min": LIKELY_MIN,
        "unlikely_max": UNLIKELY_MAX,
        "vectors": [
            {
                "input": row,
                "expected_prob": float(p),
                "expected_level": levels[2 - int(band(np.array([p]))[0])],
            }
            for row, p in zip(GOLDEN_INPUTS, probs)
        ],
    }


def golden_coverage_problems(doc: dict) -> list[str]:
    """
    The fixtures are only worth committing if they still exercise the places a walker bug shows up.
    Asserted rather than trusted, because the failure mode is silent: someone prunes a vector that
    "looks redundant" and the file keeps passing while testing strictly less.
    """
    problems = []
    vectors = doc["vectors"]
    covered = {v["expected_level"] for v in vectors}
    if covered != {"likely", "uncertain", "unlikely"}:
        problems.append(f"covers only {sorted(covered)} — all three bands must appear")

    # Either side of both cuts, close enough that the band assignment is the thing under test.
    for cut, name in ((UNLIKELY_MAX, "unlikely/uncertain"), (LIKELY_MIN, "uncertain/likely")):
        near = [v for v in vectors if abs(v["expected_prob"] - cut) < 1e-3]
        below = [v for v in near if v["expected_prob"] < cut]
        above = [v for v in near if v["expected_prob"] >= cut]
        if not below or not above:
            problems.append(
                f"no pair straddling the {name} cut at {cut} within 1e-3 "
                f"({len(below)} below, {len(above)} above) — the band edges are untested"
            )

    # Values sitting exactly on a real split threshold, which is the only input that can tell `<`
    # from `<=`. Read the thresholds out of the model rather than hard-coding them here.
    doc_model = json.loads(MODEL.read_text())
    trees = doc_model["learner"]["gradient_booster"]["model"]["trees"]
    thresholds = [set(), set(), set()]
    for t in trees:
        for i, l in enumerate(t["left_children"]):
            if l != -1:
                thresholds[t["split_indices"][i]].add(np.float32(t["split_conditions"][i]))
    on_threshold = [
        v for v in vectors
        if all(np.float32(v["input"][f]) in thresholds[f] for f in range(len(FEATURES)))
    ]
    if len(on_threshold) < 3:
        problems.append(
            f"only {len(on_threshold)} vector(s) sit exactly on a split threshold on all "
            f"{len(FEATURES)} features — a `<` vs `<=` bug in the walker is invisible without them"
        )
    return problems


def emit_golden(check_only: bool) -> int:
    fresh = build_golden()
    coverage = golden_coverage_problems(fresh)
    if coverage:
        print("FAIL: golden fixtures no longer cover what they exist to cover:")
        for p in coverage:
            print(f"  - {p}")
        return 1
    covered = {v["expected_level"] for v in fresh["vectors"]}
    if not check_only:
        GOLDEN.write_text(json.dumps(fresh, indent=2) + "\n")
        print(f"wrote {GOLDEN.relative_to(REPO)} ({len(fresh['vectors'])} vectors, bands {sorted(covered)})")
        return 0

    if not GOLDEN.exists():
        print(f"FAIL: {GOLDEN.relative_to(REPO)} does not exist. Run --emit-golden.")
        return 1
    have = json.loads(GOLDEN.read_text())
    problems = []
    for k in ("generated_from", "model_sha256", "features", "likely_min", "unlikely_max"):
        if have.get(k) != fresh[k]:
            problems.append(f"{k}: committed {have.get(k)!r} != {fresh[k]!r}")
    if len(have.get("vectors", [])) != len(fresh["vectors"]):
        problems.append(f"vector count {len(have.get('vectors', []))} != {len(fresh['vectors'])}")
    else:
        for a, b in zip(have["vectors"], fresh["vectors"]):
            if a["input"] != b["input"]:
                problems.append(f"input {a['input']} != {b['input']}")
            elif abs(a["expected_prob"] - b["expected_prob"]) > 1e-12:
                problems.append(
                    f"{a['input']}: committed {a['expected_prob']:.12f} != model {b['expected_prob']:.12f}"
                )
            elif a.get("expected_level") != b["expected_level"]:
                problems.append(f"{a['input']}: level {a.get('expected_level')} != {b['expected_level']}")
    if problems:
        print("GOLDEN FIXTURES STALE:")
        for p in problems:
            print(f"  - {p}")
        print("\nRegenerate with: python3 scripts/prescreen/verify_parity.py --emit-golden")
        return 1
    print(f"OK: {len(have['vectors'])} golden fixtures still match xgboost's scoring of meme_gate.json.")
    return 0


# ------------------------------------------------------------------------------------------------
# The comparison
# ------------------------------------------------------------------------------------------------


def compare(js_model: pathlib.Path, quiet: bool = False) -> tuple[bool, float, int]:
    """
    Score every block through both implementations and report. `js_model` is the file the JS side
    reads; XGBoost always reads the pristine shipped model. They differ only under --self-test.
    """
    blocks = [("grid (15 x 12 x 14)", grid_rows())]
    corpus = corpus_rows()
    if corpus:
        blocks.append(("real production jobs", corpus))
    blocks.append(("adversarial / on-threshold", adversarial_rows()))

    worst, disagreements, total, closest, nonfinite = 0.0, 0, 0, 1.0, 0
    for name, rows in blocks:
        py = xgb_scores(rows)
        js, _ = js_scores(rows, js_model)
        # NaN IS A FAILURE, NOT A ZERO. `max(0.0, nan)` is 0.0 in Python, so an all-NaN JS side used
        # to come out of this loop as `worst = 0.0` and the delta assertion in main() could not fire
        # — it reported "max|Δ|=0.000e+00" for a walker that had returned nothing but NaN. The band
        # count still went red, which is why the gate held, but the number printed next to it was a
        # lie. Count the non-finite rows explicitly and let nanmax ignore them for the delta.
        nonfinite += int((~np.isfinite(js)).sum())
        d = np.abs(js - py)
        nb = int((band(js) != band(py)).sum())
        worst = max(worst, float(np.nanmax(d)) if np.isfinite(d).any() else float("inf"))
        disagreements += nb
        total += len(rows)
        closest = min(
            closest,
            float(np.abs(py - LIKELY_MIN).min()),
            float(np.abs(py - UNLIKELY_MAX).min()),
        )
        if not quiet:
            bad = int((~np.isfinite(js)).sum())
            print(
                f"  {name:<28} n={len(rows):>5}  max|Δ|={np.nanmax(d):.3e}  "
                f"mean|Δ|={np.nanmean(d):.3e}  band-disagreements={nb}"
                + (f"  NON-FINITE JS SCORES={bad}" if bad else "")
            )
    if not quiet:
        print(f"  {'TOTAL':<28} n={total:>5}  max|Δ|={worst:.3e}  band-disagreements={disagreements}")
        print(f"  closest any score comes to a band edge: {closest:.3e}  (vs max|Δ| {worst:.3e})")
        if nonfinite:
            print(f"  {nonfinite} of {total} JS scores were NOT FINITE — the walker is broken, not merely inaccurate.")
    if not corpus and not quiet:
        print(f"  NOTE: production corpus not present at {CORPUS} — grid + adversarial only.")
        print("        Set MEME_VALIDATION_TSV to include the 3,000 real production rows.")
    return (disagreements == 0 and worst <= TOLERANCE and nonfinite == 0), worst, disagreements, nonfinite


# ------------------------------------------------------------------------------------------------
# --self-test: prove this gate can fail
# ------------------------------------------------------------------------------------------------


def mutate(doc: dict, fn) -> pathlib.Path:
    d = copy.deepcopy(doc)
    fn(d)
    path = pathlib.Path(tempfile.mkdtemp()) / "mutant.json"
    path.write_text(json.dumps(d))
    return path


def set_dart(d):
    n = len(d["learner"]["gradient_booster"]["model"]["trees"])
    d["learner"]["gradient_booster"]["model"]["weight_drop"] = [0.303] * n


def set_categorical(d):
    t = d["learner"]["gradient_booster"]["model"]["trees"][0]
    t["split_type"] = [1] + list(t["split_type"][1:])


def set_bad_child(d):
    t = d["learner"]["gradient_booster"]["model"]["trees"][0]
    t["left_children"] = list(t["left_children"])
    t["left_children"][0] = 10**6  # past the end of the node arrays


def set_v1_export(d):
    d["version"] = [1, 7, 6]
    d["learner"]["learner_model_param"]["base_score"] = "0.3"


def set_half_leaf(d):
    t = d["learner"]["gradient_booster"]["model"]["trees"][0]
    i = next(k for k, l in enumerate(t["left_children"]) if l == -1)
    t["right_children"] = list(t["right_children"])
    t["right_children"][i] = 1  # one child -1, the other not


REFUSALS = [
    ("DART / rate_drop dropout weights", set_dart),
    ("multi-class objective", lambda d: d["learner"]["objective"].update({"name": "multi:softprob"})),
    ("regression objective", lambda d: d["learner"]["objective"].update({"name": "reg:squarederror"})),
    ("gblinear booster", lambda d: d["learner"]["gradient_booster"].update({"name": "gblinear"})),
    ("4-feature retrain", lambda d: d["learner"]["learner_model_param"].update({"num_feature": "4"})),
    ("multi-class num_class", lambda d: d["learner"]["learner_model_param"].update({"num_class": "3"})),
    ("truncated base_score", lambda d: d["learner"]["learner_model_param"].update({"base_score": "0.85abc"})),
    ("multi-component base_score", lambda d: d["learner"]["learner_model_param"].update({"base_score": "[0.3,0.3,0.4]"})),
    # BOTH ends of the version window. The high end is a layout nobody has seen yet; the LOW end is
    # the one that scores without erroring and wrongly, because 1.x writes base_score in margin
    # space. base_score is set to 0.3 on purpose: a margin outside (0, 1) is already refused by
    # parseBaseScore, so only a margin INSIDE it tests the version guard itself.
    ("unsupported format major (future)", lambda d: d.update({"version": [4, 0, 0]})),
    ("XGBoost 1.x export (base_score is a MARGIN there)", set_v1_export),
    ("categorical split node", set_categorical),
    ("child index past the end", set_bad_child),
    ("leaf with one child set", set_half_leaf),
]


def self_test() -> int:
    """
    Prove this gate can go red, and prove the walker's guard rails throw rather than warn.

    PART 1 is the one that matters and the one that is easy to get wrong. The mutation is ONE-SIDED:
    the JS side reads a corrupted copy, XGBoost reads the pristine shipped file. Nudging
    meme_gate.json itself would leave both sides agreeing on the corrupt model and this whole script
    reporting parity — a negative test that "proves" a guard incapable of failing.
    """
    doc = json.loads(MODEL.read_text())
    failures = []

    print("=== PART 1: a one-sided leaf perturbation must make the comparison FAIL ===")
    tree0 = doc["learner"]["gradient_booster"]["model"]["trees"][0]
    leaf = next(i for i, l in enumerate(tree0["left_children"]) if l == -1)
    print(f"  nudging tree 0 leaf {leaf} ({tree0['split_conditions'][leaf]}) by +0.5, JS side only")

    def nudge(d):
        t = d["learner"]["gradient_booster"]["model"]["trees"][0]
        t["split_conditions"] = list(t["split_conditions"])
        t["split_conditions"][leaf] += 0.5

    mutant = mutate(doc, nudge)
    ok, worst, nb, bad = compare(mutant)
    if ok:
        failures.append(
            "the comparison reported PARITY against a corrupted evaluator — the gate is decorative"
        )
    else:
        print(
            f"  -> correctly FAILED: max|Δ|={worst:.3e}, {nb} band disagreement(s)"
            + (f", {bad} non-finite score(s)" if bad else "")
        )

    print("\n=== PART 2: the walker must REFUSE models it cannot score correctly ===")
    print("    (each would otherwise be walked without error, returning a confident wrong number)")
    for name, fn in REFUSALS:
        path = mutate(doc, fn)
        refused, msg = js_refuses([[50.0, 200.0, 0.02]], path)
        print(f"  {'REFUSED' if refused else 'ACCEPTED':<9} {name:<32} {msg[:78]}")
        if not refused:
            failures.append(f"the walker ACCEPTED a model with: {name}")

    print("\n=== PART 3: a wrong-width row must throw ===")
    refused, msg = js_refuses([[50.0, 200.0, 0.02, 1.0]], MODEL)
    print(f"  {'REFUSED' if refused else 'ACCEPTED':<9} 4-wide row{'':<23} {msg[:78]}")
    if not refused:
        failures.append("the walker scored a 4-wide row against a 3-feature model")

    # The walker deliberately does NOT implement XGBoost's default_left missing-value routing: in
    # this domain a non-finite feature means extraction is broken, and the honest response to a
    # broken extractor is an exception, not a confident 0.87. (It would also be untestable dead code
    # on a hot path — and in this model every default_left is 0, i.e. missing routes RIGHT, the
    # opposite of what the field name suggests to a reader.) These assert the throw actually fires.
    print("\n=== PART 4: non-finite input must throw, not route ===")
    probes = [
        ("[NaN, 500, 0.02]", "NaN feature"),
        ("[50, Infinity, 0.02]", "Infinity feature"),
        ("[50, 500, null]", "null feature"),
        ("[50, 500, '0.02']", "string feature"),
    ]
    for literal, label in probes:
        refused, msg = js_refuses_nonfinite(literal)
        print(f"  {'REFUSED' if refused else 'ACCEPTED':<9} {label:<32} {msg[:78]}")
        if not refused:
            failures.append(f"the walker scored a {label} instead of throwing")

    if failures:
        print("\nSELF-TEST FAILED — this gate cannot be trusted to catch a real regression:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nSELF-TEST OK — the comparison fails on a corrupted evaluator, and every guard rail throws.")
    return 0


# ------------------------------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true", help="prove this gate can fail (run FIRST)")
    ap.add_argument(
        "--boundary",
        action="store_true",
        help="`<` vs `<=` on values sitting exactly on the model's own split thresholds",
    )
    ap.add_argument("--emit-golden", action="store_true", help="regenerate golden.fixtures.json")
    ap.add_argument("--check", action="store_true", help="with --emit-golden: verify, do not write")
    ap.add_argument("--tolerance", type=float, default=TOLERANCE)
    args = ap.parse_args()

    for p in (MODEL, META, WALKER, SCORER):
        if not p.exists():
            sys.exit(f"FAIL: missing {p.relative_to(REPO)}")

    if args.self_test:
        return self_test()
    if args.boundary:
        return boundary_test()
    if args.emit_golden:
        return emit_golden(args.check)

    doc = json.loads(MODEL.read_text())
    print(f"model: {MODEL.relative_to(REPO)}  ({MODEL.stat().st_size:,} bytes)")

    # 1. The contract + arity checks are fatal on their own: with a broken contract the scoring step
    # below either dies inside node or, worse, succeeds against the wrong model, and neither of
    # those reads as "the feature contract is wrong".
    print("\n=== CONTRACT (what the model declares itself to be) ===")
    blockers = check_contract(doc) + check_arity(doc) + check_thresholds_match_source()
    if blockers:
        print("\nFAILED before scoring:")
        for f in blockers:
            print(f"  - {f}")
        return 1
    print("  objective / booster / num_class / num_feature / num_trees / no-categorical / "
          "no-dropout / format-major: all as expected")
    print(f"  feature contract agrees across meme_gate.meta.json, xgbEnsemble.js, hitLikelihoodModel.js: {FEATURES}")
    print(f"  band edges agree with hitLikelihoodModel.js: unlikely < {UNLIKELY_MAX} <= uncertain < {LIKELY_MIN} <= likely")

    # 2. The pin. Reported separately because it fails for a different reason than parity does:
    # parity stays green through a model swap, correctly, since the walker reproduces whatever it
    # is handed. This is the half that notices the swap.
    _, meta = js_scores([[50.0, 200.0, 0.02]])
    print("\n=== PIN (is this the artifact that was calibrated?) ===")
    print(f"  sha256 {hashlib.sha256(MODEL.read_bytes()).hexdigest()}")
    print(f"  {meta['nTrees']} trees / {meta['nNodes']} nodes / {meta['nLeaves']} leaves / "
          f"depth {meta['maxDepth']} / base_score {meta['baseScore']} / "
          f"splits {meta['splitCountsByFeature']}")
    pin_problems = check_pin(meta)
    for f in pin_problems:
        print(f"  PIN FAIL  {f}")
    if not pin_problems:
        print("  matches the pin")

    # 3. The one PROPERTY of the model the UI states in words. save_model() does not persist
    # monotone_constraints, so without this the claim rests on a free-text field in the sidecar.
    print("\n=== SHAPE (the property the panel promises a user) ===")
    mono_problems = check_monotone(doc)
    for f in mono_problems:
        print(f"  SHAPE FAIL  {f}")

    # 4. Parity.
    print(f"\n=== PARITY (xgbEnsemble.js vs xgboost {xgb.__version__} on the same bytes) ===")
    ok, worst, nb, bad = compare(MODEL)

    failures = list(pin_problems) + list(mono_problems)
    if bad:
        failures.append(
            f"{bad} JS score(s) were not finite — the walker returned NaN/Infinity, which no "
            "delta comparison can measure"
        )
    if nb:
        failures.append(f"{nb} vector(s) land in different bands — user-visible.")
    if worst > args.tolerance:
        failures.append(f"max delta {worst:.3e} exceeds tolerance {args.tolerance:.1e}")

    if failures:
        print("\nFAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("\nOK — the shipped JS walker reproduces XGBoost's own scoring of meme_gate.json, and the "
          "artifact is the one that was calibrated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
