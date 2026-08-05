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
	createHitLikelihoodSession,
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
	'Gradient-boosted trees over three alignment-geometry features (sequences, codons, median branch length), trained on whether MEME reported at least one selected site.';

// Both live in an import-free leaf module so a caller can ask "is there an estimate for this
// method?" and "is this tree usable?" without loading the estimator — see scope.js.
export { hasHitLikelihood, treeHasBranchLengths };

/**
 * Normalise where the tree came from. NJ branch lengths are NUCLEOTIDE distances — roughly 3x the
 * codon-model lengths MEME actually fits — and median_pos_dist is one of the model's three live
 * features, so the difference is not cosmetic: at 5 seqs x 300 codons, d=0.05 scores 0.32
 * ('unlikely') while d=0.15 scores 0.66 ('uncertain'). We do NOT rescale (an unvalidated fudge
 * factor is worse science than a disclosure); we label the estimate optimistic and let the UI say
 * so.
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
 * THE ONLY SHIPPED BACKEND IS PURE JS. The model is one TreeEnsembleClassifier — 150 trees, ~2200
 * numbers — so treeEnsemble.js walks it directly for ~37 KB (~11 KB gzipped) instead of pulling
 * 13.2 MB of ONNX Runtime WASM to evaluate a tree walk and an addition. Verified against the .onnx
 * through onnxruntime-node: max |Δ| 8.5e-8 over 2016 vectors, zero level disagreements, and 12/12
 * golden fixtures inside 7.4e-9. It also means the estimate fetches nothing from the network, has
 * no native binary anywhere in its test path, and runs on any CPU architecture.
 *
 * The ONNX runtime is NOT a dependency of this app any more. Re-validating the JS evaluator against
 * the real runtime is still possible — pass an injected `ort` module plus the .onnx bytes (see
 * meme_hit_likelihood.onnx next to this file) — but nothing in the shipped bundle imports one.
 *
 * @param {object} [deps] - { ort, model }. Both required together for the injected ONNX form.
 * @returns {Promise<{backend: string, score: Function|null, session?: object, Tensor?: Function}>}
 */
export async function loadHitLikelihoodModel(deps = {}) {
	const injected = !!deps.ort;
	if (_modelPromise && !injected) return _modelPromise;

	const build = async () => {
		if (!injected) return createHitLikelihoodScorer();
		if (!deps.model) {
			throw new Error('loadHitLikelihoodModel: the injected ONNX form needs { ort, model }');
		}
		const session = await createHitLikelihoodSession(deps.ort, deps.model);
		return {
			backend: 'onnx',
			session,
			Tensor: deps.ort.Tensor,
			score: null // scoreHitLikelihood takes the (session, Tensor) form for this backend
		};
	};

	const p = build();
	if (!injected) _modelPromise = p; // cache only the real (non-injected) model
	return p;
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
		note: null,
		caveat: HIT_LIKELIHOOD_CAVEAT,
		basis: MODEL_BASIS,
		recommendation: null,
		num_seqs: null,
		num_sites: null,
		median_pos_dist: null,
		frac_p_defined: null,
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
 * @param {object} [args.model] - from loadHitLikelihoodModel (preferred)
 * @param {object} [args.session] - ONNX InferenceSession (legacy/ONNX form)
 * @param {Function} [args.Tensor] - the ORT Tensor constructor (legacy/ONNX form)
 * @param {{likelyMin?: number, unlikelyMax?: number, resampleAvailable?: boolean}} [args.opts]
 * @returns {Promise<object>} see shell() for the full field list
 */
export async function estimateHitLikelihood({
	method,
	alignment,
	tree,
	treeSource,
	model,
	session,
	Tensor,
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

	const backend = model && model.score ? model : (model && model.session) || session;
	const tensorCtor = Tensor || (model && model.Tensor);

	let res;
	try {
		res = await runHitLikelihood(alignment, tree, backend, tensorCtor, opts);
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
		median_pos_dist: res.median_pos_dist,
		frac_p_defined: res.frac_p_defined
	};
	const budget = substitutionBudget(res);

	if (res.status === STATUS.CANNOT_ASSESS) {
		// An alignment below the model's range is, by construction, an alignment nobody should be
		// running MEME on — so we can still give the honest advice, just without a number.
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
		note: noteForLevel(res.level),
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
			frac_p_defined: f[3],
			domain: checkFeatureDomain(f)
		};
	} catch {
		return null;
	}
}

/**
 * One-line, honest guidance per level. Says what the estimate is about (a MEME run) rather than
 * grading the data, and avoids a power claim the model cannot support — it predicts whether MEME
 * will REPORT anything, which is not the same as whether the alignment has power.
 */
export function noteForLevel(level) {
	switch (level) {
		case 'likely':
			return 'A MEME run on this alignment would probably report at least one site.';
		case 'uncertain':
			return 'A MEME run here could go either way.';
		case 'unlikely':
			return 'A MEME run on this alignment would probably report nothing.';
		default:
			return '';
	}
}

/** Feature names the score actually depends on — re-exported so the UI can disclose them. */
export { LIVE_FEATURES };
