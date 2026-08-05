/**
 * treeEnsemble.js — pure-JS evaluator for the exported MEME hit-likelihood model.
 *
 * WHY THIS EXISTS (and why it is not a "simplification" of the model):
 * The shipped model is a single ai.onnx.ml TreeEnsembleClassifier — 150 trees, 1027 BRANCH_LEQ
 * nodes, 1177 leaves, base_score + summed leaf weights through a logistic. That is ~2200 numbers.
 * Running it through onnxruntime-web cost 13.2 MB of vendored WASM to execute what is a tree walk
 * and an addition. This module walks the same tree table directly, so the browser downloads
 * ~37 KB of JSON (~11 KB gzipped) instead — and DM3 has no ONNX runtime dependency at all.
 *
 * This is NOT an approximation. Verified against the shipped .onnx via onnxruntime-node:
 *   - 12/12 golden.fixtures.json vectors agree to max |Δ| 7.4e-9 (fixture tolerance is 1e-6)
 *   - 2016 randomised + adversarial vectors (incl. NaN, ±Infinity, negatives, 1e9) agree with
 *     onnxruntime to max |Δ| 8.5e-8, with ZERO level disagreements.
 * The residual is float32 (ORT accumulates in float32) vs float64 (we accumulate in float64);
 * our values are in fact marginally CLOSER to the sklearn `predict_proba` values the golden
 * fixtures were generated from.
 *
 * The .onnx it was generated from sits next to this file as meme_hit_likelihood.onnx. It is NOT
 * under static/ — nothing fetches it at runtime, so serving it would be 84 KB of dead route; it is
 * kept in the tree so the ensemble JSON can be regenerated and re-verified.
 *
 * REGENERATING meme_hit_likelihood.ensemble.json: read the TreeEnsembleClassifier node's
 * attributes out of the .onnx (nodes_treeids / nodes_nodeids / nodes_featureids / nodes_values /
 * nodes_modes / nodes_truenodeids / nodes_falsenodeids / class_treeids / class_nodeids /
 * class_weights / base_values / post_transform), resolve the per-tree nodeids to array indices,
 * and emit flat [feature_id, threshold_or_weight, true_child, false_child] quads. Thresholds are
 * stored as the shortest decimal that round-trips to the original float32 and are re-`fround`ed on
 * load, so routing decisions are bit-identical to ORT's float32 comparisons.
 * `source_sha256` in the JSON pins the .onnx it was derived from — if the model is retrained,
 * that hash must change with it.
 *
 * The ONNX call shape is deliberately kept alive in hitLikelihoodModel.js
 * (createHitLikelihoodSession / scoreHitLikelihood) with an INJECTED runtime, so this evaluator can
 * always be re-validated against the real thing without that runtime being a dependency.
 */

let _modelPromise = null;

/**
 * Load + prepare the ensemble table (once per page). Dynamically imported so the ~37 KB of
 * coefficients lands in its own chunk and is fetched only when something actually scores.
 * @returns {Promise<{base: number, trees: Float64Array[], meta: object}>}
 */
export async function loadTreeEnsemble() {
	if (_modelPromise) return _modelPromise;
	_modelPromise = import('./meme_hit_likelihood.ensemble.json').then((m) =>
		prepareTreeEnsemble(m.default ?? m)
	);
	return _modelPromise;
}

/** Reset the cached ensemble — test hook. */
export function _resetTreeEnsemble() {
	_modelPromise = null;
}

/**
 * Turn the on-disk JSON into the form evalTreeEnsemble wants: thresholds/weights rounded back to
 * float32 (so `<=` matches ORT exactly) and each tree in one flat typed array.
 * @param {object} doc - the parsed meme_hit_likelihood.ensemble.json
 */
export function prepareTreeEnsemble(doc) {
	if (doc.format !== 'tree-ensemble-classifier/1') {
		throw new Error(`unsupported ensemble format: ${doc.format}`);
	}
	if (doc.post_transform !== 'LOGISTIC') {
		throw new Error(`unsupported post_transform: ${doc.post_transform}`);
	}
	const trees = doc.trees.map((t) => {
		const a = Float64Array.from(t);
		for (let i = 1; i < a.length; i += 4) a[i] = Math.fround(a[i]);
		return a;
	});
	return {
		base: Math.fround(doc.base_score),
		trees,
		meta: {
			features: doc.features,
			branchSplitCounts: doc.branch_split_counts,
			nTrees: doc.n_trees,
			nNodes: doc.n_nodes,
			sourceSha256: doc.source_sha256
		}
	};
}

/**
 * Evaluate the ensemble: P(class 1) for one feature row.
 *
 * ai.onnx.ml semantics, reproduced exactly:
 *   - every branch is BRANCH_LEQ: take the true child when x[feature] <= threshold, else the false
 *     child. NaN fails the comparison and therefore follows the false ("greater") child — every
 *     node in this model has missing_value_tracks_true = 0. Callers must reject non-finite inputs
 *     BEFORE getting here (hitLikelihoodModel.checkFeatureDomain does); NaN does not error, it
 *     silently routes into the high-data leaves.
 *   - leaf weights are summed across all trees onto base_score, then squashed by LOGISTIC.
 *
 * @param {{base: number, trees: Float64Array[]}} model - from prepareTreeEnsemble
 * @param {number[]} features - the frozen feature vector
 * @returns {number} P(class 1)
 */
export function evalTreeEnsemble(model, features) {
	// The exported model consumes a float32 tensor; round the inputs the same way so that
	// borderline `<=` comparisons resolve identically to ORT.
	const x = features.map(Math.fround);
	let sum = model.base;
	for (const t of model.trees) {
		let i = 0;
		while (t[i] >= 0) i = 4 * (x[t[i]] <= t[i + 1] ? t[i + 2] : t[i + 3]);
		sum += t[i + 1];
	}
	return 1 / (1 + Math.exp(-sum));
}
