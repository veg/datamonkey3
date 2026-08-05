/**
 * recommendation.js — turns a MEME hit-likelihood level into something the user can DO.
 *
 * SCOPE: MEME, and nothing else. The model behind this was trained on one label — whether a MEME
 * run reported at least one selected site — so its output supports statements about MEME and no
 * other method. An earlier version routed users to BUSTED, aBSREL and FUBAR with lines like "it can
 * detect selection here" and "holds up better than MEME". Those are predictions about methods this
 * model has never seen scored, dressed in the authority of a number that only describes MEME. The
 * reasoning behind them was defensible textbook phylogenetics, but that is exactly the problem: it
 * was the author's judgement presented as the model's finding, and a reader has no way to tell the
 * two apart.
 *
 * So the guidance here stays inside what the estimate can actually speak to: whether MEME has
 * enough substitutions to fit its site-level tests, and what about the DATA would change that.
 * "Collect more divergent sequences" is a claim about this alignment relative to MEME's needs.
 * "Run BUSTED instead" is a claim about BUSTED. Only the first is ours to make.
 *
 * The substitution budget below is arithmetic from the same three features the model already reads,
 * not a second model: MEME fits a two-class mixture over branches at each site, so one of its tests
 * sees roughly (2*num_seqs - 3) * median_branch_length expected substitutions, and the alignment as
 * a whole sees num_sites times that.
 */

/** Shared honesty line. Render on EVERY level — this is what the number does and does not mean. */
export const HIT_LIKELIHOOD_CAVEAT =
	'This estimates whether MEME will report anything on this alignment, not whether this gene is under selection.';

/**
 * Thresholds in expected substitutions. Approximate by construction — they separate regimes that
 * differ by orders of magnitude, so nothing here is sensitive to the exact cut.
 */
export const ROUTING = {
	/** Below this many expected substitutions in the whole alignment, there is nothing to fit. */
	totalSubsFloor: 100,
	/** Below this many at a typical site, MEME's per-site tests starve even if the total is fine. */
	perSiteFloor: 3
};

/**
 * Expected-substitution budget for an alignment, from the estimate's own features.
 *   branches = 2n - 3   (unrooted binary tree)
 *   perSite  = branches * median branch length   — what ONE of MEME's tests gets to see
 *   total    = num_sites * perSite               — what the alignment holds in total
 * @param {{num_seqs: number, num_sites: number, median_pos_dist: number}} features
 * @returns {{branches: number, per_site: number, total: number}}
 */
export function substitutionBudget({ num_seqs, num_sites, median_pos_dist }) {
	const branches = Math.max(2 * num_seqs - 3, 1);
	const perSite = branches * median_pos_dist;
	return { branches, per_site: perSite, total: num_sites * perSite };
}

/** Copy is fixed text on purpose: each line is a claim someone can check, and all of it is about MEME. */
const COPY = {
	tooThin:
		'There are too few substitutions in this alignment for MEME to fit its site-level tests. More sequences, or more divergent ones, is what would change that.',
	perSiteThin:
		'Not enough substitutions at a typical site for MEME to pin selection to a single codon, even though the alignment has a reasonable amount overall. Deeper branches or more taxa would give each site-level test more to work with.',
	unlikely:
		'MEME looks unlikely to report a site on this alignment. More sequences, or more divergent ones, would give its site-level tests more to fit.',
	uncertain:
		'Borderline for MEME on this alignment — it may or may not reach significance at any individual site.',
	likely: "This alignment has enough branch-level signal for MEME's site-level tests.",
	resample:
		'Running MEME anyway? Set Resample to 50 or more — the asymptotic p-values are unreliable on alignments this small, though it will not create signal.'
};

/**
 * The "too thin to fit anything" route. Exported separately because the domain guard reaches the
 * same conclusion without ever scoring: an alignment below the model's range is one MEME has
 * nothing to work with on.
 * @returns {object} a recommendation
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
 * Pick the guidance for a scored result.
 *
 * @param {object} result - from runHitLikelihood: needs { level, num_seqs, num_sites,
 *   median_pos_dist }
 * @param {{resampleAvailable?: boolean}} [opts] - gates the --resample tip, which points at
 *   MethodSelector's METHOD_ADVANCED_OPTIONS.meme. Both runners already plumb `resample`, but the
 *   MEME options panel does not expose it yet, so the caller must opt in rather than have us name a
 *   control that is not on screen.
 * @returns {{message: string, action: object|null, secondary: Array<{message: string,
 *   action: object|null}>, caveat: string, budget: object}|null}
 */
export function recommendFor(result, opts = {}) {
	if (!result || !result.level) return null;
	const budget = substitutionBudget(result);
	const { level } = result;
	const wrap = (message, action = null, secondary = []) => ({
		message,
		action,
		secondary,
		caveat: HIT_LIKELIHOOD_CAVEAT,
		budget
	});

	const secondary = [];
	if (opts.resampleAvailable && level !== 'likely') {
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

	if (level === 'likely') return wrap(COPY.likely);
	if (level === 'uncertain') return wrap(COPY.uncertain, null, secondary);

	// level === 'unlikely'. Which axis is thin decides which sentence is true, not which method to
	// send them to.
	if (budget.total < ROUTING.totalSubsFloor) {
		return { ...tooThinRecommendation(budget), secondary };
	}
	if (budget.per_site < ROUTING.perSiteFloor) return wrap(COPY.perSiteThin, null, secondary);
	// Enough substitutions on both axes, and the model still says unlikely. We can report that
	// honestly without inventing a reason the three features do not actually give us.
	return wrap(COPY.unlikely, null, secondary);
}
