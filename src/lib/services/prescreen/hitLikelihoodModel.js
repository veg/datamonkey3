/**
 * hitLikelihoodModel.js — client-side MEME HIT-LIKELIHOOD estimate for DataMonkey (DM3).
 *
 * Label-free, geometry-only: given a codon alignment (FASTA or NEXUS) and a newick tree, it
 * estimates P(a full HyPhy MEME run reports at least one selected site). No server, no HyPhy.
 *
 * READ THIS BEFORE TRUSTING THE NUMBER. The model was trained on the label "MEME found >= 1
 * selected site", so it predicts what MEME will REPORT on this alignment — not whether the gene is
 * under selection, and not a statistical power calculation. It is also a gradient-boosted tree
 * ensemble, i.e. a step function: it is not monotone, and adding a sequence can move the score
 * down. Callers should present it as a coarse level, not as a precise percentage.
 *
 * Feature extraction is an EXACT port of lib/gate_features.py (pure string parsing, no deps) and
 * level thresholds mirror prescreen.py (likely >= 0.70, unlikely < 0.35). Those upstream filenames
 * are kept verbatim so the port stays traceable.
 *
 * Feature order is FROZEN: [num_seqs, num_sites, median_pos_dist, frac_p_defined].
 * Only the first THREE carry signal — see FRAC_P_DEFINED_CONST / BRANCH_SPLIT_COUNTS below.
 *
 * Scoring runs the exported GradientBoostingClassifier through the pure-JS tree walker in
 * treeEnsemble.js (~37 KB of coefficients, verified against the .onnx to ~1e-7). That is the only
 * backend the app ships: no ONNX runtime is a dependency of DM3 any more.
 *
 * createHitLikelihoodSession / scoreHitLikelihood keep the ONNX form alive for re-validating the JS
 * evaluator, but the runtime is INJECTED — nothing here imports one, so re-validation is an offline
 * chore with an ad-hoc install rather than a shipped dependency (and, previously, a native binary
 * that only existed for some CPU architectures).
 *
 * Usage (the shipped path):
 *   import { loadHitLikelihoodModel } from './hitLikelihood.js';
 *   import { runHitLikelihood } from './hitLikelihoodModel.js';
 *   const model = await loadHitLikelihoodModel();
 *   const res = await runHitLikelihood(alignmentString, newickString, model);
 *   // -> { status, level, hit_probability, recommend_run, num_seqs, num_sites,
 *   //      median_pos_dist, frac_p_defined, domain }
 *
 * Usage (offline ONNX re-validation, with an injected runtime and the .onnx next to this file):
 *   const session = await createHitLikelihoodSession(ort, readFileSync('meme_hit_likelihood.onnx'));
 *   const res = await runHitLikelihood(aln, nwk, session, ort.Tensor);
 */

import { loadTreeEnsemble, evalTreeEnsemble } from './treeEnsemble.js';

// ---------------------------------------------------------------------------
// Constants — the frozen feature contract and the level thresholds.
// ---------------------------------------------------------------------------

/** Frozen feature order. Must match the Python port and the exported model's input arity. */
export const FEATURE_NAMES = ['num_seqs', 'num_sites', 'median_pos_dist', 'frac_p_defined'];

/**
 * Number of BRANCH nodes in the shipped ensemble that split on each feature (1027 branch nodes
 * across 150 trees). Read straight out of the model, not asserted from memory.
 *
 * frac_p_defined has ZERO of them. It is a DEAD INPUT: it was in the training frame but the
 * trained GradientBoostingClassifier never selected it, so no value of it — 0, 1, -100, NaN —
 * can move the score by a single ULP (checked with a 4001-point sweep over [-100, 100] and
 * against onnxruntime directly). We keep passing it only because the exported model's input
 * tensor is shaped [1, 4]; dropping it requires re-exporting the model.
 */
export const BRANCH_SPLIT_COUNTS = {
	num_seqs: 281,
	num_sites: 452,
	median_pos_dist: 294,
	frac_p_defined: 0
};

/** The features that actually drive the score. Anything else in the vector is padding. */
export const LIVE_FEATURES = ['num_seqs', 'num_sites', 'median_pos_dist'];

/**
 * Constant stuffed into the 4th slot. frac_p_defined is only knowable AFTER a MEME run, so there
 * was never a way to compute it here — but see BRANCH_SPLIT_COUNTS: it is also unused by the
 * current model, so the placeholder is inert arithmetic rather than a leaked feature.
 * If the model is ever retrained and starts splitting on it, this constant becomes a real bug.
 * BRANCH_SPLIT_COUNTS is the tripwire, and treeEnsemble.js carries the same counts inside its
 * generated JSON, so a retrain that starts using the feature shows up in a diff.
 */
export const FRAC_P_DEFINED_CONST = 1.0;

/** Level thresholds — mirror prescreen.py:99-100,110-115. */
export const LIKELY_MIN = 0.7;
export const UNLIKELY_MAX = 0.35;

/** Result statuses. Distinct on purpose: "no score" is not one thing (see hitLikelihood.js). */
export const STATUS = {
	OK: 'ok',
	NOT_APPLICABLE: 'not-applicable',
	CANNOT_ASSESS: 'cannot-assess',
	ERROR: 'error'
};

/**
 * The range over which the ensemble is actually predicting rather than returning a memorised leaf.
 * These are the model's own split support, found by scanning each axis for the point at which the
 * output stops changing:
 *   num_seqs        lowest split ~3.5      highest ~500.4    (47-51 distinct steps)
 *   num_sites       lowest split ~15.0     highest ~7105     (100+ steps, erratic past ~1000)
 *   median_pos_dist lowest split ~1.24e-4  highest ~276.7    (43-52 steps)
 * Outside them the model is a constant with full apparent confidence, which is why the guard has to
 * exist: a time-calibrated tree (median branch length 10-50 "years") rails to 0.98 rather than
 * erroring. num_sites is capped at 2000 rather than 7105 because the splits past ~1000 are
 * single-outlier artifacts (10^5 codons scores LOWER than 800 codons).
 */
export const FEATURE_DOMAIN = {
	num_seqs: { min: 4, max: 500 },
	num_sites: { min: 17, max: 2000 },
	median_pos_dist: { min: 5e-4, max: 0.5 }
};

// ---------------------------------------------------------------------------
// Feature extraction — mirrors lib/gate_features.py exactly.
// ---------------------------------------------------------------------------

/**
 * Parse a FASTA or NEXUS alignment string. Autodetects: leading '>' => FASTA.
 * Returns { taxa, seqs }. Mirrors gate_features.parse_alignment (py:22-62).
 * NOTE: no gzip handling here — DM3's canonicalFasta is already decompressed.
 */
export function parseAlignment(text) {
	const head = text.length ? text[0] : '';
	if (head === '>') {
		// FASTA
		const taxa = [];
		const seqs = [];
		let cur = [];
		const lines = text.split(/\r?\n/);
		for (let raw of lines) {
			const line = raw.trim();
			if (line.startsWith('>')) {
				if (cur.length) {
					seqs.push(cur.join(''));
					cur = [];
				}
				// taxa.append(line[1:].split()[0])
				const rest = line.slice(1).trim();
				taxa.push(rest.split(/\s+/)[0]);
			} else if (line) {
				cur.push(line);
			}
		}
		if (cur.length) seqs.push(cur.join(''));
		return { taxa, seqs };
	}

	// NEXUS
	const taxa = [];
	const seqs = [];
	let inTl = false;
	let inMx = false;
	const lines = text.split(/\r?\n/);
	for (let raw of lines) {
		const s = raw.trim();
		if (!s) continue;
		const u = s.toUpperCase();
		if (u.startsWith('TAXLABELS')) {
			inTl = true;
			continue;
		}
		if (inTl) {
			// s.replace("'","").replace(";","").split()
			const cleaned = s.replace(/'/g, '').replace(/;/g, '').trim();
			if (cleaned) {
				for (const tok of cleaned.split(/\s+/)) if (tok) taxa.push(tok);
			}
			if (s.endsWith(';')) inTl = false;
			continue;
		}
		if (u.startsWith('MATRIX')) {
			inMx = true;
			continue;
		}
		if (inMx) {
			if (s === ';' || s.endsWith(';')) {
				if (s !== ';') {
					seqs.push(s.slice(0, -1).trim());
				}
				inMx = false;
				continue;
			}
			seqs.push(s);
		}
	}
	return { taxa, seqs };
}

/**
 * Read a newick tree string; return { medDist, nTips }.
 * medDist = median of POSITIVE branch lengths (0.0 if none). NOT patristic.
 * Mirrors gate_features.parse_newick_distances (py:65-78).
 *
 * medDist === 0.0 is a MISSING sentinel, never a measurement — see checkFeatureDomain.
 */
export function parseNewickDistances(nwk) {
	const s = (nwk || '').trim();
	const re = /:(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g;
	const bls = [];
	let m;
	while ((m = re.exec(s)) !== null) {
		bls.push(parseFloat(m[1]));
	}
	const pos = bls.filter((b) => b > 0);
	const medDist = pos.length ? median(pos) : 0.0;
	// n_tips = nwk.count(",") + 1
	let commas = 0;
	for (let i = 0; i < s.length; i++) if (s[i] === ',') commas++;
	const nTips = commas + 1;
	return { medDist, nTips };
}

/**
 * numpy.median: average of the two middle elements for even-length arrays.
 */
export function median(arr) {
	const a = arr.slice().sort((x, y) => x - y);
	const n = a.length;
	if (n === 0) return 0.0;
	const mid = Math.floor(n / 2);
	if (n % 2 === 1) return a[mid];
	return (a[mid - 1] + a[mid]) / 2;
}

/**
 * Return the frozen feature vector [num_seqs, num_sites, median_pos_dist, frac_p_defined].
 * Mirrors gate_features.extract_gate_features (py:81-93).
 *
 * The 4th element is always 1.0, and is inert — see FRAC_P_DEFINED_CONST.
 */
export function extractHitLikelihoodFeatures(alignmentText, newickText) {
	const { seqs: rawSeqs } = parseAlignment(alignmentText);
	const seqs = rawSeqs.filter((s) => s && s.length > 0);
	let numSeqs = seqs.length;
	const numSites = seqs.length ? Math.floor(seqs[0].length / 3) : 0; // codons
	const { medDist, nTips } = parseNewickDistances(newickText || '');
	if (numSeqs === 0) numSeqs = nTips; // fall back to tree tip count
	return [numSeqs, numSites, medDist, FRAC_P_DEFINED_CONST];
}

// ---------------------------------------------------------------------------
// Out-of-distribution guard — refuse to score rather than emit a memorised constant.
// ---------------------------------------------------------------------------

const LABELS = {
	num_seqs: 'The sequence count',
	num_sites: 'The alignment length',
	median_pos_dist: 'The median branch length'
};

function fmt(v) {
	return Number.isInteger(v) ? String(v) : Number(v.toPrecision(3)).toString();
}

function belowMessage(name, value, min) {
	if (name === 'num_seqs') {
		return `Only ${value} sequences — below the ${min} this estimate was fitted on.`;
	}
	if (name === 'num_sites') {
		return `Only ${value} codons — below the ${min} this estimate was fitted on.`;
	}
	return `Median branch length ${fmt(value)} is below the ${fmt(min)} substitutions/site this estimate was fitted on.`;
}

function aboveMessage(name, value, max) {
	if (name === 'num_seqs') {
		return `${value} sequences is beyond the ${max} this estimate was fitted on.`;
	}
	if (name === 'num_sites') {
		return `${value} codons is beyond the ${max} this estimate was fitted on.`;
	}
	// The usual cause is units: a time-calibrated or amino-acid tree, not substitutions/site.
	return `Median branch length ${fmt(value)} is above ${fmt(max)} substitutions/site — that is not a codon-model tree.`;
}

/**
 * Decide whether a feature vector is inside the range the model can actually speak to.
 *
 * This exists because none of the model's failure modes are loud. Outside its split support it
 * does not error and does not widen — it returns a constant leaf at full apparent confidence, and
 * the constants it returns are frequently the confident ones. Documented cases:
 *   NaN            fails every BRANCH_LEQ comparison and therefore routes down the "large value"
 *                  side of every split: (NaN, NaN, NaN, NaN) -> 0.9967, the most confident output
 *                  the model can produce. A parse failure would render as "99% — run MEME".
 *   median = 0     is parseNewickDistances' "no positive branch lengths" sentinel, and the model
 *                  scores it HIGHER than realistic small distances at 27/50 tested (seqs, sites)
 *                  combos: (50, 200, 0) = 0.822 vs (50, 200, 0.005) = 0.618. A topology-only tree
 *                  would score BETTER than a real shallow one.
 *   negatives      (50, 200, -0.02) is treated identically to 0 -> 0.822.
 *   n_seqs > 500   pins to 0.983 for every value up to 10^6.
 *   median > 0.5   plateaus at the model's own maximum, so every long-branch tree is auto-likely.
 *
 * @param {number[]} features - [num_seqs, num_sites, median_pos_dist, frac_p_defined]
 * @returns {{ok: boolean, reasons: Array<{feature: string, code: string, value: number,
 *   min?: number, max?: number, message: string}>, summary: string|null}}
 */
export function checkFeatureDomain(features) {
	const reasons = [];

	for (const name of LIVE_FEATURES) {
		const value = features[FEATURE_NAMES.indexOf(name)];
		const { min, max } = FEATURE_DOMAIN[name];

		if (!Number.isFinite(value)) {
			reasons.push({
				feature: name,
				code: 'non-finite',
				value,
				message: `${LABELS[name]} could not be read from the input.`
			});
			continue;
		}
		// median_pos_dist === 0 means "no branch lengths were parsed", not "the distance is zero".
		if (name === 'median_pos_dist' && value === 0) {
			reasons.push({
				feature: name,
				code: 'missing',
				value,
				message: 'The tree carries no usable branch lengths.'
			});
			continue;
		}
		if (value < min) {
			reasons.push({
				feature: name,
				code: 'below-min',
				value,
				min,
				max,
				message: belowMessage(name, value, min)
			});
			continue;
		}
		if (value > max) {
			reasons.push({
				feature: name,
				code: 'above-max',
				value,
				min,
				max,
				message: aboveMessage(name, value, max)
			});
		}
	}

	return { ok: reasons.length === 0, reasons, summary: reasons.length ? reasons[0].message : null };
}

// ---------------------------------------------------------------------------
// Scoring backends — pure JS by default, ONNX as an explicit opt-in.
// ---------------------------------------------------------------------------

// The exported classifier emits a 2-column probabilities tensor; class 1 is P(MEME reports a hit).
const PROB_OUTPUT = 'probabilities';

/**
 * The default backend: the vendored tree table walked in JS. ~37 KB of coefficients instead of
 * 13.2 MB of WASM, and identical to onnxruntime to ~1e-7 with zero level disagreements across
 * 2016 randomised + adversarial vectors (see treeEnsemble.js for the verification detail).
 * @returns {Promise<{backend: 'js', score: (features: number[]) => number, meta: object}>}
 */
export async function createHitLikelihoodScorer() {
	const model = await loadTreeEnsemble();
	return {
		backend: 'js',
		meta: model.meta,
		score: (features) => evalTreeEnsemble(model, features)
	};
}

/**
 * Create an ONNX InferenceSession for the model — the opt-in backend.
 * @param {object} ort - the onnxruntime module (onnxruntime-web or onnxruntime-node)
 * @param {string|ArrayBuffer|Uint8Array} model - URL/path or the raw .onnx bytes
 * @returns {Promise<object>} an InferenceSession
 */
export async function createHitLikelihoodSession(ort, model) {
	return await ort.InferenceSession.create(model);
}

/**
 * Score P(class 1) for a feature vector.
 *
 * Accepts either backend:
 *   scoreHitLikelihood(features, scorer)               // JS scorer from createHitLikelihoodScorer
 *   scoreHitLikelihood(features, session, ort.Tensor)  // ONNX session
 *
 * @param {number[]} features - [num_seqs, num_sites, median_pos_dist, frac_p_defined]
 * @param {object} backend - a scorer ({ score }) or an ONNX InferenceSession
 * @param {Function} [Tensor] - the ORT Tensor constructor, required for the ONNX form
 * @returns {Promise<number>} P(class 1)
 */
export async function scoreHitLikelihood(features, backend, Tensor) {
	if (backend && typeof backend.score === 'function') return backend.score(features);
	if (typeof Tensor !== 'function') {
		throw new Error('scoreHitLikelihood: pass a JS scorer, or an ONNX session plus ort.Tensor');
	}
	const session = backend;
	const input = new Tensor('float32', Float32Array.from(features), [1, features.length]);
	const feeds = { [session.inputNames[0]]: input };
	const out = await session.run(feeds);
	const probs = out[PROB_OUTPUT] ?? out[session.outputNames[session.outputNames.length - 1]];
	// probs.data is [P(class0), P(class1)] for the single input row.
	return Number(probs.data[1]);
}

/**
 * Assign a level from a hit probability. Mirrors prescreen.py:99-100,110-115.
 * 'likely' >= likelyMin; 'unlikely' < unlikelyMax; 'uncertain' in between.
 *
 * The names are deliberately not traffic-light colours: the value is a predicted OUTCOME of a MEME
 * run, not a verdict on the data, and nothing here blocks anything.
 */
export function levelOf(score, likelyMin = LIKELY_MIN, unlikelyMax = UNLIKELY_MAX) {
	if (score >= likelyMin) return 'likely';
	if (score < unlikelyMax) return 'unlikely';
	return 'uncertain';
}

// ---------------------------------------------------------------------------
// Combined entry point.
// ---------------------------------------------------------------------------

/**
 * Extract features, guard the domain, and (if in range) score.
 *
 * Never returns null, and never invents a number for input it cannot speak to: out-of-domain input
 * comes back as status 'cannot-assess' with the offending feature(s) in `domain.reasons`, so the
 * caller can say WHY instead of rendering blank space.
 *
 * @param {string} alignmentText - FASTA or NEXUS alignment
 * @param {string} newickText - newick tree (with branch lengths)
 * @param {object} backend - a JS scorer, or an ONNX InferenceSession (then pass Tensor)
 * @param {Function|object} [TensorOrOpts] - ort.Tensor for the ONNX form, otherwise opts
 * @param {{likelyMin?: number, unlikelyMax?: number}} [maybeOpts]
 * @returns {Promise<object>} { status, level, hit_probability, recommend_run, num_seqs, num_sites,
 *   median_pos_dist, frac_p_defined, domain }
 */
export async function runHitLikelihood(
	alignmentText,
	newickText,
	backend,
	TensorOrOpts,
	maybeOpts
) {
	const usingOnnx = typeof TensorOrOpts === 'function';
	const Tensor = usingOnnx ? TensorOrOpts : undefined;
	const opts = (usingOnnx ? maybeOpts : TensorOrOpts) || {};
	const likelyMin = opts.likelyMin ?? LIKELY_MIN;
	const unlikelyMax = opts.unlikelyMax ?? UNLIKELY_MAX;

	const features = extractHitLikelihoodFeatures(alignmentText, newickText);
	const domain = checkFeatureDomain(features);
	const base = {
		num_seqs: features[0],
		num_sites: features[1],
		median_pos_dist: features[2],
		frac_p_defined: features[3],
		domain
	};

	if (!domain.ok) {
		return {
			status: STATUS.CANNOT_ASSESS,
			level: null,
			hit_probability: null,
			recommend_run: null,
			...base
		};
	}

	const score = await scoreHitLikelihood(features, backend, Tensor);
	const level = levelOf(score, likelyMin, unlikelyMax);
	return {
		status: STATUS.OK,
		level,
		hit_probability: score,
		// Surfaced, not discarded: hitLikelihood.js turns this into the "run it anyway / consider X
		// instead" copy. Previously computed and dropped on the floor.
		recommend_run: level !== 'unlikely',
		...base
	};
}
