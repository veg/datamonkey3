/**
 * treeSanitation.js — inspect a newick for branch lengths no downstream consumer should be handed.
 *
 * WHY THIS EXISTS. DM3's own tree inference emits negative branch lengths, and at least one
 * consumer crashes on them rather than degrading.
 *
 *   - src/data/shared/NJ.bf:214-220 computes the three-taxon closed form
 *     (d01 + d02 - d12) / 2 with no Max(0, ...), so any triplet violating the triangle inequality
 *     yields a negative. For four or more taxa the NJ core is C++ inside hyphy.wasm and likewise
 *     does not clamp.
 *   - src/data/shared/NJ.bf:99 returns a SATURATION SENTINEL of 1000 for a saturated pair, which
 *     propagates through that same subtraction to roughly -499.9.
 *
 * Measured consequence, on the AxoMEME 2.0 inference path:
 *   predict_regression_nexus.py:955 computes  log((node_count + 1.0) / (dist + 0.1)).
 *   Any patristic distance <= -0.1 is log of a negative -> uncaught ValueError. Verified: -0.010
 *   survives, -0.11 / -0.5 / -499.9 all crash. The handoff README's "clamps distances >= 0" refers
 *   to the TRAINING pipeline; the inference path does not clamp.
 *
 * So this is a DM3-side fact about DM3-side output, and it holds wherever a consumer runs — browser
 * or server. It is deliberately a leaf module (imports nothing) so a caller can ask before loading
 * anything heavy, matching the pattern in services/prescreen/scope.js.
 *
 * This module REPORTS. It does not silently rewrite a user's tree: clamping changes branch lengths,
 * branch lengths are the input a model's distances are built from, and quietly altering them would
 * be a fabrication of the same kind this codebase already refuses elsewhere. The caller decides
 * whether to refuse the run or to clamp with the user told.
 */

/** Matches a newick branch length, including scientific notation and a leading minus. */
const BRANCH_LENGTH = /:(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g;

/**
 * The value NJ.bf:99 returns for a saturated pair. It is not a distance; it is a sentinel, and it
 * reaches trees as a large positive length or, after the three-taxon subtraction, a large negative.
 */
export const NJ_SATURATION_SENTINEL = 1000;

/**
 * Every branch length in a newick, in document order. Empty array for a topology-only tree.
 * @param {string|null} tree
 * @returns {number[]}
 */
export function branchLengths(tree) {
	if (!tree || typeof tree !== 'string') return [];
	const out = [];
	let m;
	BRANCH_LENGTH.lastIndex = 0;
	while ((m = BRANCH_LENGTH.exec(tree)) !== null) {
		const v = parseFloat(m[1]);
		if (Number.isFinite(v)) out.push(v);
	}
	return out;
}

/**
 * Describe what is wrong with a tree's branch lengths, without changing it.
 *
 * @param {string|null} tree
 * @returns {{
 *   total: number, negative: number, negativeFraction: number, min: number|null,
 *   saturated: number, hasLengths: boolean, ok: boolean, reasons: string[]
 * }}
 */
export function inspectBranchLengths(tree) {
	const lengths = branchLengths(tree);
	const negatives = lengths.filter((v) => v < 0);
	const saturated = lengths.filter((v) => Math.abs(v) >= NJ_SATURATION_SENTINEL);
	const reasons = [];

	if (!lengths.length) reasons.push('topology-only: the tree carries no branch lengths');
	if (negatives.length) {
		reasons.push(
			`${negatives.length} of ${lengths.length} branch lengths are negative ` +
				`(smallest ${Math.min(...negatives)})`
		);
	}
	if (saturated.length) {
		reasons.push(
			`${saturated.length} branch length(s) at or past the NJ saturation sentinel ` +
				`(|value| >= ${NJ_SATURATION_SENTINEL}) — these are not distances`
		);
	}

	return {
		total: lengths.length,
		negative: negatives.length,
		negativeFraction: lengths.length ? negatives.length / lengths.length : 0,
		min: lengths.length ? Math.min(...lengths) : null,
		saturated: saturated.length,
		hasLengths: lengths.some((v) => v > 0),
		ok: reasons.length === 0,
		reasons
	};
}

/**
 * Would a consumer that computes log((n + 1) / (d + 0.1)) over PATRISTIC distances crash?
 *
 * Deliberately conservative, and the comment matters more than the code: the crash threshold is on
 * PATRISTIC distances (root-to-root path sums), not on individual branch lengths, and a path sum can
 * be more negative than any single branch on it. A tree can therefore pass this check and still
 * crash the consumer. Treat `false` as "no single branch proves a crash", never as "safe".
 *
 * @param {string|null} tree
 * @param {number} [epsilon] the additive constant in the consumer's log argument
 * @returns {boolean}
 */
export function hasCrashingBranchLength(tree, epsilon = 0.1) {
	return branchLengths(tree).some((v) => v <= -epsilon);
}
