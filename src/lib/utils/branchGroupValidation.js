/**
 * Branch-group validation for methods that compare multiple branch groups.
 *
 * Contrast-FEL compares two or more groups. Submitting with fewer than two groups
 * makes HyPhy core-dump downstream (it subtracts an empty 0x0 matrix from the rate
 * matrix). We gate submission in the UI so the user gets immediate, understandable
 * feedback instead of a job that fails minutes later. See issue #144.
 */

/**
 * Count distinct, non-empty branch-group names.
 * @param {unknown} selectionSets - array of group names emitted by the branch selector
 * @returns {number}
 */
export function countBranchGroups(selectionSets) {
	if (!Array.isArray(selectionSets)) return 0;
	return new Set(
		selectionSets
			.filter((s) => typeof s === 'string' && s.trim().length > 0)
			.map((s) => s.trim())
	).size;
}

/**
 * Whether a Contrast-FEL configuration has enough branch groups to submit.
 *
 * Two input modes:
 *  - Interactive (default): at least two distinct groups tagged on the tree.
 *  - Custom: the first two branch-set text fields must both be non-empty.
 *
 * @param {object} opts - the contrast-fel method options
 * @param {string} [opts.branchesToTest] - 'Interactive' | 'Custom'
 * @param {number} [opts.selectionSetCount] - distinct groups tagged in Interactive mode
 * @param {string} [opts.branchSet1]
 * @param {string} [opts.branchSet2]
 * @returns {boolean}
 */
export function contrastFelHasEnoughGroups(opts = {}) {
	if (opts.branchesToTest === 'Custom') {
		return (
			(opts.branchSet1 || '').trim().length > 0 &&
			(opts.branchSet2 || '').trim().length > 0
		);
	}
	// Interactive (default)
	return (opts.selectionSetCount || 0) >= 2;
}
