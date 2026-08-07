/**
 * hitLikelihood.js — DM3-side wrapper around the MEME hit-likelihood estimate.
 *
 * The estimator is client-side and geometry-only: given a codon alignment + a branch-length tree
 * it estimates P(a full MEME run reports at least one selected site) and buckets it into
 * likely / uncertain / unlikely. It is ADVISORY ONLY — it never blocks a run, and the vocabulary
 * is chosen so nothing in it can be read as a promise to.
 *
 * This module keeps the Svelte component thin and the logic unit-testable:
 *   - loadHitLikelihoodModel(): load the scorer once (pure JS; nothing native, nothing fetched).
 *   - estimateHitLikelihood(): the pure decision — ALWAYS returns a result object with a status.
 *
 * Scope: MEME only. The training label is "MEME found selection", so it is not calibrated for any
 * other method; callers pass the method and we return status 'not-applicable' for non-MEME. Ask
 * scope.js (which imports nothing) BEFORE loading this module if all you need is the scope check.
 *
 * FOUR STATUSES, never null. Blank space used to mean three different things:
 *   'ok'             a real estimate — level / hit_probability / recommendation are populated
 *   'not-applicable' this method isn't MEME, or there is no alignment yet — render nothing
 *   'cannot-assess'  we have input but it is outside the range the model can speak to — render
 *                    the reason, never a number (see checkFeatureDomain)
 *   'error'          the estimator itself failed — `detail` says so; this module does not throw
 */

import {
	runHitLikelihood,
	createHitLikelihoodScorer,
	checkFeatureDomain,
	extractHitLikelihoodFeatures,
	STATUS,
	FEATURE_DOMAIN,
	LIVE_FEATURES,
	LIKELY_MIN,
	UNLIKELY_MAX
} from './hitLikelihoodModel.js';
import {
	recommendFor,
	tooThinRecommendation,
	substitutionBudget,
	HIT_LIKELIHOOD_CAVEAT
} from './recommendation.js';
import { hasHitLikelihood, treeHasBranchLengths } from './scope.js';

export { STATUS, HIT_LIKELIHOOD_CAVEAT, LIKELY_MIN, UNLIKELY_MAX, FEATURE_DOMAIN };

/**
 * One-line description of what produced the number, for the UI to show next to it. The estimate is
 * a falsifiable claim, so the thing making it should be nameable.
 */
export const MODEL_BASIS =
	'Gradient-boosted trees over three alignment-geometry features (sequences, codons, median branch length), trained on whether MEME reported at least one site at p <= 0.1, and checked against every MEME run on Datamonkey.';

// Both live in an import-free leaf module so a caller can ask "is there an estimate for this
// method?" and "is this tree usable?" without loading the estimator — see scope.js.
export { hasHitLikelihood, treeHasBranchLengths };

/**
 * Normalise where the tree came from. NJ branch lengths are NUCLEOTIDE distances — roughly 3x the
 * codon-model lengths MEME actually fits — and median_pos_dist is one of the model's three
 * features, so the difference is not cosmetic, and it biases in one direction: the model is
 * monotone in branch length BY CONSTRUCTION, so an inflated median can only push the estimate UP.
 * Worked example at 10 seqs x 300 codons, re-measured on the shipped model: an NJ median of 0.005
 * scores 0.844 ('likely'), while the ~0.0017 codon-model length it stands for scores 0.693
 * ('uncertain'). Still a band change, and still in the optimistic direction. We do NOT rescale (an
 * unvalidated fudge factor is worse science than a disclosure); we label the estimate optimistic
 * and let the UI say so.
 */
export function normalizeTreeSource(treeSource) {
	const s = typeof treeSource === 'string' ? treeSource.toLowerCase() : '';
	if (s === 'user' || s === 'usertree' || s === 'user-supplied') return 'user';
	if (s === 'nj' || s === 'inferred-nj' || s === 'inferred') return 'inferred-nj';
	return 'unknown';
}

const TREE_SOURCE_CAVEAT = {
	'inferred-nj':
		'Branch lengths come from the inferred neighbour-joining tree (nucleotide distances, typically longer than the codon-model lengths MEME fits), so this estimate leans optimistic.',
	unknown:
		'Branch lengths were taken as given; if they are not codon-model substitutions per site this estimate does not apply.',
	user: null
};

let _modelPromise = null;

/**
 * Load the scorer (once per page).
 *
 * THERE IS ONE BACKEND AND NO ML RUNTIME. The estimator is XGBoost's own `save_model()` JSON —
 * 500 trees, ~735 KB (~169 KB gzipped) — walked directly by xgbEnsemble.js in about 40 lines. No
 * converter, no intermediate format, no WASM: the bytes the ML team exports are the bytes parsed
 * here. Verified against xgboost's own scoring of the same file at max |Δ| 4.4e-07 with ZERO band
 * disagreements over 5,532 vectors, 3,000 of them real production jobs.
 *
 * Be honest about the trade this made: the payload went from ~4 KB gzipped to ~169 KB gzipped, 40x
 * more, for a better-calibrated and structurally-monotone model. It is still three orders of
 * magnitude below the 13.5 MB an ML runtime would have cost, it is still fetched from our own
 * origin with a content hash and nothing else, and — the part that actually matters — it is
 * exactly ZERO bytes for every method that is not MEME, because the import lives behind
 * hasHitLikelihood() and a dynamic import().
 *
 * "ZERO" is meant literally, and it took a fix to become true. A dynamic import() keeps the JS
 * lazy but NOT the CSS: SvelteKit lists a dynamically-imported component's stylesheet in the
 * route's own stylesheet array so the component cannot flash unstyled, which made
 * MemeHitLikelihood's <style> block a render-blocking <link> on every page load, for every method,
 * in the production build only. The row's CSS now travels as a string inside the lazy chunk (see
 * MemeHitLikelihood.css). e2e/18 asserts the whole invariant by classifying response BODIES rather
 * than URLs, so it means the same thing against a production build as against the dev server.
 *
 * @returns {Promise<{backend: string, score: Function, meta: object}>}
 */
export async function loadHitLikelihoodModel() {
	_modelPromise ??= createHitLikelihoodScorer();
	return _modelPromise;
}

/** Reset the cached model — test hook. */
export function _resetHitLikelihoodModel() {
	_modelPromise = null;
}

/** Build the fixed part of every result so the shape never varies between statuses. */
function shell(status, extra = {}) {
	return {
		status,
		reason: null,
		detail: null,
		level: null,
		hit_probability: null,
		recommend_run: null,
		caveat: HIT_LIKELIHOOD_CAVEAT,
		basis: MODEL_BASIS,
		recommendation: null,
		num_seqs: null,
		num_sites: null,
		median_pos_dist: null,
		domain: null,
		budget: null,
		tree_source: 'unknown',
		tree_source_caveat: null,
		...extra
	};
}

/**
 * An 'error' result, for the one failure this module cannot catch itself: the caller never got a
 * scorer. Exported so "the estimator broke" renders as a stated failure rather than as blank space
 * indistinguishable from "nothing to report".
 * @param {string} [detail] - what to show the user
 */
export function hitLikelihoodError(detail = 'The hit-likelihood estimate could not be computed.') {
	return shell(STATUS.ERROR, { reason: 'model-error', detail });
}

/**
 * Compute the MEME hit-likelihood estimate for a submission.
 *
 * NEVER returns null and NEVER throws — always a result object whose `status` says which of the
 * four cases this is. Callers render on status, not on truthiness.
 *
 * @param {object} args
 * @param {string} args.method - the selected analysis method
 * @param {string} args.alignment - FASTA/NEXUS alignment string
 * @param {string} args.tree - newick tree string (needs branch lengths)
 * @param {string} [args.treeSource] - 'user' | 'nj' | 'unknown'; see normalizeTreeSource
 * @param {object} [args.model] - from loadHitLikelihoodModel
 * @param {{likelyMin?: number, unlikelyMax?: number, resampleAvailable?: boolean}} [args.opts]
 * @returns {Promise<object>} see shell() for the full field list
 */
export async function estimateHitLikelihood({
	method,
	alignment,
	tree,
	treeSource,
	model,
	opts = {}
}) {
	const source = normalizeTreeSource(treeSource);

	if (!hasHitLikelihood(method)) {
		return shell(STATUS.NOT_APPLICABLE, {
			reason: 'method-not-supported',
			detail: 'Only MEME has a hit-likelihood estimate.',
			tree_source: source
		});
	}
	if (!alignment || !alignment.trim()) {
		return shell(STATUS.NOT_APPLICABLE, {
			reason: 'no-alignment',
			detail: 'No alignment yet.',
			tree_source: source
		});
	}
	// A topology-only tree is 'cannot-assess', not 'not-applicable': we have an alignment and the
	// user is entitled to know why there is no estimate.
	if (!treeHasBranchLengths(tree)) {
		return shell(STATUS.CANNOT_ASSESS, {
			reason: 'no-branch-lengths',
			detail: 'The tree carries no usable branch lengths, so tree depth cannot be measured.',
			tree_source: source
		});
	}

	let res;
	try {
		res = await runHitLikelihood(alignment, tree, model, opts);
	} catch (e) {
		// The estimate is non-essential, but "it broke" must not look like "nothing to report".
		console.error('MEME hit-likelihood estimate failed:', e);
		const features = safeFeatures(alignment, tree);
		return shell(STATUS.ERROR, {
			reason: 'model-error',
			detail: 'The hit-likelihood estimate could not be computed.',
			tree_source: source,
			...(features || {})
		});
	}

	const features = {
		num_seqs: res.num_seqs,
		num_sites: res.num_sites,
		median_pos_dist: res.median_pos_dist
	};
	const budget = substitutionBudget(res);

	if (res.status === STATUS.CANNOT_ASSESS) {
		// 'below-min' now means fewer than 3 sequences or no codons at all — so we can still give the
		// honest advice, just without a number. Rare by construction: 0 of the 3,000 production jobs
		// sampled hit it, and the other refusal (a median branch length above 10) is a units problem,
		// not a thin alignment, so it must NOT get the "too thin" copy.
		const allTooSmall =
			res.domain.reasons.length > 0 && res.domain.reasons.every((r) => r.code === 'below-min');
		return shell(STATUS.CANNOT_ASSESS, {
			reason: 'out-of-domain',
			detail: res.domain.summary,
			domain: res.domain,
			budget,
			recommendation: allTooSmall ? tooThinRecommendation(budget) : null,
			tree_source: source,
			tree_source_caveat: TREE_SOURCE_CAVEAT[source],
			...features
		});
	}

	return shell(STATUS.OK, {
		level: res.level,
		hit_probability: res.hit_probability,
		recommend_run: res.recommend_run,
		recommendation: recommendFor(res, opts),
		domain: res.domain,
		budget,
		tree_source: source,
		tree_source_caveat: TREE_SOURCE_CAVEAT[source],
		...features
	});
}

/** Best-effort features for the error path, so the UI can still show what we read. */
function safeFeatures(alignment, tree) {
	try {
		const f = extractHitLikelihoodFeatures(alignment, tree);
		return {
			num_seqs: f[0],
			num_sites: f[1],
			median_pos_dist: f[2],
			domain: checkFeatureDomain(f)
		};
	} catch {
		return null;
	}
}

/*
 * THERE IS NO noteForLevel() HERE ANY MORE, AND THAT IS DELIBERATE.
 *
 * This module used to carry a second set of per-level rate sentences ("about nine in ten did" /
 * "about half" / "about 1 in 20"), returned as `result.note`. Nothing rendered them: the panel
 * draws LEVEL[...].lead from MemeHitLikelihood.svelte instead. So the copy whose accuracy this
 * whole feature is judged on existed in two places, only one of which a user could ever read, with
 * no test tying them together — and the unit suite's rate-phrase anchors were pointed at the
 * unrendered copy. Two sets of numbers that can drift apart silently is exactly the failure this
 * feature already shipped once.
 *
 * The band sentences now live in one place, next to the band they describe, and the tests anchor on
 * that one. If a caller ever needs the rate as data rather than as prose, derive it from the band
 * rather than re-adding a parallel string table.
 */

/** Feature names the score actually depends on — re-exported so the UI can disclose them. */
export { LIVE_FEATURES };
