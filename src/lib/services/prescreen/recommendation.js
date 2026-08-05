/**
 * recommendation.js — turns a MEME hit-likelihood level into something the user can DO.
 *
 * The estimate on its own only grades: it tells someone their alignment is unpromising and stops.
 * This module does the routing, from the same three features hitLikelihoodModel.js already
 * extracts — no extra model, no extra inference.
 *
 * WHY THESE ROUTES (short version; the trade is always "give up localization to buy detection"):
 *   MEME fits a two-class mixture OVER BRANCHES at each site, so the data informing one test is
 *   roughly (2*num_seqs - 3) * median_branch_length substitutions — `perSite` below. It then runs
 *   num_sites of those tests and pays a multiple-testing correction. So MEME needs the signal
 *   CONCENTRATED at one site strongly enough to survive FDR.
 *   BUSTED spends ~2 df on the WHOLE dataset (one boundary-constrained LRT, pooling every site and
 *   every branch), so it only needs the signal to exist somewhere. That is the right trade when
 *   perSite is a fraction of a substitution but the alignment total is in the hundreds — and it is
 *   the standard HyPhy order of operations (gene-wide screen first, site-level localization
 *   second), applied at the point where we can predict step two comes back empty.
 *   aBSREL spends its df per BRANCH, so its power scales with branch length rather than site
 *   count: right in the "few taxa, long branches" corner, useless on a shallow tree.
 *   FUBAR's edge is hierarchical shrinkage across sites plus posterior probabilities instead of an
 *   asymptotic LRT — but it tests PERVASIVE selection, so it is a DIFFERENT QUESTION, not a
 *   substitute, and its cross-site borrowing is worthless on a short fragment.
 *   When even the alignment TOTAL is a few dozen expected substitutions, no dN/dS method of any
 *   kind has anything to fit and suggesting one would be dishonest.
 *
 * Deliberately never recommended: FEL and SLAC (same or worse per-site framework, and both swap to
 * the harder pervasive hypothesis), PRIME / Contrast-FEL (hungrier still), RELAX and BGM (different
 * questions needing prior structure), GARD / MULTI-HIT / NRM (not selection detection), FADE
 * (unsupported in DM3).
 */

/** Shared honesty line. Render on EVERY level — this is what the number does and does not mean. */
export const HIT_LIKELIHOOD_CAVEAT =
	'This estimates whether MEME will report anything on this alignment, not whether this gene is under selection.';

/**
 * Routing thresholds, in expected substitutions. Approximate by construction — they separate
 * regimes that differ by two orders of magnitude (model-RED datasets have a median total of ~20
 * expected substitutions; model-GREEN ones ~1710), so nothing here is sensitive to the exact cut.
 */
export const ROUTING = {
	/** Below this many expected substitutions in the whole alignment, no dN/dS method can work. */
	totalSubsFloor: 100,
	/** Below this many expected substitutions at a typical site, MEME's per-site tests starve. */
	perSiteFloor: 3,
	/** aBSREL's Holm correction is cheap only while the branch count is small. */
	fewTaxaMax: 10,
	/** FUBAR has nothing to borrow across sites on a short fragment. */
	fubarMinSites: 50
};

/**
 * Expected-substitution budget for an alignment, from the gate's own features.
 *   branches = 2n - 3   (unrooted binary tree)
 *   perSite  = branches * median branch length   — what ONE of MEME's tests gets to see
 *   total    = num_sites * perSite               — what a gene-wide test gets to see
 * @param {{num_seqs: number, num_sites: number, median_pos_dist: number}} features
 * @returns {{branches: number, per_site: number, total: number}}
 */
export function substitutionBudget({ num_seqs, num_sites, median_pos_dist }) {
	const branches = Math.max(2 * num_seqs - 3, 1);
	const perSite = branches * median_pos_dist;
	return { branches, per_site: perSite, total: num_sites * perSite };
}

/**
 * A "switch the method selector to X" action.
 * `method` is the DM3 method KEY (MethodSelector.SUPPORTED_METHODS / methodConfig), because the
 * point of the routing is that the UI can act on it; `name` is how the method is written for a
 * reader. Getting the key wrong is a silent no-op, so they are separate fields rather than one
 * string that has to be both.
 */
const switchTo = (method, name) => ({
	kind: 'switch-method',
	method,
	name,
	label: `Switch to ${name}`
});

/** Copy is fixed text on purpose: each line is a claim someone can check. */
const COPY = {
	tooThin:
		'Too few substitutions here for any dN/dS method, MEME included — more divergent sequences will help, a different method will not.',
	busted:
		'Not enough signal per site for MEME. BUSTED asks the same question gene-wide in a single test — it can detect selection here, but not which site.',
	absrel:
		'Few sequences but long branches — aBSREL pools every site within each branch instead of splitting this alignment site by site.',
	fubar:
		'If pervasive rather than episodic selection answers your question, FUBAR shares information across sites and holds up better than MEME here.',
	resample:
		'Running MEME anyway? Set Resample to 50 or more — the asymptotic p-values are unreliable on alignments this small, though it will not create signal.',
	uncertain:
		'Borderline for MEME — running BUSTED alongside it is cheap insurance: a gene-wide result still stands when no single site reaches significance.',
	likely: "This alignment has enough branch-level signal for MEME's site-level tests."
};

/**
 * The "your alignment is too thin for any of this" route. Exported separately because the domain
 * guard reaches the same conclusion without ever scoring (an alignment below the model's range is,
 * by construction, an alignment nobody should be running MEME on).
 * @returns {object} a recommendation with no method action
 */
export function tooThinRecommendation(budget = null) {
	return {
		message: COPY.tooThin,
		action: null,
		secondary: [],
		caveat: HIT_LIKELIHOOD_CAVEAT,
		budget
	};
}

/**
 * Pick the recommendation for a scored result.
 *
 * @param {object} result - from runHitLikelihood: needs { level, num_seqs, num_sites,
 *   median_pos_dist }
 * @param {{resampleAvailable?: boolean}} [opts] - resampleAvailable gates the --resample tip,
 *   which points at MethodSelector's METHOD_ADVANCED_OPTIONS.meme. Both runners already plumb
 *   `resample`, but the MEME options panel does not expose it yet (FEL's does), so the caller must
 *   opt in rather than have us name a control that is not on screen.
 * @returns {{message: string, action: object|null, secondary: Array<{message: string,
 *   action: object|null}>, caveat: string, budget: object}|null}
 */
export function recommendFor(result, opts = {}) {
	if (!result || !result.level) return null;
	const budget = substitutionBudget(result);
	const { level, num_seqs: seqs, num_sites: sites } = result;
	const wrap = (message, action, secondary = []) => ({
		message,
		action,
		secondary,
		caveat: HIT_LIKELIHOOD_CAVEAT,
		budget
	});

	if (level === 'likely') return wrap(COPY.likely, null);
	if (level === 'uncertain') return wrap(COPY.uncertain, switchTo('busted', 'BUSTED'));

	// level === 'unlikely'. Which axis is thin decides the route.
	if (budget.total < ROUTING.totalSubsFloor) {
		// No method substitution is honest here — this is the branch that fires on a 17-codon
		// fixture, and routing that to BUSTED would recommend a run that also cannot work.
		// Deliberately no method suggestion, not even a secondary one.
		return tooThinRecommendation(budget);
	}

	const secondary = [];
	if (sites >= ROUTING.fubarMinSites)
		secondary.push({ message: COPY.fubar, action: switchTo('fubar', 'FUBAR') });
	if (opts.resampleAvailable) {
		secondary.push({
			message: COPY.resample,
			action: {
				kind: 'set-option',
				method: 'meme',
				option: 'resample',
				value: 50,
				label: 'Set Resample to 50'
			}
		});
	}

	if (budget.per_site >= ROUTING.perSiteFloor && seqs < ROUTING.fewTaxaMax) {
		return wrap(COPY.absrel, switchTo('absrel', 'aBSREL'), secondary);
	}
	// Everything else — thin per site, or thin on opportunities (few codons) — goes gene-wide.
	// BUSTED is the residual because pooling across sites AND branches is the only lever left.
	return wrap(COPY.busted, switchTo('busted', 'BUSTED'), secondary);
}
