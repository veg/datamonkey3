/**
 * scope.js — which analysis methods have a MEME hit-likelihood estimate.
 *
 * A leaf module on purpose: it imports nothing, so a caller can ask "is there an estimate for this
 * method?" without pulling in the row component, the walker, or the 735 KB model file the walker
 * reads. That is the whole point of the guard — RunOutlook asks before deciding whether to load any
 * of it, and the ~14 methods that have no estimate must not pay for one. (It used to say
 * "coefficients or routing table"; there is neither any more. There is one model file, shipped
 * exactly as XGBoost wrote it, and no method routing at all.)
 *
 * Scope is MEME only because the model's training label is "MEME reported at least one selected
 * site". It is not calibrated for any other method, and re-using it for one would be a fabrication.
 */

/** @param {string|null} method @returns {boolean} */
export function hasHitLikelihood(method) {
	return typeof method === 'string' && method.toLowerCase() === 'meme';
}

/**
 * Does this newick carry at least one positive branch length?
 *
 * Lives here for the same reason: the caller that chooses WHICH tree to hand the estimator has to
 * ask this before the estimator exists. It is also a precondition, not a nicety — median_pos_dist
 * is meaningless on a topology-only tree, and the model scores its 0.0 sentinel anyway: at 50 seqs
 * x 200 codons, 0.0 comes back 0.433 against 0.920 for a real (shallow) 0.005, which is a different
 * band. So the sentinel scores LOWER than a real tree, where the previous model scored it higher.
 * Either way the number is manufactured out of a parse failure, so it must be refused — this guard
 * is not made redundant by the model being monotone.
 *
 * @param {string|null} tree
 * @returns {boolean}
 */
export function treeHasBranchLengths(tree) {
	if (!tree || typeof tree !== 'string') return false;
	const re = /:(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g;
	let m;
	while ((m = re.exec(tree)) !== null) {
		if (parseFloat(m[1]) > 0) return true;
	}
	return false;
}
