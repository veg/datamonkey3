/**
 * hitLikelihoodModel.js — client-side MEME HIT-LIKELIHOOD estimate for DataMonkey (DM3).
 *
 * Label-free, geometry-only: given a codon alignment (FASTA or NEXUS) and a newick tree, it
 * estimates P(a full HyPhy MEME run reports at least one selected site). No server, no HyPhy.
 *
 * READ THIS BEFORE TRUSTING THE NUMBER. The training label is the event the UI actually names:
 * "MEME reported at least one site at p <= 0.1". So it predicts what MEME will REPORT on this
 * alignment — not whether the gene is under selection, and not a statistical power calculation.
 * Callers should present it as a coarse level, not as a precise percentage.
 *
 * The model is an XGBoost gradient-boosted forest (500 trees, max_depth 6) and its score is
 * MONOTONE: non-decreasing in each of sequences, codons and median branch length, so adding data
 * can never move the estimate down. It is fit with native `monotone_constraints=(1,1,1)`, which
 * XGBoost enforces structurally at every split — a strictly stronger arrangement than this file
 * used to have, where the shipped model was an unconstrained depth-1 GBC standing in for a
 * constrained HistGBM the converter could not export, and its monotonicity was a coincidence of one
 * fit. Deleting the converter is what made the constraint shippable.
 *
 * BUT THE CONSTRAINT IS NOT IN THE ARTIFACT. `Booster.save_model()` does not persist
 * monotone_constraints — `grep monotone meme_gate.json` is empty — so nothing downstream of the
 * training run can read it, and the sidecar's `hyperparams.monotone_constraints` is free text. The
 * property is therefore MEASURED on the shipped file, not inherited from the training config:
 * verify_parity.py's SHAPE section sweeps every distinct split threshold on each axis (plus one
 * float32 step either side) against a spread of holdouts and requires the score never to fall —
 * 14,160 adjacent-pair comparisons — and fails the gate if it does. So a retrain that lost the
 * constraint would be caught by the same run that checks everything else about the artifact, rather
 * than by a reader trusting this paragraph.
 *
 * The previous model was non-monotone and trained on a proxy label (max LRT >= 5) over a population
 * unlike production — it badged alignments 'unlikely' that reported a site 72% of the time.
 *
 * Feature extraction is an EXACT port of lib/gate_features.py (pure string parsing, no deps).
 * The score is a raw predicted probability, NOT a post-hoc calibrated one; what is calibrated is
 * the choice of band thresholds — see LIKELY_MIN / UNLIKELY_MAX for the observed rates and the
 * population they were measured on.
 *
 * Feature order is FROZEN: [num_seqs, num_sites, median_pos_dist]. All three carry signal — see
 * BRANCH_SPLIT_COUNTS below.
 *
 * THERE IS NO ML RUNTIME IN THIS APP. Scoring walks XGBoost's own `save_model()` JSON directly in
 * ~40 lines (xgbEnsemble.js over meme_gate.json). There is no converter and no intermediate
 * representation: the bytes the ML team exports are the bytes the browser parses. Verified against
 * xgboost's own scoring of the same file to max |Δ| 4.4e-07 with zero band disagreements; the gate
 * that proves it is scripts/prescreen/verify_parity.py, which can be made to fail on demand
 * (--self-test) so a green run means something.
 *
 * Usage:
 *   import { loadHitLikelihoodModel } from './hitLikelihood.js';
 *   import { runHitLikelihood } from './hitLikelihoodModel.js';
 *   const model = await loadHitLikelihoodModel();
 *   const res = await runHitLikelihood(alignmentString, newickString, model);
 *   // -> { status, level, hit_probability, recommend_run, num_seqs, num_sites,
 *   //      median_pos_dist, domain }
 */

import { loadXgbModel, evalXgbModel } from './xgbEnsemble.js';

// ---------------------------------------------------------------------------
// Constants — the frozen feature contract and the level thresholds.
// ---------------------------------------------------------------------------

/** Frozen feature order. Must match the Python port and the exported model's input arity. */
export const FEATURE_NAMES = ['num_seqs', 'num_sites', 'median_pos_dist'];

/**
 * Number of BRANCH nodes in the shipped model that split on each feature — 4,523 interior nodes
 * across 500 trees and 9,546 nodes total.
 *
 * These are a CONVENIENCE COPY of a number the model already carries. The walker recomputes them
 * from meme_gate.json at load time and exposes them as `meta.splitCountsByFeature`; the unit test
 * asserts this constant against that, rather than against memory, so the pair cannot drift into
 * agreeing on a stale number. A retrain that shifts the model's attention between features then
 * shows up as a failing assertion rather than only as different probabilities.
 *
 * Every feature is live. The previous model carried a fourth input, frac_p_defined, that it never
 * split on; it is gone from the training frame, so the model takes 3 features and there is no
 * padding slot to keep inert.
 */
export const BRANCH_SPLIT_COUNTS = {
	num_seqs: 1481,
	num_sites: 1756,
	median_pos_dist: 1286
};

/**
 * The features that actually drive the score. Identical to FEATURE_NAMES by definition now (see
 * BRANCH_SPLIT_COUNTS) — aliased rather than duplicated so the two cannot drift apart, and kept
 * as a separate name because the UI imports it to disclose what the estimate reads.
 */
export const LIVE_FEATURES = FEATURE_NAMES;

/**
 * Band thresholds. These are the whole product: the score itself is never shown, only which side of
 * these two numbers it falls on, so a threshold that does not describe reality is a false statement
 * to a researcher no matter how good the model is.
 *
 * Calibrated OUT OF SAMPLE on the 5,982 production MEME jobs this model never trained on, against
 * an 84.79% base rate. Label = MEME reported at least one site at p <= 0.1. Clopper-Pearson 95% CIs:
 *
 *   unlikely   < 0.10    fires on  1.86% of submissions    5.4% report a site  [2.0%, 11.4%]
 *   uncertain  0.10-0.70 fires on 15.16% of submissions   51.9% report a site  [48.6%, 55.2%]
 *   likely    >= 0.70    fires on 82.98% of submissions   92.6% report a site  [91.8%, 93.3%]
 *
 * WHY THE LOW CUT IS 0.10 AND NOT 0.30. It is a real knee, not a preference. The hit rate is flat
 * at ~5% from 0.04 through 0.10 (7.1 / 4.9 / 5.4 / 5.4%) and then breaks: 11.2% at 0.12, 14.5% at
 * 0.15, 19.3% at 0.20, 28.6% at 0.30. Cut 0.10 dominates 0.05 — it fires on 44% more jobs at an
 * identical rate — and going past it is a bad trade: 0.10 -> 0.15 buys 43% more coverage for 2.7x
 * the error rate. The ML package proposed 0.30; at 28.6% [23.7, 34.0] a band labelled "unlikely"
 * would be wrong for more than one user in four. That is not a weak claim, it is an untrue one, and
 * it is the exact failure this model was retrained to fix (the previous gate badged alignments
 * 'unlikely' that hit 72% of the time). 0.10 is defensible on the observed rate; 0.30 is not.
 *
 * The band is also qualitatively coherent, which matters because copy describes it: the <0.10 jobs
 * have a median of 4 sequences (max 13) and ~140 codons at a median branch length of 0.002. Nothing
 * large or deep ever lands here, so the estimate cannot warn anyone off a well-powered dataset.
 *
 * WHY THE HIGH CUT STAYS 0.70 — and the reason is what it does to the MIDDLE band, not the top one.
 * At 0.70 the middle band is 51.9% [48.6, 55.2], a CI that straddles 50%, so "about half" is
 * literally true and the band means exactly one thing. Push it to 0.80 and the middle drifts to
 * 58%, to 0.90 and 67% — sliding toward the 84.8% base rate, at which point the middle band stops
 * carrying information and the copy goes mushy.
 *
 * WHAT 'unlikely' MAY NOT BE READ AS. 5.4% is small but it is not zero, n is only 111, and the
 * honest upper bound is 11.4%. Downstream copy must state a historical frequency over similar
 * alignments, never a probability about THIS alignment, and must never imply "will find nothing" or
 * say anything about whether the gene is under selection — the label is what MEME REPORTS. See
 * recommendation.js and noteForLevel() in hitLikelihood.js.
 *
 * verify_parity.py greps this file for both literals, so they cannot be changed here alone.
 */
export const LIKELY_MIN = 0.7;
export const UNLIKELY_MAX = 0.1;

/** Result statuses. Distinct on purpose: "no score" is not one thing (see hitLikelihood.js). */
export const STATUS = {
	OK: 'ok',
	NOT_APPLICABLE: 'not-applicable',
	CANNOT_ASSESS: 'cannot-assess',
	ERROR: 'error'
};

/**
 * WHAT THIS GUARD IS FOR, and what it deliberately no longer does.
 *
 * The previous model was non-monotone, so outside its split support it returned a memorised leaf at
 * full apparent confidence and the guard had to fence the support itself. This model being monotone
 * BY CONSTRUCTION, its behaviour outside the support is to saturate at the nearest ceiling or floor
 * rather than to return an arbitrary leaf — and saturation is the CORRECT extrapolation here, which
 * was checked against outcomes rather than assumed: of the 3,000 production jobs, the 7.5% that
 * saturate at least one axis were predicted 0.965 and observed 0.955. That is a one-point
 * over-prediction on n=225, i.e. accurate to within the noise, not confidently wrong. Fencing the
 * split support instead would refuse 25.9% of real submissions, mostly in the population where the
 * model is most confident AND most nearly correct.
 *
 * So FEATURE_DOMAIN is now an INPUT-VALIDITY guard: it rejects vectors that cannot describe a real
 * codon alignment, and nothing else. `null` means "no bound on this side".
 *   num_seqs >= 3        three taxa is the fewest that form an unrooted tree
 *   num_sites >= 1       an alignment with no codons is a parse failure
 *   median_pos_dist <= 10  the model's own documented contract: BL_CAP in the training pipeline,
 *                        the largest median branch length it was ever shown. Above it the tree is
 *                        almost certainly not in substitutions per site. Honest caveat: the outcome
 *                        data does NOT show the model failing there (n=45 predicted 0.846, observed
 *                        0.844) — this bound is a units sanity check, not a correction.
 * The `> 0` end of median_pos_dist is enforced by the 'missing' branch in checkFeatureDomain, which
 * is about a parse failure rather than a range.
 */
export const FEATURE_DOMAIN = {
	num_seqs: { min: 3, max: null },
	num_sites: { min: 1, max: null },
	median_pos_dist: { min: null, max: 10.0 }
};

/**
 * The training pipeline clipped median_pos_dist into [0.001, 10.0] before fitting (meme_gate.meta
 * .json records the same bl_floor / bl_cap, and verify_parity.py asserts the two agree). The clip
 * is NOT part of the model file — meme_gate.json is a tree table and nothing else — so the app has
 * to reproduce it, or it is scoring a different pipeline than the one that was validated.
 *
 * It is currently INERT, but for a DIFFERENT REASON than it used to be, and that is the point.
 * Measured on the shipped model, the splits on median_pos_dist span [0.00102927, 0.4023226]: the
 * floor sits just BELOW the lowest split, so flooring can never change a route, and the cap sits
 * well above the highest, so capping cannot either. The interval this comment used to state
 * ([0.0010058, 0.17963]) was the previous model's and is now wrong by more than 2x at the top —
 * the range MOVED on a retrain and the inertness had to be re-derived rather than re-asserted.
 * That is exactly why the clip is written down instead of skipped: it is one retrain away from
 * being load-bearing, and the failure mode of skipping it is silent divergence from the pipeline
 * that was validated. Note how narrow the margin at the floor is — 0.001 vs 0.00102927.
 *
 * It lives at the SCORING boundary, never in extraction. extractHitLikelihoodFeatures must keep
 * returning a raw 0.0 for "no branch lengths were parsed" — flooring it to 0.001 there would make
 * checkFeatureDomain's 'missing' branch unreachable and score a topology-only tree as if it were a
 * measurement.
 */
export const MODEL_INPUT_CLIP = {
	median_pos_dist: { floor: 0.001, cap: 10.0 }
};

/**
 * Apply MODEL_INPUT_CLIP to a feature vector, returning a copy. Idempotent, and applied at every
 * entry into the model rather than once, so no backend can be reached around it.
 * @param {number[]} features
 * @returns {number[]}
 */
export function clipModelInput(features) {
	const out = features.slice();
	const i = FEATURE_NAMES.indexOf('median_pos_dist');
	const { floor, cap } = MODEL_INPUT_CLIP.median_pos_dist;
	// Non-finite values are the domain guard's business; leave them alone rather than clamp them
	// into a plausible-looking number.
	if (Number.isFinite(out[i])) out[i] = Math.min(Math.max(out[i], floor), cap);
	return out;
}

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
 * Return the frozen feature vector [num_seqs, num_sites, median_pos_dist].
 * Mirrors gate_features.extract_gate_features (py:81-93).
 *
 * UNCLIPPED on purpose — see MODEL_INPUT_CLIP. What comes out of here is what was read from the
 * input, including the 0.0 that means "no positive branch lengths were found".
 */
export function extractHitLikelihoodFeatures(alignmentText, newickText) {
	const { seqs: rawSeqs } = parseAlignment(alignmentText);
	const seqs = rawSeqs.filter((s) => s && s.length > 0);
	let numSeqs = seqs.length;
	const numSites = seqs.length ? Math.floor(seqs[0].length / 3) : 0; // codons
	const { medDist, nTips } = parseNewickDistances(newickText || '');
	if (numSeqs === 0) numSeqs = nTips; // fall back to tree tip count
	return [numSeqs, numSites, medDist];
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

// Both helpers stay complete for all three features even though FEATURE_DOMAIN currently leaves
// four of the six bounds null, so the unreachable branches are unreachable because of the DATA, not
// because the code forgot them. Re-introducing a bound should not also mean re-writing its message.
function belowMessage(name, value, min) {
	if (name === 'num_seqs') {
		return `Only ${value} sequences — at least ${min} are needed to form a tree.`;
	}
	if (name === 'num_sites') {
		return `No codons were read from the alignment (${min} is the minimum).`;
	}
	return `Median branch length ${fmt(value)} is below the ${fmt(min)} substitutions/site this estimate can read.`;
}

function aboveMessage(name, value, max) {
	if (name === 'num_seqs') {
		return `${value} sequences is beyond the ${max} this estimate can read.`;
	}
	if (name === 'num_sites') {
		return `${value} codons is beyond the ${max} this estimate can read.`;
	}
	// The usual cause is units: a time-calibrated or amino-acid tree, not substitutions/site.
	return `Median branch length ${fmt(value)} is above ${fmt(max)} substitutions/site, so this tree is probably not measured in substitutions per site.`;
}

/**
 * Decide whether a feature vector describes an alignment the model can be asked about.
 *
 * This is an INPUT-VALIDITY check, not an out-of-distribution fence — see FEATURE_DOMAIN for why
 * the fence was removed. What it still catches is input that is not a measurement at all, because
 * none of those failures are loud: the model does not error on nonsense, it scores it.
 *   NaN            THIS GUARD IS NOW THE ONLY THING STANDING BETWEEN A PARSE FAILURE AND A THROWN
 *                  EXCEPTION. evalXgbModel refuses non-finite input outright (it does not implement
 *                  XGBoost's default_left routing, deliberately — see the note there), so a NaN
 *                  reaching the scorer is an uncaught error, not a wrong number. Reaching it would
 *                  still be a bug: this guard turns it into an explanation the user can read. For
 *                  scale, when the old evaluator DID route NaN it produced 0.99997 for
 *                  (NaN, NaN, NaN) — the most confident output the model can emit — so a parse
 *                  failure rendered as "99% — run MEME". That is the hazard this branch prevents.
 *   median <= 0    is parseNewickDistances' "no positive branch lengths" sentinel, not a distance.
 *                  It scores LOWER than a real shallow tree — (50, 200, 0) -> 0.433 vs
 *                  (50, 200, 0.005) -> 0.920 — so it does not fabricate confidence, it fabricates
 *                  discouragement, and 0.433 lands in 'uncertain' where a real shallow tree of the
 *                  same shape is 'likely'. Still a parse failure either way, so it is still
 *                  refused. Do not delete this branch on the grounds that a monotone model makes 0
 *                  safe. Negative medians (hand-built vectors only; the parser filters to
 *                  positives) take the same branch and score identically to 0.
 *   median > 10    past the training pipeline's cap. See FEATURE_DOMAIN — a units problem, not a
 *                  model failure.
 * Saturation is NOT a failure here: >=298 sequences, >=3687 codons and >=0.4024 median branch length
 * are this model's topmost splits on each axis, and past them the score is pinned exactly (verified:
 * 10x each of those values changes nothing). On production data those ceilings track the observed
 * hit rate to within a point.
 *
 * @param {number[]} features - [num_seqs, num_sites, median_pos_dist]
 * @returns {{ok: boolean, reasons: Array<{feature: string, code: string, value: number,
 *   min?: number, max?: number, message: string}>, summary: string|null}}
 */
export function checkFeatureDomain(features) {
	const reasons = [];

	for (let i = 0; i < FEATURE_NAMES.length; i++) {
		const name = FEATURE_NAMES[i];
		const value = features[i];
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
		// median_pos_dist <= 0 means "no branch lengths were parsed", not "the distance is zero".
		if (name === 'median_pos_dist' && value <= 0) {
			reasons.push({
				feature: name,
				code: 'missing',
				value,
				message: 'The tree carries no usable branch lengths.'
			});
			continue;
		}
		// A null bound means the model saturates in that direction rather than failing there.
		if (min !== null && value < min) {
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
		if (max !== null && value > max) {
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
// Scoring — one backend, because there is only one model file and no runtime.
// ---------------------------------------------------------------------------

/**
 * The only backend. Walks XGBoost's own JSON in JS: ~735 KB of model (~169 KB gzipped) and ~9 KB of
 * walker, versus the 13.5 MB of WASM an ML runtime would have cost. Reproduces xgboost's own
 * scoring of the same bytes to max |Δ| 4.409e-07 with zero band disagreements over 5,532 vectors,
 * 3,000 of them real production jobs.
 *
 * There is no second backend and no injection seam any more. There used to be one so the JS
 * evaluator could be re-validated against the runtime that produced the model; that job now belongs
 * to scripts/prescreen/verify_parity.py, which does it in CI against a pip-installed xgboost. An
 * escape hatch whose only purpose was re-validation has no reason to exist once re-validation is a
 * CI step — and every branch it added here was a branch nothing in the shipped app could reach.
 *
 * @returns {Promise<{backend: 'js', score: (features: number[]) => number, meta: object}>}
 */
export async function createHitLikelihoodScorer() {
	const model = await loadXgbModel();
	return {
		backend: 'js',
		meta: model.meta,
		score: (features) => evalXgbModel(model, clipModelInput(features))
	};
}

/**
 * Score P(MEME reports at least one site at p <= 0.1) for a feature vector.
 *
 * @param {number[]} features - [num_seqs, num_sites, median_pos_dist], UNCLIPPED
 * @param {{score: (features: number[]) => number}} scorer - from createHitLikelihoodScorer
 * @returns {Promise<number>}
 */
export async function scoreHitLikelihood(features, scorer) {
	// Applied here as well as inside the scorer — the clip is idempotent, and doing it at every
	// entry into the model means no caller can reach the model around it.
	const x = clipModelInput(features);
	if (!scorer || typeof scorer.score !== 'function') {
		throw new Error('scoreHitLikelihood: pass a scorer from createHitLikelihoodScorer()');
	}
	return scorer.score(x);
}

/**
 * Assign a level from a hit probability.
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
 * @param {{score: (features: number[]) => number}} scorer - from createHitLikelihoodScorer
 * @param {{likelyMin?: number, unlikelyMax?: number}} [opts]
 * @returns {Promise<object>} { status, level, hit_probability, recommend_run, num_seqs, num_sites,
 *   median_pos_dist, domain }
 */
export async function runHitLikelihood(alignmentText, newickText, scorer, opts = {}) {
	const likelyMin = opts.likelyMin ?? LIKELY_MIN;
	const unlikelyMax = opts.unlikelyMax ?? UNLIKELY_MAX;

	const features = extractHitLikelihoodFeatures(alignmentText, newickText);
	const domain = checkFeatureDomain(features);
	// The reported features are the RAW ones, not the clipped ones the model saw: the panel is
	// telling the user what is in their file.
	const base = {
		num_seqs: features[0],
		num_sites: features[1],
		median_pos_dist: features[2],
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

	const score = await scoreHitLikelihood(features, scorer);
	const level = levelOf(score, likelyMin, unlikelyMax);
	return {
		status: STATUS.OK,
		level,
		hit_probability: score,
		// Surfaced, not discarded — it was previously computed and dropped on the floor. It is a
		// plain "is this the low band" flag for a caller that wants one; it is NOT a routing signal.
		// recommendation.js documents why there is no "consider X instead" branch to feed: the model
		// has one training label and no evidence about any other method.
		recommend_run: level !== 'unlikely',
		...base
	};
}
