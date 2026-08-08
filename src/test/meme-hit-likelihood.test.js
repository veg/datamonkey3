/**
 * Unit tests for the MEME hit-likelihood estimate.
 *
 * Scoring runs through the SHIPPED path — `loadHitLikelihoodModel()` -> xgbEnsemble.js walking
 * XGBoost's own `save_model()` output (meme_gate.json) — which is exactly what the browser
 * executes. There is no converter, no intermediate representation and no ML runtime anywhere in
 * this file, so it runs on any CPU architecture; two suites ago this could not even be COLLECTED on
 * an x64 node, because the ONNX runtime it imported shipped no darwin/x64 binary.
 *
 * FOUR THINGS IN HERE ARE LOAD-BEARING RATHER THAN ROUTINE, and each is marked where it lives:
 *
 *   1. THE GOLDEN VECTORS COME FROM XGBOOST, NOT FROM THIS CODE. golden.fixtures.json is written by
 *      `verify_parity.py --emit-golden`, which scores the shipped file with
 *      `xgboost.Booster.inplace_predict`. If those expectations were ever recorded from the JS
 *      walker the comparison would be circular — it would assert only that the walker is
 *      deterministic — so the file's `generated_from` is asserted here, not just trusted.
 *
 *   2. THE WALKER MUST REFUSE MODELS IT CANNOT SCORE. Deleting the converter deleted the build-time
 *      failure that used to meet an unsupported construct. A walker that just walks returns a
 *      confident wrong number instead, and a researcher cannot tell a correct 0.19 from a 0.19
 *      produced by summing the wrong output group. Every guard rail is exercised.
 *
 *   3. THE COPY HAS TO BE TRUE AT THE OBSERVED RATE. The band names and the sentences under them
 *      make checkable claims ("about 1 in 20"), and the previous gate shipped a band labelled
 *      'unlikely' whose alignments reported a site 72% of the time. Nothing in the old suite
 *      noticed, because nothing in it compared a sentence to an outcome. The calibration block
 *      does exactly that, against real completed MEME jobs.
 *
 *   4. THE ESTIMATE MAY ONLY EVER TALK ABOUT MEME. The model was trained on one label. See the
 *      final describe block for why that is enforced by state enumeration rather than by a grep.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
	hasHitLikelihood,
	treeHasBranchLengths,
	normalizeTreeSource,
	loadHitLikelihoodModel,
	estimateHitLikelihood,
	hitLikelihoodError,
	STATUS,
	MODEL_BASIS,
	HIT_LIKELIHOOD_CAVEAT
} from '../lib/services/prescreen/hitLikelihood.js';
import {
	extractHitLikelihoodFeatures,
	checkFeatureDomain,
	clipModelInput,
	levelOf,
	scoreHitLikelihood,
	runHitLikelihood,
	BRANCH_SPLIT_COUNTS,
	FEATURE_DOMAIN,
	FEATURE_NAMES,
	LIVE_FEATURES,
	LIKELY_MIN,
	UNLIKELY_MAX,
	MODEL_INPUT_CLIP
} from '../lib/services/prescreen/hitLikelihoodModel.js';
import {
	recommendFor,
	substitutionBudget,
	ROUTING
} from '../lib/services/prescreen/recommendation.js';
import {
	prepareXgbModel,
	evalXgbModel,
	parseBaseScore,
	EXPECTED_FEATURES,
	EXPECTED_FEATURE_COUNT
} from '../lib/services/prescreen/xgbEnsemble.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const PRESCREEN = join(HERE, '..', 'lib', 'services', 'prescreen');
const MODEL_FILE = join(PRESCREEN, 'meme_gate.json');

const featureFixtures = JSON.parse(readFileSync(join(PRESCREEN, 'feature.fixtures.json'), 'utf8'));
const golden = JSON.parse(readFileSync(join(PRESCREEN, 'golden.fixtures.json'), 'utf8'));
const sidecar = JSON.parse(readFileSync(join(PRESCREEN, 'meme_gate.meta.json'), 'utf8'));

/**
 * The shipped model file, read from disk.
 *
 * Read as BYTES and parsed here, deliberately, while `model` below comes through the app's own
 * `import('./meme_gate.json?raw')`. The two are asserted to score identically, which is how the
 * "the bytes the ML team exports are the bytes the browser parses" claim becomes a test rather
 * than a comment: if Vite's handling of the model ever stopped being byte-preserving, these two
 * would diverge.
 */
const modelBytes = readFileSync(MODEL_FILE);
const modelDoc = JSON.parse(modelBytes.toString('utf8'));
const MODEL_SHA256 = createHash('sha256').update(modelBytes).digest('hex');

let model; // the shipped scorer, loaded exactly as the browser loads it
let fromDisk; // the same model, parsed from the file's bytes here

beforeAll(async () => {
	model = await loadHitLikelihoodModel();
	fromDisk = prepareXgbModel(modelDoc);
});

// -------------------------------------------------------------------------------------------
// Scope, tree and source plumbing
// -------------------------------------------------------------------------------------------

describe('method scope', () => {
	it('applies to MEME only (case-insensitive)', () => {
		expect(hasHitLikelihood('meme')).toBe(true);
		expect(hasHitLikelihood('MEME')).toBe(true);
		expect(hasHitLikelihood('fel')).toBe(false);
		expect(hasHitLikelihood('busted')).toBe(false);
		expect(hasHitLikelihood(null)).toBe(false);
	});
});

describe('treeHasBranchLengths', () => {
	it('accepts a tree with positive branch lengths', () => {
		expect(treeHasBranchLengths('((a:0.1,b:0.2):0.05,c:0.3);')).toBe(true);
	});
	it('rejects a topology-only tree', () => {
		expect(treeHasBranchLengths('((a,b),c);')).toBe(false);
	});
	it('rejects empty / non-string input', () => {
		expect(treeHasBranchLengths('')).toBe(false);
		expect(treeHasBranchLengths(null)).toBe(false);
	});
});

describe('normalizeTreeSource', () => {
	it('maps the store keys DM3 actually uses', () => {
		expect(normalizeTreeSource('user')).toBe('user');
		expect(normalizeTreeSource('usertree')).toBe('user');
		expect(normalizeTreeSource('nj')).toBe('inferred-nj');
		expect(normalizeTreeSource(undefined)).toBe('unknown');
	});
});

// -------------------------------------------------------------------------------------------
// Feature extraction
// -------------------------------------------------------------------------------------------

describe('feature extraction', () => {
	// Each fixture carries its own derivation in `why`, so the expectations are checkable by
	// reading them rather than by having been recorded from this code. See feature.fixtures.json.
	it('exposes exactly the three features every other artifact declares', () => {
		expect(FEATURE_NAMES).toEqual(['num_seqs', 'num_sites', 'median_pos_dist']);
		expect(EXPECTED_FEATURES).toEqual(FEATURE_NAMES);
		expect(EXPECTED_FEATURE_COUNT).toBe(3);
		expect(featureFixtures._about.features).toEqual(FEATURE_NAMES);
		expect(sidecar.features).toEqual(FEATURE_NAMES);
		expect(golden.features).toEqual(FEATURE_NAMES);
	});

	for (const fx of featureFixtures.cases) {
		it(`matches on fixture: ${fx.name}`, () => {
			const got = extractHitLikelihoodFeatures(fx.alignment, fx.tree);
			// Width is asserted, not assumed. The previous suite indexed got[3] against a fixture that
			// no longer had a 4th element, so `undefined === undefined` passed and the assertion had
			// quietly stopped testing anything.
			expect(got).toHaveLength(FEATURE_NAMES.length);
			expect(got[0]).toBe(fx.expected[0]); // num_seqs
			expect(got[1]).toBe(fx.expected[1]); // num_sites
			expect(Math.abs(got[2] - fx.expected[2])).toBeLessThan(1e-12); // median_pos_dist
		});
	}
});

// -------------------------------------------------------------------------------------------
// The artifact: what is shipped, and that it is what everything else says it is
// -------------------------------------------------------------------------------------------

describe('the shipped model artifact', () => {
	it('is the file the golden fixtures were generated from', () => {
		// Hash the bytes on disk rather than pattern-matching the field. A /^[0-9a-f]{64}$/ check
		// passes for ANY hash, so it would not notice fixtures regenerated against a different model
		// than the one sitting next to them — the single failure this pin exists to catch.
		expect(golden.model_sha256).toBe(MODEL_SHA256);
	});

	it('declares itself as an XGBoost binary:logistic gbtree with three inputs', () => {
		expect(model.meta.objective).toBe('binary:logistic');
		expect(model.meta.booster).toBe('gbtree');
		expect(model.meta.features).toEqual(FEATURE_NAMES);
		expect(model.meta.nTrees).toBe(500);
		expect(model.backend).toBe('js');
	});

	it('matches the structure BRANCH_SPLIT_COUNTS claims, read from the model rather than memory', () => {
		// hitLikelihoodModel.js writes these down for the UI to disclose. Asserting the constant
		// against the model's own recomputed counts is what stops the pair drifting into agreeing on
		// a stale number: a retrain that moves the model's attention between features fails here
		// instead of silently making the disclosure false.
		expect(BRANCH_SPLIT_COUNTS).toEqual(model.meta.splitCountsByFeature);
		// And every feature is live — there is no inert padding slot any more.
		for (const name of FEATURE_NAMES) {
			expect(model.meta.splitCountsByFeature[name]).toBeGreaterThan(0);
		}
		expect(LIVE_FEATURES).toEqual(FEATURE_NAMES);
	});

	it('routes no node on missing input, which is why the walker may refuse NaN', () => {
		// evalXgbModel deliberately does not implement default_left. That is only safe while nothing
		// in the model depends on it; this is the assertion that makes the choice reviewable rather
		// than a comment nobody re-checks after a retrain.
		expect(model.meta.defaultLeftNodes).toBe(0);
	});

	it('agrees with the same file read straight off disk', () => {
		// `model` came through the app's `import('./meme_gate.json?raw')`; `fromDisk` came through
		// readFileSync. Equal scores mean the bundler handed the browser the artifact's own bytes.
		for (const v of golden.vectors) {
			expect(model.score(v.input)).toBe(evalXgbModel(fromDisk, v.input));
		}
	});

	it('carries a sidecar whose clip matches the one the app applies', () => {
		expect(sidecar.bl_floor).toBe(MODEL_INPUT_CLIP.median_pos_dist.floor);
		expect(sidecar.bl_cap).toBe(MODEL_INPUT_CLIP.median_pos_dist.cap);
	});
});

// -------------------------------------------------------------------------------------------
// Parity with XGBoost, via fixtures XGBoost itself wrote
// -------------------------------------------------------------------------------------------

describe('model parity (the JS walker vs XGBoost, on the same bytes)', () => {
	it('was generated from XGBoost and not from the code under test', () => {
		// The one property that decides whether this whole block means anything. Fixtures recorded
		// from the JS walker would assert only that the walker is deterministic.
		expect(golden.generated_from).toBe('xgboost:meme_gate.json');
		expect(golden.generator).toMatch(/verify_parity\.py/);
		expect(golden.xgboost_version).toMatch(/^\d+\.\d+/);
	});

	it('reproduces every golden vector within 1e-6', () => {
		let maxDiff = 0;
		let worst = null;
		for (const v of golden.vectors) {
			const d = Math.abs(evalXgbModel(fromDisk, v.input) - v.expected_prob);
			if (d > maxDiff) {
				maxDiff = d;
				worst = v.input;
			}
		}
		expect(maxDiff, `worst vector ${JSON.stringify(worst)}`).toBeLessThan(1e-6);
	});

	it('puts every golden vector in the band XGBoost puts it in', () => {
		// The binding assertion. The delta above is decorative by comparison: a researcher reads the
		// band, never the number, so agreement on the band is the claim worth making.
		for (const v of golden.vectors) {
			expect(levelOf(evalXgbModel(fromDisk, v.input)), JSON.stringify(v.input)).toBe(
				v.expected_level
			);
		}
	});

	it('covers both band cuts from both sides', () => {
		// Fixtures that only sample the flat middle of a band cannot fail on a routing bug small
		// enough to be plausible. These are the vectors that can.
		for (const cut of [UNLIKELY_MAX, LIKELY_MIN]) {
			const near = golden.vectors.filter((v) => Math.abs(v.expected_prob - cut) < 1e-3);
			expect(near.filter((v) => v.expected_prob < cut).length, `below ${cut}`).toBeGreaterThan(0);
			expect(near.filter((v) => v.expected_prob >= cut).length, `above ${cut}`).toBeGreaterThan(0);
		}
	});

	it('covers values sitting exactly on the model’s own split thresholds', () => {
		// XGBoost routes `value < threshold` LEFT, so a value ON a threshold goes RIGHT. `<=` differs
		// ONLY on these rows — which is why a comparison-operator bug survives any amount of random
		// testing and is caught here with certainty. Thresholds are read out of the model, not
		// hard-coded, so this cannot rot into checking stale numbers.
		const thresholds = FEATURE_NAMES.map(() => new Set());
		for (const t of modelDoc.learner.gradient_booster.model.trees) {
			for (let i = 0; i < t.left_children.length; i++) {
				if (t.left_children[i] !== -1) {
					thresholds[t.split_indices[i]].add(Math.fround(t.split_conditions[i]));
				}
			}
		}
		const onThreshold = golden.vectors.filter((v) =>
			v.input.every((x, f) => thresholds[f].has(Math.fround(x)))
		);
		expect(onThreshold.length).toBeGreaterThanOrEqual(3);

		// And prove the coverage is not decorative: flipping `<` to `<=` must move at least one of
		// them. Re-walked here with the opposite comparison, over the same compiled trees.
		const flipped = (m, features) => {
			const x = features.map(Math.fround);
			let margin = m.base;
			for (const t of m.trees) {
				let i = 0;
				while (t.left[i] !== -1) i = x[t.feat[i]] <= t.thr[i] ? t.left[i] : t.right[i];
				margin += t.thr[i];
			}
			return 1 / (1 + Math.exp(-margin));
		};
		const moved = onThreshold.filter(
			(v) => Math.abs(flipped(fromDisk, v.input) - v.expected_prob) > 1e-6
		);
		expect(
			moved.length,
			'no on-threshold vector distinguishes `<` from `<=` — the fixtures cannot catch the ' +
				'comparison bug they exist for'
		).toBe(onThreshold.length);
	});

	it('scores the same through the loaded scorer as through the raw walker', () => {
		// model.score() applies MODEL_INPUT_CLIP first. It is inert on this fixture set — every
		// median sits inside [floor, cap] — so the two must agree EXACTLY, and any future fixture
		// that breaks that assumption fails the guard below rather than this comparison.
		const { floor, cap } = MODEL_INPUT_CLIP.median_pos_dist;
		for (const v of golden.vectors) {
			expect(v.input[2], JSON.stringify(v.input)).toBeGreaterThanOrEqual(floor);
			expect(v.input[2], JSON.stringify(v.input)).toBeLessThanOrEqual(cap);
			expect(model.score(v.input)).toBe(evalXgbModel(fromDisk, v.input));
		}
	});
});

// -------------------------------------------------------------------------------------------
// base_score, the one field that scales every score in the model
// -------------------------------------------------------------------------------------------

describe('parseBaseScore', () => {
	it('reads the bracketed string form XGBoost 3.4 actually writes', () => {
		// The trap the ML team's own walker fell into: parseFloat("[8.516667E-1]") is NaN.
		expect(parseBaseScore('[8.516667E-1]')).toBeCloseTo(0.8516667, 12);
		expect(parseBaseScore(' [0.5] ')).toBe(0.5);
	});

	it('reads the plain-number form older writers emit', () => {
		expect(parseBaseScore(0.25)).toBe(0.25);
	});

	it('refuses a multi-component intercept rather than taking the first element', () => {
		expect(() => parseBaseScore('[0.3,0.3,0.4]')).toThrow(/components/i);
	});

	it('refuses a truncated number rather than returning a plausible prefix', () => {
		// parseFloat("8.516667E-") would return 8.516667. This must not.
		expect(() => parseBaseScore('[8.516667E-]')).toThrow(/not a number/i);
		expect(() => parseBaseScore('[]')).toThrow(/not a number/i);
		expect(() => parseBaseScore('[0x1p-1]')).toThrow(/not a number/i);
	});

	it('refuses an intercept outside (0, 1), where the logit is infinite', () => {
		expect(() => parseBaseScore('[0]')).toThrow(/outside/i);
		expect(() => parseBaseScore('[1]')).toThrow(/outside/i);
		expect(() => parseBaseScore('[-0.2]')).toThrow(/outside/i);
	});

	it('refuses a missing or wrong-typed field', () => {
		expect(() => parseBaseScore(undefined)).toThrow(/missing/i);
		expect(() => parseBaseScore(null)).toThrow(/expected a number/i);
	});

	it('agrees with what the shipped model declares', () => {
		expect(model.meta.baseScore).toBe(
			parseBaseScore(modelDoc.learner.learner_model_param.base_score)
		);
	});
});

// -------------------------------------------------------------------------------------------
// Guard rails: the walker REFUSES a model it cannot score, rather than scoring it wrongly
// -------------------------------------------------------------------------------------------

describe('the walker refuses a malformed model', () => {
	/**
	 * Clone only along `path`, so a 500-tree / 9,546-node document is not deep-copied once per
	 * mutant. Everything off the path stays shared by reference, which is also what lets the
	 * "structurally intact" assertions below be a cheap identity check.
	 */
	function patch(root, path, value) {
		const out = Array.isArray(root) ? root.slice() : { ...root };
		let node = out;
		for (let i = 0; i < path.length - 1; i++) {
			const k = path[i];
			node[k] = Array.isArray(node[k]) ? node[k].slice() : { ...node[k] };
			node = node[k];
		}
		node[path[path.length - 1]] = value;
		return out;
	}

	const LEARNER = ['learner'];
	const LMP = [...LEARNER, 'learner_model_param'];
	const GBM = [...LEARNER, 'gradient_booster', 'model'];
	const TREE0 = [...GBM, 'trees', 0];

	it('accepts the pristine model — the control for everything below', () => {
		expect(() => prepareXgbModel(modelDoc)).not.toThrow();
	});

	/**
	 * Each case is a construct the walker would otherwise score WITHOUT ERROR and WRONGLY. The
	 * message pattern is asserted, not just the throw: a refusal for the wrong reason is not a
	 * passing test, and it is the difference between a guard and a coincidence.
	 */
	const REFUSALS = [
		// --- multi-class: the walker sums ONE tree group; K groups produce a plausible number with
		// --- no meaning at all.
		[
			'multi-class (declared)',
			patch(modelDoc, [...LMP, 'num_class'], '3'),
			/num_class=3|multi-class/i
		],
		[
			'multi-class (structural, via tree_info)',
			patch(
				modelDoc,
				[...GBM, 'tree_info'],
				modelDoc.learner.gradient_booster.model.tree_info.map((g, i) => (i % 2 ? 1 : g))
			),
			/output group|multi-class/i
		],
		['multi-output', patch(modelDoc, [...LMP, 'num_target'], '2'), /multi-output/i],

		// --- categorical splits: split_conditions stops being a threshold and becomes an index into
		// --- a bitset. Comparing a feature against that index is nonsense that still routes.
		[
			'categorical split (split_type)',
			patch(
				modelDoc,
				[...TREE0, 'split_type'],
				modelDoc.learner.gradient_booster.model.trees[0].split_type.map((s, i) => (i === 0 ? 1 : s))
			),
			/categorical/i
		],
		[
			'categorical split (categories_nodes)',
			patch(modelDoc, [...TREE0, 'categories_nodes'], [0]),
			/categorical/i
		],
		[
			'categorical encoding table (cats.enc)',
			patch(modelDoc, [...GBM, 'cats'], {
				enc: [{ values: [1, 2, 3] }],
				feature_segments: [],
				sorted_idx: []
			}),
			/categorical/i
		],

		// --- arity: silent in BOTH directions, so it has to be declared and checked.
		['a four-feature retrain', patch(modelDoc, [...LMP, 'num_feature'], '4'), /4 features/i],
		[
			'reordered feature_names',
			patch(modelDoc, [...LEARNER, 'feature_names'], ['num_sites', 'num_seqs', 'median_pos_dist']),
			/feature ORDER is frozen/i
		],

		// --- dropout: xgboost 3.4 still labels these gbtree. The only trace is weight_drop, applied
		// --- at predict time; summing leaves without it is wrong by ~0.2 in probability.
		[
			'DART / rate_drop weights',
			patch(
				modelDoc,
				[...GBM, 'weight_drop'],
				Array.from({ length: 500 }, (_, i) => (i % 3 ? 1 : 0.4))
			),
			/dropout|weight_drop|DART/i
		],

		// --- objective and booster: the output transform is objective-specific, and a wrong one
		// --- still returns a number in [0, 1] that looks exactly like a probability.
		[
			'a regression objective',
			patch(modelDoc, [...LEARNER, 'objective'], { name: 'reg:squarederror' }),
			/objective/i
		],
		[
			'binary:logitraw (sigmoid already applied by the caller)',
			patch(modelDoc, [...LEARNER, 'objective'], { name: 'binary:logitraw' }),
			/objective/i
		],
		[
			'a linear booster',
			patch(modelDoc, [...LEARNER, 'gradient_booster'], { name: 'gblinear', model: {} }),
			/booster/i
		],

		// --- forest / vector-leaf modes change what a leaf MEANS.
		[
			'random-forest mode (trees averaged, not summed)',
			patch(modelDoc, [...GBM, 'gbtree_model_param', 'num_parallel_tree'], '4'),
			/num_parallel_tree|forest/i
		],
		[
			'vector leaves',
			patch(modelDoc, [...TREE0, 'tree_param', 'size_leaf_vector'], '2'),
			/size_leaf_vector|vector leaves/i
		],

		// --- topology: a child index past the end reads `undefined` and compares false forever; a
		// --- child index of 0 is a cycle back to the root, which would hang the browser.
		[
			'a child index past the end of the tree',
			patch(
				modelDoc,
				[...TREE0, 'right_children'],
				modelDoc.learner.gradient_booster.model.trees[0].right_children.map((r, i) =>
					i === 0 ? 999999 : r
				)
			),
			/out of range/i
		],
		[
			'a child index that cycles back to the root',
			patch(
				modelDoc,
				[...TREE0, 'left_children'],
				modelDoc.learner.gradient_booster.model.trees[0].left_children.map((l, i) =>
					i === 0 ? 0 : l
				)
			),
			/out of range/i
		],
		[
			'a half-leaf (one child -1, one not)',
			patch(
				modelDoc,
				[...TREE0, 'right_children'],
				modelDoc.learner.gradient_booster.model.trees[0].right_children.map((r, i) =>
					i === 0 ? -1 : r
				)
			),
			/one child set to -1/i
		],

		// --- provenance / version.
		// Both ends of the supported range, because they fail for different reasons and only one of
		// them is about a layout nobody has seen yet.
		['a future format major', patch(modelDoc, ['version'], [4, 0, 0]), /major version/i],
		[
			// The dangerous end. Before XGBoost 2, base_score is serialised in MARGIN space, so the
			// walker's logit() would be applied to an already-logitted number and every score in the
			// model shifts. parseBaseScore's (0, 1) guard catches only the half of that range outside
			// (0, 1); the half INSIDE it — like this 0.3 — is accepted and scores confidently wrong.
			// Measured with the version guard widened to admit 1.x: this document scores
			// [50, 200, 0.02] at 0.6135 ('uncertain') against the shipped model's 0.9551 ('likely').
			'a version-1 export, where base_score is a margin rather than a probability',
			patch(patch(modelDoc, ['version'], [1, 7, 6]), [...LMP, 'base_score'], '0.3'),
			/written by XGBoost 1\.7\.6/
		],
		['no version array at all', patch(modelDoc, ['version'], undefined), /version/i],
		[
			'a base_score the walker will not guess at',
			patch(modelDoc, [...LMP, 'base_score'], '[0.3,0.3,0.4]'),
			/components/i
		]
	];

	for (const [name, doc, pattern] of REFUSALS) {
		it(`refuses ${name}`, () => {
			expect(() => prepareXgbModel(doc)).toThrow(pattern);
		});
	}

	it('refuses models that are otherwise perfectly walkable', () => {
		// The point of the guards. For the metadata-only mutants the TREE ARRAYS ARE UNTOUCHED — the
		// same objects by reference — so nothing about the file stops a walker from producing a
		// confident number from them. It is the check that stops it, not a structural break.
		const trees = modelDoc.learner.gradient_booster.model.trees;
		for (const [name, doc] of REFUSALS.filter(([n]) =>
			/declared|multi-output|four-feature|DART|regression objective|logitraw|forest/.test(n)
		)) {
			expect(doc.learner.gradient_booster.model?.trees, name).toBe(trees);
		}
	});

	it('refuses a row of the wrong width rather than scoring it', () => {
		// Silent in both directions on a bare walk: a 4-wide row never touches the extra slot, and a
		// 2-wide row routes every split on the missing feature by `undefined < threshold` (false),
		// i.e. consistently right. Neither errors, and neither is detectable from the output.
		expect(() => evalXgbModel(fromDisk, [50, 200, 0.02, 1.0])).toThrow(/3 features/);
		expect(() => evalXgbModel(fromDisk, [50, 200])).toThrow(/3 features/);
		expect(() => evalXgbModel(fromDisk, [])).toThrow(/3 features/);
		expect(() => evalXgbModel(fromDisk, null)).toThrow(/3 features/);
	});

	it('refuses non-finite input instead of routing it as missing', () => {
		// The walker does not implement default_left. A NaN here means feature extraction is broken,
		// and the only correct response to that is an exception — the old evaluator ROUTED
		// (NaN, NaN, NaN) and returned 0.99997, i.e. a parse failure rendered as "99%, run MEME".
		for (const bad of [NaN, Infinity, -Infinity, null, undefined, '50']) {
			expect(() => evalXgbModel(fromDisk, [bad, 200, 0.02]), String(bad)).toThrow();
			expect(() => evalXgbModel(fromDisk, [50, 200, bad]), String(bad)).toThrow();
		}
	});

	it('names meme_gate.json in every refusal, so a failure is traceable to the artifact', () => {
		expect(() => prepareXgbModel({})).toThrow(/meme_gate\.json/);
		expect(() => prepareXgbModel(null)).toThrow(/meme_gate\.json/);
	});
});

// -------------------------------------------------------------------------------------------
// Bands and the input clip
// -------------------------------------------------------------------------------------------

describe('level boundaries', () => {
	it('likely >= 0.70, unlikely < 0.10, uncertain between', () => {
		expect(LIKELY_MIN).toBe(0.7);
		expect(UNLIKELY_MAX).toBe(0.1);
		expect(levelOf(1)).toBe('likely');
		expect(levelOf(0.7)).toBe('likely');
		expect(levelOf(0.6999999)).toBe('uncertain');
		expect(levelOf(0.1)).toBe('uncertain');
		expect(levelOf(0.0999999)).toBe('unlikely');
		expect(levelOf(0)).toBe('unlikely');
	});

	it('is the same cut the golden fixtures were labelled at', () => {
		expect(golden.likely_min).toBe(LIKELY_MIN);
		expect(golden.unlikely_max).toBe(UNLIKELY_MAX);
	});
});

describe('MODEL_INPUT_CLIP', () => {
	it('reproduces the training pipeline bounds and is idempotent', () => {
		expect(clipModelInput([50, 200, 0.0005])[2]).toBe(0.001);
		expect(clipModelInput([50, 200, 50])[2]).toBe(10.0);
		expect(clipModelInput([50, 200, 0.02])[2]).toBe(0.02);
		const once = clipModelInput([50, 200, 0.0005]);
		expect(clipModelInput(once)).toEqual(once);
		// It clips the median only — the other two features pass through untouched.
		expect(clipModelInput([50, 200, 0.02]).slice(0, 2)).toEqual([50, 200]);
	});

	it('leaves non-finite values for the domain guard rather than clamping them to a plausible number', () => {
		expect(clipModelInput([50, 200, NaN])[2]).toBeNaN();
	});

	it('is currently inert, which is a fact about THIS model and is re-derived here', () => {
		// hitLikelihoodModel.js claims the clip cannot change a route because the floor sits below
		// the model's lowest median_pos_dist split and the cap above its highest. The margin at the
		// floor is 0.001 vs 0.00102927 — one retrain from being load-bearing — so the claim is
		// measured from the model rather than repeated.
		const f = FEATURE_NAMES.indexOf('median_pos_dist');
		let lo = Infinity;
		let hi = -Infinity;
		for (const t of modelDoc.learner.gradient_booster.model.trees) {
			for (let i = 0; i < t.left_children.length; i++) {
				if (t.left_children[i] !== -1 && t.split_indices[i] === f) {
					lo = Math.min(lo, t.split_conditions[i]);
					hi = Math.max(hi, t.split_conditions[i]);
				}
			}
		}
		const { floor, cap } = MODEL_INPUT_CLIP.median_pos_dist;
		expect(floor, `lowest median_pos_dist split is ${lo}`).toBeLessThan(lo);
		expect(cap, `highest median_pos_dist split is ${hi}`).toBeGreaterThan(hi);
	});
});

// -------------------------------------------------------------------------------------------
// Domain guard
// -------------------------------------------------------------------------------------------

describe('out-of-distribution guard', () => {
	const feat = (seqs, sites, dist) => [seqs, sites, dist];

	it('accepts a vector inside the fitted range', () => {
		expect(checkFeatureDomain(feat(50, 200, 0.02)).ok).toBe(true);
	});

	it('rejects a tree whose branch lengths are not substitutions/site', () => {
		// A time-calibrated tree, in millions of years. Past the training pipeline's cap, so the
		// model has never been shown anything like it and the units are almost certainly wrong.
		const d = checkFeatureDomain(feat(20, 300, 12.5));
		expect(d.ok).toBe(false);
		expect(d.reasons[0]).toMatchObject({ feature: 'median_pos_dist', code: 'above-max' });
		expect(d.summary).toContain('not measured in substitutions per site');
	});

	it('rejects the median = 0 sentinel rather than scoring it', () => {
		const d = checkFeatureDomain(feat(50, 200, 0));
		expect(d.ok).toBe(false);
		expect(d.reasons[0].code).toBe('missing');
	});

	it('rejects non-finite features', () => {
		const d = checkFeatureDomain(feat(NaN, 200, 0.02));
		expect(d.ok).toBe(false);
		expect(d.reasons[0].code).toBe('non-finite');
	});

	it('rejects vectors below the input-validity floor', () => {
		expect(checkFeatureDomain(feat(2, 200, 0.02)).reasons[0].code).toBe('below-min');
		expect(checkFeatureDomain(feat(50, 0, 0.02)).reasons[0].code).toBe('below-min');
	});

	it('saturates rather than refusing above the split support', () => {
		// v2's guard is input-validity only: the model is monotone BY CONSTRUCTION, so past its
		// topmost splits it pins at a ceiling instead of returning an arbitrary memorised leaf.
		// Fencing the support instead would refuse a quarter of real submissions, in the population
		// where the model is most nearly right.
		expect(checkFeatureDomain(feat(5000, 20000, 0.02)).ok).toBe(true);
		expect(FEATURE_DOMAIN.num_seqs.max).toBeNull();
		expect(FEATURE_DOMAIN.num_sites.max).toBeNull();
		const ceiling = model.score([298, 3687, 0.4023226]);
		expect(model.score([2980, 36870, 0.4023226])).toBe(ceiling);
	});

	it('never scores an out-of-domain vector', async () => {
		const res = await runHitLikelihood(
			'>a\n' + 'ATG'.repeat(300) + '\n>b\n' + 'ATG'.repeat(300) + '\n',
			'(a:12.0,b:14.0);',
			model
		);
		expect(res.status).toBe(STATUS.CANNOT_ASSESS);
		expect(res.hit_probability).toBeNull();
		expect(res.level).toBeNull();
	});

	it('documents a cap no wider than the training pipeline it cites', () => {
		expect(FEATURE_DOMAIN.median_pos_dist.max).toBeLessThanOrEqual(sidecar.bl_cap);
	});
});

// -------------------------------------------------------------------------------------------
// The estimate as a whole
// -------------------------------------------------------------------------------------------

describe('estimateHitLikelihood statuses', () => {
	// A comfortably in-domain submission: 20 taxa, 100 codons, medium branch lengths.
	const seqs = Array.from({ length: 20 }, (_, i) => `>t${i}\n${'ATGACTGGTCCC'.repeat(25)}`);
	const bigAln = seqs.join('\n') + '\n';
	const bigTree = '(' + Array.from({ length: 20 }, (_, i) => `t${i}:0.08`).join(',') + ');';

	it('never returns null, and says which case it is', async () => {
		for (const args of [
			{ method: 'fel', alignment: bigAln, tree: bigTree },
			{ method: 'meme', alignment: '', tree: bigTree },
			{ method: 'meme', alignment: bigAln, tree: '((a,b),c);' },
			{ method: 'meme', alignment: bigAln, tree: bigTree }
		]) {
			const res = await estimateHitLikelihood({ ...args, model });
			expect(res).not.toBeNull();
			expect(Object.values(STATUS)).toContain(res.status);
			expect(res.caveat).toBe(HIT_LIKELIHOOD_CAVEAT);
			expect(res.basis).toBe(MODEL_BASIS);
		}
	});

	it('is not-applicable for a non-MEME method', async () => {
		const res = await estimateHitLikelihood({
			method: 'fel',
			alignment: bigAln,
			tree: bigTree,
			model
		});
		expect(res.status).toBe(STATUS.NOT_APPLICABLE);
		expect(res.reason).toBe('method-not-supported');
	});

	it('is not-applicable with no alignment', async () => {
		const res = await estimateHitLikelihood({
			method: 'meme',
			alignment: '',
			tree: bigTree,
			model
		});
		expect(res.status).toBe(STATUS.NOT_APPLICABLE);
		expect(res.reason).toBe('no-alignment');
	});

	it('cannot-assess (with a reason) on a topology-only tree', async () => {
		const res = await estimateHitLikelihood({
			method: 'meme',
			alignment: bigAln,
			tree: '((a,b),c);',
			model
		});
		expect(res.status).toBe(STATUS.CANNOT_ASSESS);
		expect(res.reason).toBe('no-branch-lengths');
		expect(res.detail).toBeTruthy();
		expect(res.hit_probability).toBeNull();
	});

	it('returns a populated ok result for a real MEME submission', async () => {
		const res = await estimateHitLikelihood({
			method: 'meme',
			alignment: bigAln,
			tree: bigTree,
			treeSource: 'user',
			model
		});
		expect(res.status).toBe(STATUS.OK);
		expect(['likely', 'uncertain', 'unlikely']).toContain(res.level);
		expect(res.hit_probability).toBeGreaterThanOrEqual(0);
		expect(res.hit_probability).toBeLessThanOrEqual(1);
		expect(res.level).toBe(levelOf(res.hit_probability));
		expect(res.num_seqs).toBe(20);
		expect(res.num_sites).toBe(100);
		expect(res.recommend_run).toBe(res.level !== 'unlikely');
		// The routing is surfaced, not computed and dropped on the floor.
		expect(res.recommendation).not.toBeNull();
		expect(res.recommendation.message).toBeTruthy();
		expect(res.budget.branches).toBe(37);
		expect(res.tree_source).toBe('user');
		expect(res.tree_source_caveat).toBeNull();
	});

	it('discloses that an inferred NJ tree makes the estimate optimistic', async () => {
		const res = await estimateHitLikelihood({
			method: 'meme',
			alignment: bigAln,
			tree: bigTree,
			treeSource: 'nj',
			model
		});
		expect(res.tree_source).toBe('inferred-nj');
		expect(res.tree_source_caveat).toContain('neighbour-joining');
	});

	it('reports an error status instead of a blank when the scorer throws', async () => {
		const broken = {
			backend: 'js',
			score: () => {
				throw new Error('boom');
			}
		};
		const res = await estimateHitLikelihood({
			method: 'meme',
			alignment: bigAln,
			tree: bigTree,
			model: broken
		});
		expect(res.status).toBe(STATUS.ERROR);
		expect(res.detail).toBeTruthy();
		// Still reports what it managed to read, so the failure is inspectable.
		expect(res.num_seqs).toBe(20);
	});

	it('exposes an error result for a scorer that never loaded', () => {
		const res = hitLikelihoodError('nope');
		expect(res.status).toBe(STATUS.ERROR);
		expect(res.detail).toBe('nope');
		expect(res.level).toBeNull();
	});

	it('refuses to score without a scorer rather than inventing one', async () => {
		await expect(scoreHitLikelihood([50, 200, 0.02], null)).rejects.toThrow(/scorer/i);
	});

	it('is monotone in all three features, which is what the disclosure promises', () => {
		// "Adding sequences, adding codons, or deeper branches can raise it and never lower it" is a
		// user-facing sentence, and the panel now says it holds at EVERY input the model can score.
		//
		// The constraint that makes it true (monotone_constraints=(1,1,1)) is NOT in the artifact:
		// Booster.save_model() does not persist it, so it cannot be asserted from the file and the
		// sidecar's copy of it is free text nothing reads. The property therefore has to be measured.
		//
		// A tree ensemble can only change its answer at a split threshold, so the axis under test
		// walks every DISTINCT threshold of that feature — read out of the model, not hard-coded —
		// plus one float32 step either side of each, crossed with a spread of holdouts on the other
		// two. That is every routing-distinct value on each axis: a break anywhere in the reachable
		// input space has to appear between two adjacent points of this sweep. The 18-evaluation
		// version of this test that walked one ray from [10, 100, 0.01] could not have seen one.
		//
		// verify_parity.py's SHAPE section runs the same sweep against xgboost itself, so the model
		// and the walker are each checked by the implementation that is not being tested.
		const thresholds = FEATURE_NAMES.map(() => new Set());
		for (const t of modelDoc.learner.gradient_booster.model.trees) {
			for (let i = 0; i < t.left_children.length; i++) {
				if (t.left_children[i] !== -1) {
					thresholds[t.split_indices[i]].add(Math.fround(t.split_conditions[i]));
				}
			}
		}
		const HOLDOUTS = [
			[4, 10, 50, 300],
			[20, 200, 1000, 3000],
			[0.001, 0.01, 0.1, 1.0]
		];
		const step = (v, dir) => {
			// One float32 ULP either side, so the pair straddles the threshold exactly the way the
			// walker's `<` sees it.
			const buf = new Float32Array([v]);
			const bits = new Int32Array(buf.buffer);
			bits[0] += v >= 0 ? dir : -dir;
			return buf[0];
		};
		let pairs = 0;
		for (let f = 0; f < FEATURE_NAMES.length; f++) {
			const axis = [...thresholds[f]]
				.flatMap((v) => [step(v, -1), v, step(v, 1)])
				.filter((v, i, a) => a.indexOf(v) === i)
				.sort((a, b) => a - b);
			const [o1, o2] = [0, 1, 2].filter((i) => i !== f);
			for (const a of HOLDOUTS[o1]) {
				for (const b of HOLDOUTS[o2]) {
					let previous = -Infinity;
					for (const x of axis) {
						const row = [];
						row[f] = x;
						row[o1] = a;
						row[o2] = b;
						const score = model.score(row);
						expect(
							score,
							`${FEATURE_NAMES[f]}=${x} (others ${a}, ${b}) scored below ${FEATURE_NAMES[f]} one step lower`
						).toBeGreaterThanOrEqual(previous);
						previous = score;
						pairs++;
					}
				}
			}
		}
		// The sweep has to be big enough to mean something — a threshold set that came back empty
		// would make every assertion above vacuous.
		expect(pairs).toBeGreaterThan(5000);
	});
});

describe('substitutionBudget', () => {
	it('counts unrooted binary branches and multiplies through', () => {
		const b = substitutionBudget({ num_seqs: 10, num_sites: 100, median_pos_dist: 0.05 });
		expect(b.branches).toBe(17);
		expect(b.per_site).toBeCloseTo(0.85, 10);
		expect(b.total).toBeCloseTo(85, 10);
	});
});

describe('recommendation routing', () => {
	const res = (level, num_seqs, num_sites, median_pos_dist) => ({
		level,
		num_seqs,
		num_sites,
		median_pos_dist
	});

	it('says nothing to change when MEME is the right tool', () => {
		const r = recommendFor(res('likely', 100, 300, 0.05));
		expect(r.action).toBeNull();
		expect(r.caveat).toBe(HIT_LIKELIHOOD_CAVEAT);
	});

	it('has no action to offer on a borderline alignment', () => {
		// Scope discipline: this model was trained on one label — did MEME report a site. It has no
		// evidence about any other method, so it must not claim what they would find.
		const r = recommendFor(res('uncertain', 50, 200, 0.02));
		expect(r.action).toBeNull();
		expect(r.message).toMatch(/MEME/);
	});

	it('says what about the DATA would change the answer when the alignment is too thin', () => {
		// The demo-fixture shape: 10 taxa, 17 codons.
		const r = recommendFor(res('unlikely', 10, 17, 0.03));
		expect(r.action).toBeNull();
		expect(r.message).toMatch(/more divergent/i);
		expect(r.budget.total).toBeLessThan(ROUTING.totalSubsFloor);
	});

	it('distinguishes a thin total from thin-per-site', () => {
		const thinTotal = recommendFor(res('unlikely', 10, 17, 0.03));
		const thinPerSite = recommendFor(res('unlikely', 40, 500, 0.05));
		expect(thinTotal.message).not.toBe(thinPerSite.message);
		expect(thinPerSite.budget.total).toBeGreaterThanOrEqual(ROUTING.totalSubsFloor);
	});

	it('only names the Resample control when the caller says it is on screen', () => {
		const args = res('unlikely', 40, 500, 0.05);
		expect(recommendFor(args).secondary.some((s) => s.action.kind === 'set-option')).toBe(false);
		expect(
			recommendFor(args, { resampleAvailable: true }).secondary.some(
				(s) => s.action.kind === 'set-option'
			)
		).toBe(true);
	});

	it('never names another analysis method, at any level', () => {
		// The regression guard for this whole scope decision. If someone reintroduces routing, this
		// fails before it reaches a researcher.
		const others = /\b(BUSTED|aBSREL|FUBAR|FEL|SLAC|PRIME|RELAX|GARD|BGM|FADE)\b/i;
		const all = [
			recommendFor(res('likely', 100, 300, 0.05)),
			recommendFor(res('uncertain', 50, 200, 0.02)),
			recommendFor(res('unlikely', 10, 17, 0.03)),
			recommendFor(res('unlikely', 8, 400, 0.3)),
			recommendFor(res('unlikely', 40, 500, 0.05), { resampleAvailable: true })
		];
		for (const r of all) {
			const text = [r.message, r.caveat, ...r.secondary.map((s) => s.message)].join(' ');
			expect(text).not.toMatch(others);
			expect([r.action, ...r.secondary.map((s) => s.action)].filter(Boolean)).not.toContainEqual(
				expect.objectContaining({ kind: 'switch-method' })
			);
		}
	});
});

const PANEL_SRC = readFileSync(join(REPO, 'src', 'lib', 'MemeHitLikelihood.svelte'), 'utf8');

describe('copy', () => {
	it('states what the estimate is not', () => {
		expect(HIT_LIKELIHOOD_CAVEAT).toContain('not whether this gene is under selection');
	});

	it('never turns "rarely" into "never" or into a reason to skip the run', () => {
		// 1 in 20 is small, not zero, and these are cheap runs. The band that fires on the thinnest
		// alignments is the one a user might act on, so the vocabulary is constrained: it may state
		// a historical frequency, and it may say what about the data would change it.
		//
		// The pattern is deliberately NARROW. A looser one — a bare /skip/, or /no sites/ — fires on
		// the panel's own "It is a caution, not a reason to skip the run", i.e. it would fail the
		// copy for saying precisely the right thing. Forbid assertions, not words a negation can
		// flip.
		//
		// Checked on the RENDERED copy — the low band's `lead` and `rarity` literals out of the
		// component, plus the guidance the service supplies. It used to be checked on
		// hitLikelihood.js's noteForLevel(), which said the same things in different words and which
		// nothing ever rendered; that function is gone for exactly that reason.
		const low = [
			bandCopy('unlikely').lead,
			bandCopy('unlikely').rarity,
			recommendFor({ level: 'unlikely', num_seqs: 40, num_sites: 500, median_pos_dist: 0.05 })
				.message
		].join(' ');
		expect(low).not.toMatch(/will (not|never) find|not worth running|do not bother|is futile/i);
		expect(low).toMatch(/rarely|1 in 20/i);
		// It has to say what WOULD change the answer, or "rarely" is just a shrug.
		expect(low).toMatch(/more sequences|more divergent/i);
	});

	it("keeps the row's CSS out of the route's eager stylesheet list", () => {
		// NOT a style-guide rule — a byte-accounting one, and it is invisible in dev.
		//
		// This component is dynamically imported so a non-MEME method downloads none of it. That
		// works for JS. It does NOT work for a component <style> block: SvelteKit collects the CSS of
		// dynamically-imported modules into the ROUTE NODE's stylesheet array (so a lazily-mounted
		// component cannot flash unstyled), and every entry there becomes an unconditional
		// `<link rel="stylesheet">` in the served HTML. Measured before the fix: 1,233 B raw /
		// 363 B brotli fetched on every page load, for every one of the ~15 methods, in the
		// production build only — Vite injects component styles via JS in dev, so no e2e run against
		// `npm run dev` can see it.
		//
		// So the row's CSS is imported as a string and injected at mount. If a <style> block comes
		// back, "a non-MEME method downloads ZERO estimator bytes" quietly stops being true again,
		// and this is the only check anywhere that runs without a production build.
		expect(
			PANEL_SRC,
			'MemeHitLikelihood.svelte has a <style> block again — SvelteKit will emit it as an eager ' +
				'<link> on the analyze route for every method. See MemeHitLikelihood.css.'
		).not.toMatch(/^<style/m);
		expect(PANEL_SRC).toMatch(/import styleText from '\.\/MemeHitLikelihood\.css\?inline'/);
	});
});

// -------------------------------------------------------------------------------------------
// CALIBRATION — the copy has to be true at the rate the outcomes actually show
// -------------------------------------------------------------------------------------------

/**
 * Pull one band's copy literals straight out of the component.
 *
 * The band sentences live in a `const LEVEL = {...}` object inside MemeHitLikelihood.svelte and are
 * the only version of them that exists — there is no service-layer duplicate any more. Reading them
 * from the source is therefore reading the thing a user sees, not a copy of it.
 */
function bandCopy(level) {
	// Bounded to this band's own object literal, `\t\tlevel: {` up to its closing `\n\t\t}`. An
	// unbounded slice would let `likely` — which has no rarity line — pick up `unlikely`'s, and the
	// test asserting that only the low band carries one would pass while being false.
	const start = PANEL_SRC.indexOf(`\n\t\t${level}: {`);
	if (start < 0) throw new Error(`MemeHitLikelihood.svelte has no LEVEL entry for '${level}'`);
	const rest = PANEL_SRC.slice(start + 1);
	const end = rest.indexOf('\n\t\t}');
	const block = end < 0 ? rest : rest.slice(0, end);
	const field = (name) => {
		const m = block.match(new RegExp(`\\n\\s*${name}:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
		return m ? m[1].replace(/\\'/g, "'") : null;
	};
	return { lead: field('lead'), bandRate: field('bandRate'), rarity: field('rarity') };
}

/**
 * WHAT EACH BAND CLAIMS, WHERE THE CLAIM COMES FROM, AND WHAT THIS REPO CAN CHECK.
 *
 * This table used to be one number per band with one tolerance, and the tolerance for 'uncertain'
 * was 0.2 — a +/- 20-POINT window around a claim of 52%, i.e. anything from 30% to 70% passed. That
 * is not a calibration check, it is a formality, and it existed to absorb a real disagreement that
 * was never written down: the panel's rates are measured on 5,982 HELD-OUT runs, while the only
 * corpus that can be checked from here is the 3,000 TRAINING rows, and on the middle band those two
 * populations differ by 11 points (52% vs 41%).
 *
 * So the two claims are separated and each is checked against something that can actually falsify
 * it:
 *
 *   `outOfSample`  what the panel says, and the counts it says it from. Verified by ARITHMETIC
 *                  against the copy's own "X of the Y runs — Z%" sentence, plus the requirement
 *                  that the three band populations add up to the 5,982 the panel names. This runs
 *                  everywhere, including CI, and it is what stops the prose drifting away from the
 *                  counts underneath it.
 *   `inSample`     what the 3,000-row corpus measures when scored through the SHIPPED walker and
 *                  banded through the SHIPPED cuts. Pinned to +/- 0.02 — tight enough that a model
 *                  swap, a feature change, a clip change or a threshold change all fail here.
 *
 * What no test in this repository can do is re-derive the held-out 5,982 themselves; that data is
 * not here. The gap between the two columns is therefore stated as a number, per band, so it is a
 * documented disagreement rather than a wide tolerance nobody has to explain.
 */
const BAND_CLAIMS = {
	unlikely: { phrase: /about 1 in 20/i, outOfSample: 0.05, inSample: 0.0462 },
	uncertain: { phrase: /split about evenly/i, outOfSample: 0.52, inSample: 0.4118 },
	likely: { phrase: /About 93% of alignments/i, outOfSample: 0.93, inSample: 0.9403 }
};
const IN_SAMPLE_TOLERANCE = 0.02;

/** The out-of-sample population the panel names, and its three band sizes. */
const HELD_OUT_N = 5982;

/** Claims made in the panel itself, which is where every reader meets them. */
const PANEL_CLAIMS = [
	{ phrase: /About 93% of alignments scoring this high/, what: 'likely band rate', value: 0.93 },
	{ phrase: /52% had MEME report at least one site/, what: 'uncertain band rate', value: 0.52 },
	{ phrase: /About 1 in 20 alignments scoring this low/, what: 'unlikely band rate', value: 0.05 }
	// The overall base rate used to be stated in every band's lead. It was removed as noise: it is
	// the same sentence three times, and each band already states its OWN rate, which is the number
	// that band is about. The lift check below still holds the top band to beating it.
];

describe('the copy states a rate, and states the same rate everywhere', () => {
	// Runs with or without the corpus: pure string and arithmetic checks, so CI still catches copy
	// that drifts away from the numbers even on a machine where the outcome data is not available.
	it('keeps the per-band phrases the calibration block checks against', () => {
		for (const [level, { phrase }] of Object.entries(BAND_CLAIMS)) {
			expect(bandCopy(level).lead, `${level} band lead`).toMatch(phrase);
		}
	});

	it('keeps the panel phrases the calibration block checks against', () => {
		for (const { phrase, what } of PANEL_CLAIMS) {
			expect(
				PANEL_SRC,
				`MemeHitLikelihood.svelte no longer states the ${what} in the form this suite verifies ` +
					`(${phrase}). If the copy was re-worded, re-derive the rate against ` +
					`meme_validation.tsv and update PANEL_CLAIMS — do not just delete the anchor.`
			).toMatch(phrase);
		}
	});

	/**
	 * THE ONE CHECK THAT BINDS THE PANEL'S OUT-OF-SAMPLE NUMBERS TO ANYTHING.
	 *
	 * Each band's disclosure says "N of the M runs that landed in this band — P% —". Those are the
	 * numbers the whole estimate is sold on, they come from a corpus that is not in this repo, and
	 * until now nothing checked them at all: a typo, a stale count left after a retrain, or a
	 * percentage rounded from a different denominator would all have shipped silently.
	 *
	 * They cannot be re-derived here, but they can be required to be SELF-CONSISTENT, which catches
	 * every one of those failures: the stated percentage must be the stated fraction, the three band
	 * populations must add up to the population the panel names, and the band rates weighted by
	 * their populations must reproduce the base rate the panel also states. A retrain that updates
	 * one sentence and not the others fails here.
	 */
	it('the panel’s band counts are consistent with its own percentages and with each other', () => {
		let population = 0;
		let hits = 0;
		for (const [level, claim] of Object.entries(BAND_CLAIMS)) {
			const sentence = bandCopy(level).bandRate;
			expect(sentence, `${level} band has no bandRate sentence`).toBeTruthy();
			const m = sentence.match(/([\d,]+) of the ([\d,]+) runs that landed in this band — (\d+)%/);
			expect(
				m,
				`${level} bandRate no longer states "N of the M runs that landed in this band — P%": ${sentence}`
			).not.toBeNull();
			const [hit, n, pct] = m.slice(1).map((x) => Number(x.replace(/,/g, '')));
			expect(hit, `${level}: ${hit} hits of ${n} runs`).toBeLessThanOrEqual(n);
			expect(
				Math.round(100 * (hit / n)),
				`${level}: ${hit}/${n} is ${(100 * (hit / n)).toFixed(2)}%, the copy says ${pct}%`
			).toBe(pct);
			// And the lead above it, which is the sentence a user reads without opening anything,
			// has to be making the same claim as the counts behind it.
			expect(
				Math.abs(hit / n - claim.outOfSample),
				`${level}: the lead claims ${claim.outOfSample}, the counts give ${(hit / n).toFixed(4)}`
			).toBeLessThan(0.01);
			population += n;
			hits += hit;
		}
		expect(
			population,
			`the three bands cover ${population} runs, but the panel says the calibration was measured on ${HELD_OUT_N}`
		).toBe(HELD_OUT_N);
		expect(PANEL_SRC).toContain(`${HELD_OUT_N.toLocaleString('en-US')} completed MEME runs`);
		// The panel says "around 85% of all MEME submissions report something" in three places. It
		// has to be what the band counts add up to, or one of the four numbers is from a different
		// corpus than the others.
		expect(
			hits / population,
			`the band counts give a base rate of ${(hits / population).toFixed(4)}, the panel says 0.85`
		).toBeCloseTo(0.85, 2);
	});

	it('the interval the uncertain band quotes is the interval its own counts imply', () => {
		// "The interval around that 52% is [49%, 55%]" is the most specific numeric claim in the
		// whole panel and the easiest one to leave stale. It is a 95% interval on 471/907, so it is
		// recomputable from the same sentence that states it.
		const sentence = bandCopy('uncertain').bandRate;
		const counts = sentence.match(/([\d,]+) of the ([\d,]+) runs/);
		const [hit, n] = counts.slice(1).map((x) => Number(x.replace(/,/g, '')));
		const stated = sentence.match(/interval around that \d+% is \[(\d+)%, (\d+)%\]/);
		expect(stated, `the uncertain band no longer quotes an interval: ${sentence}`).not.toBeNull();
		const p = hit / n;
		const half = 1.96 * Math.sqrt((p * (1 - p)) / n);
		for (const [i, want] of [
			Math.round(100 * (p - half)),
			Math.round(100 * (p + half))
		].entries()) {
			expect(
				Number(stated[i + 1]),
				`the copy quotes [${stated[1]}%, ${stated[2]}%]; ${hit}/${n} gives ` +
					`[${(100 * (p - half)).toFixed(1)}%, ${(100 * (p + half)).toFixed(1)}%]`
			).toBe(want);
		}
	});

	it('states the band edges as the two constants levelOf() actually uses', () => {
		// The panel renders these from UNLIKELY_MAX / LIKELY_MIN rather than hard-coding them, so a
		// threshold change cannot leave the disclosure describing a band that no longer exists.
		expect(PANEL_SRC).toMatch(/unlikelyPct = Math\.round\(UNLIKELY_MAX \* 100\)/);
		expect(PANEL_SRC).toMatch(/likelyPct = Math\.round\(LIKELY_MIN \* 100\)/);
	});
});

/**
 * Real completed MEME jobs: job id, sequences, codons, median branch length, and how many sites the
 * run actually reported at p <= 0.1 and p <= 0.05.
 *
 * It lives OUTSIDE the repo (it is production data), so this block skips rather than fails when it
 * is not on the machine — which is what happens in CI. Set MEME_VALIDATION_TSV to point elsewhere;
 * scripts/prescreen/verify_parity.py reads the same variable for the same file.
 *
 * NOTE ON WHICH POPULATION THIS IS. These are the 3,000 rows the model was fitted on, not the 5,982
 * held-out runs the panel quotes. The base rate here (85.2%) matches meme_gate.meta.json's
 * `base_rate`, which is how you can tell. So this block pins the IN-SAMPLE behaviour of the shipped
 * artifact — which is what catches a model swap, a feature change or a threshold change — and the
 * out-of-sample claims are checked for internal consistency above instead.
 */
const CORPUS_PATH =
	process.env.MEME_VALIDATION_TSV ||
	join(REPO, '..', 'datamonkey-test-corpus', 'meme_validation.tsv');

function readCorpus(path) {
	if (!existsSync(path)) return null;
	const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
	const head = lines[0].split('\t');
	const col = (name) => {
		const i = head.indexOf(name);
		if (i < 0) throw new Error(`${path}: no '${name}' column (has ${head.join(', ')})`);
		return i;
	};
	const [nseq, nsites, medBl, found, p05] = [
		col('nseq'),
		col('nsites'),
		col('med_bl'),
		col('sites_found'),
		col('sites_p05')
	];
	return lines.slice(1).map((line) => {
		const f = line.split('\t');
		return {
			features: [Number(f[nseq]), Number(f[nsites]), Number(f[medBl])],
			hit: Number(f[found]) > 0,
			hit05: Number(f[p05]) > 0
		};
	});
}

const corpus = readCorpus(CORPUS_PATH);
if (!corpus) {
	console.warn(
		`\n[meme-hit-likelihood] CALIBRATION REGRESSION SKIPPED — no outcome corpus at\n` +
			`  ${CORPUS_PATH}\n` +
			`This is expected in CI (the corpus is production data and lives outside the repo). It is\n` +
			`NOT expected on a machine where the band copy is being changed: that copy makes claims\n` +
			`about observed rates, and this is the only test that measures them. Set MEME_VALIDATION_TSV\n` +
			`to run it. (The copy's INTERNAL consistency is checked above and does run in CI.)\n`
	);
}

describe.skipIf(!corpus)('calibration regression (real MEME outcomes)', () => {
	/**
	 * Every job scored through the SHIPPED path — `model.score`, which applies MODEL_INPUT_CLIP —
	 * and banded through the SHIPPED `levelOf`. Not a re-implementation: if the walker, the clip or
	 * the cuts change, these rates move, which is the entire point.
	 */
	let stats;

	beforeAll(() => {
		const bands = {
			unlikely: { n: 0, hit: 0, hit05: 0 },
			uncertain: { n: 0, hit: 0, hit05: 0 },
			likely: { n: 0, hit: 0, hit05: 0 }
		};
		let hits = 0;
		const scored = corpus.map((row) => {
			const p = model.score(row.features);
			const level = levelOf(p);
			bands[level].n++;
			if (row.hit) {
				bands[level].hit++;
				hits++;
			}
			if (row.hit05) bands[level].hit05++;
			return p;
		});
		// Rank-based AUC (Mann-Whitney), ties averaged.
		const order = scored.map((p, i) => [p, corpus[i].hit]).sort((a, b) => a[0] - b[0]);
		let rank = 0;
		let sumPos = 0;
		while (rank < order.length) {
			let end = rank;
			while (end + 1 < order.length && order[end + 1][0] === order[rank][0]) end++;
			const avg = (rank + end) / 2 + 1;
			for (let i = rank; i <= end; i++) if (order[i][1]) sumPos += avg;
			rank = end + 1;
		}
		const nPos = hits;
		const nNeg = corpus.length - hits;
		stats = {
			n: corpus.length,
			baseRate: hits / corpus.length,
			auc: (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg),
			bands,
			rate: (b) => bands[b].hit / bands[b].n,
			rate05: (b) => bands[b].hit05 / bands[b].n,
			fires: (b) => bands[b].n / corpus.length
		};
		console.log(
			`[meme-hit-likelihood] calibration on ${stats.n} jobs (${CORPUS_PATH}): ` +
				`base ${(100 * stats.baseRate).toFixed(1)}%, AUC ${stats.auc.toFixed(3)} | ` +
				['unlikely', 'uncertain', 'likely']
					.map(
						(b) =>
							`${b} n=${bands[b].n} (${(100 * stats.fires(b)).toFixed(2)}% of subs) ` +
							`hit ${(100 * stats.rate(b)).toFixed(1)}% ` +
							`[panel says ${(100 * BAND_CLAIMS[b].outOfSample).toFixed(0)}% out of sample]`
					)
					.join(' | ')
		);
	});

	it('puts real jobs in all three bands', () => {
		// Guards against the block passing vacuously if the corpus, the clip or the cuts changed
		// such that a band never fires.
		for (const b of ['unlikely', 'uncertain', 'likely']) {
			expect(stats.bands[b].n, `${b} band never fired on ${stats.n} real jobs`).toBeGreaterThan(0);
		}
	});

	it('THE 72% GUARD: the band the copy calls "rarely" is rare in the outcomes', () => {
		// The single assertion this whole file exists for. The gate this replaced badged alignments
		// 'unlikely' that reported a site 72% of the time; the observed rate here is ~5% and the
		// honest 95% upper bound out of sample is 11.4%. A ceiling of 15% is loose enough to survive
		// a corpus refresh and 4.8x too tight to admit the failure it is named after.
		expect(
			stats.rate('unlikely'),
			`'unlikely' reported a site on ${stats.bands.unlikely.hit}/${stats.bands.unlikely.n} real ` +
				`jobs — the word is not defensible at that rate, and the copy must not ship`
		).toBeLessThan(0.15);
		// And at the stricter cutoff it is rarer still, which is what lets the panel say "only 1 of
		// the 111 did at p <= 0.05".
		expect(stats.rate05('unlikely')).toBeLessThan(0.1);
	});

	for (const [level, { inSample, outOfSample }] of Object.entries(BAND_CLAIMS)) {
		it(`'${level}' fires at its pinned in-sample rate (${inSample})`, () => {
			// TIGHT, and the same tolerance for all three bands. The old version of this test allowed
			// the middle band +/- 0.2 around the panel's out-of-sample 52% — a window from 30% to 70%,
			// which would not have noticed the copy drifting to "about two in three". The pin is what
			// this corpus can actually establish: the shipped walker's own behaviour on it. Anything
			// that moves the model, the features, the clip or the cuts moves these and fails here.
			const observed = stats.rate(level);
			expect(
				Math.abs(observed - inSample),
				`in-sample rate for '${level}' is ${observed.toFixed(4)} ` +
					`(${stats.bands[level].hit}/${stats.bands[level].n}), pinned ${inSample}. If this is an ` +
					`INTENDED retrain, re-derive the panel's out-of-sample copy too — do not just move the pin.`
			).toBeLessThanOrEqual(IN_SAMPLE_TOLERANCE);
			// The two populations disagree most on the middle band, and that disagreement is the
			// reason the old single tolerance was 0.2. It is recorded rather than absorbed: a gap
			// wider than 15 points would mean the panel is describing a different model.
			expect(
				Math.abs(outOfSample - inSample),
				`the panel's out-of-sample ${outOfSample} and the in-sample ${inSample} for '${level}' ` +
					`now differ by more than 15 points — one of them is stale`
			).toBeLessThan(0.15);
		});
	}

	it('the "fewer than 3 in 100 score this low" rarity line is true', () => {
		expect(PANEL_SRC).toMatch(/Fewer than 3 in 100 submissions score this low/);
		expect(
			stats.fires('unlikely'),
			`the low band fired on ${stats.bands.unlikely.n}/${stats.n} submissions`
		).toBeLessThan(0.03);
	});

	it('the high band covers most submissions, so it cannot read as a finding', () => {
		// The property still matters — a band that fires on five-sixths of all submissions must not be
		// sold as a green light — but it is now enforced by what the band does NOT say. The panel used
		// to add "the ordinary outcome, not a finding", which is a claim about how this rate compares
		// to MEME's overall hit rate: a statement about the corpus, not about the alignment in front of
		// the user. Each band now states its own rate and stops. The lift assertion below is what keeps
		// the top band honest.
		expect(stats.fires('likely')).toBeGreaterThan(0.75);
	});

	it('the bands are ordered and the top one actually carries lift', () => {
		expect(stats.rate('unlikely')).toBeLessThan(stats.rate('uncertain'));
		expect(stats.rate('uncertain')).toBeLessThan(stats.rate('likely'));
		// ~8 points over simply always saying yes. Less than that and the top band says nothing.
		expect(stats.rate('likely') - stats.baseRate).toBeGreaterThan(0.05);
	});

	it('the base rate the panel quotes is the base rate in the outcomes', () => {
		expect(Math.abs(stats.baseRate - 0.85)).toBeLessThan(0.03);
	});

	it('ranks at least as well as the disclosure says it does', () => {
		// The panel claims "Ranking accuracy (AUC) is 0.88", measured out of sample. This corpus is
		// the training population, so it reads higher (0.897), and the sidecar's own held-out
		// test_auc is 0.8929 — so the panel UNDER-claims, which is the safe direction. Both are
		// asserted: a floor, so a worse model fails, and the under-claim, so the copy cannot be
		// edited upward past what either measurement supports.
		expect(PANEL_SRC).toMatch(/Ranking accuracy \(AUC\) is 0\.88/);
		expect(stats.auc).toBeGreaterThan(0.85);
		expect(0.88, 'the panel now claims a better AUC than the sidecar records').toBeLessThanOrEqual(
			sidecar.test_auc
		);
		expect(0.88, 'the panel now claims a better AUC than this corpus measures').toBeLessThanOrEqual(
			stats.auc
		);
	});
});

// -------------------------------------------------------------------------------------------
// Scope, enforced by state enumeration
// -------------------------------------------------------------------------------------------

describe('scope: the estimate only ever talks about MEME', () => {
	// WHY THIS EXISTS. The model was trained on a single label — did a MEME run report at least one
	// selected site. It has never scored BUSTED, aBSREL, FUBAR or anything else, so any sentence
	// about another method is the author's judgement wearing the model's authority, and a reader
	// cannot tell the two apart. An earlier version shipped five such sentences ("BUSTED can detect
	// selection here", "FUBAR holds up better than MEME here"). A human caught them; nothing in the
	// suite did.
	//
	// So this walks every state the estimate can reach and asserts no other analysis method is named
	// in anything a user can read. It is deliberately state-enumeration rather than a grep of the
	// source: a new string in a new file is still covered, as long as some state renders it.
	const OTHER_METHODS =
		/\b(BUSTED|aBSREL|FUBAR|FEL|SLAC|PRIME|RELAX|BGM|GARD|FADE|Contrast-FEL|MULTI-HIT|NRM)\b/i;

	const seqs = Array.from({ length: 20 }, (_, i) => `>t${i}\n${'ATGACTGGTCCC'.repeat(25)}`);
	const bigAln = seqs.join('\n') + '\n';
	const bigTree = '(' + Array.from({ length: 20 }, (_, i) => `t${i}:0.08`).join(',') + ');';
	// 5 taxa x 100 codons, median branch length 0.02 -> 0.559 on the shipped model, i.e. the middle
	// band. Sized deliberately: bigAln (20 x 100 @ 0.08) scores 0.931 and tinyAln 0.0006, so without
	// this fixture the enumeration below skipped straight over 'uncertain'.
	const midAln =
		Array.from({ length: 5 }, (_, i) => `>m${i}\n${'ATGACTGGTCCC'.repeat(25)}`).join('\n') + '\n';
	const midTree = '(' + Array.from({ length: 5 }, (_, i) => `m${i}:0.02`).join(',') + ');';
	const tinyAln = '>a\nATGACTGGTCCC\n>b\nATGACAGGTCCC\n>c\nATGACTGATCCC\n';
	const tinyTree = '((a:0.004,b:0.003):0.002,c:0.005);';
	const timeTree = '(' + Array.from({ length: 20 }, (_, i) => `t${i}:12.5`).join(',') + ');';

	/** Every field of a result that can reach a screen. */
	function visibleText(res) {
		if (!res) return '';
		const parts = [res.detail, res.caveat, res.note, res.basis, res.tree_source_caveat];
		if (res.domain && res.domain.summary) parts.push(res.domain.summary);
		if (res.recommendation) {
			parts.push(res.recommendation.message, res.recommendation.caveat);
			for (const alt of res.recommendation.secondary || []) parts.push(alt.message);
			if (res.recommendation.action) parts.push(res.recommendation.action.label);
		}
		return parts.filter(Boolean).join(' — ');
	}

	it('names no other method in any reachable state, and reaches all three bands', async () => {
		const states = [
			['non-MEME method', { method: 'fel', alignment: bigAln, tree: bigTree }],
			['no alignment', { method: 'meme', alignment: '', tree: bigTree }],
			['topology-only tree', { method: 'meme', alignment: bigAln, tree: '((a,b),c);' }],
			['out of distribution', { method: 'meme', alignment: bigAln, tree: timeTree }],
			['scored, ample data', { method: 'meme', alignment: bigAln, tree: bigTree }],
			// 5 taxa x 100 codons at a median branch length of 0.02 scores 0.559 on the shipped model.
			// THE ENUMERATION HAD NO SUCH STATE, which made this test's own premise — "every state the
			// estimate can reach" — false for the band that fires on ~15% of real submissions. Proved
			// by injecting "consider BUSTED" into the uncertain copy: this test still passed. Only the
			// sibling test below, which iterates levels directly, caught it.
			['scored, borderline data', { method: 'meme', alignment: midAln, tree: midTree }],
			['scored, thin data', { method: 'meme', alignment: tinyAln, tree: tinyTree }],
			['user tree', { method: 'meme', alignment: bigAln, tree: bigTree, treeSource: 'user' }],
			['inferred tree', { method: 'meme', alignment: bigAln, tree: bigTree, treeSource: 'nj' }],
			['unknown tree', { method: 'meme', alignment: bigAln, tree: bigTree, treeSource: 'zzz' }]
		];
		const levelsSeen = new Set();
		for (const [name, args] of states) {
			const res = await estimateHitLikelihood({
				...args,
				model,
				opts: { resampleAvailable: true }
			});
			if (res.level) levelsSeen.add(res.level);
			const text = visibleText(res);
			expect(text, `state "${name}" named another method: ${text}`).not.toMatch(OTHER_METHODS);
		}
		// The coverage assertion that keeps the enumeration honest. Without it a band can quietly
		// stop being reachable — because the model moved, not because anyone edited this list — and
		// the states above go on passing while covering less.
		expect(
			[...levelsSeen].sort(),
			'the state enumeration no longer reaches all three bands, so it is not enumerating the ' +
				'states a user can reach. Re-derive the fixtures above against the shipped model.'
		).toEqual(['likely', 'uncertain', 'unlikely']);
		// The failure path is constructed, not reachable through estimateHitLikelihood.
		expect(visibleText(hitLikelihoodError())).not.toMatch(OTHER_METHODS);
	});

	it('names no other method in the per-level guidance or in the band copy', () => {
		// The band sentences are read out of the component, which is the only place they exist.
		for (const level of ['likely', 'uncertain', 'unlikely']) {
			const { lead, bandRate, rarity } = bandCopy(level);
			expect([lead, bandRate, rarity].filter(Boolean).join(' '), level).not.toMatch(OTHER_METHODS);
		}
		for (const f of [
			{ level: 'likely', num_seqs: 100, num_sites: 300, median_pos_dist: 0.05 },
			{ level: 'uncertain', num_seqs: 50, num_sites: 200, median_pos_dist: 0.02 },
			{ level: 'unlikely', num_seqs: 10, num_sites: 17, median_pos_dist: 0.03 },
			{ level: 'unlikely', num_seqs: 8, num_sites: 400, median_pos_dist: 0.3 },
			{ level: 'unlikely', num_seqs: 40, num_sites: 500, median_pos_dist: 0.05 }
		]) {
			const r = recommendFor(f, { resampleAvailable: true });
			const text = [r.message, r.caveat, ...r.secondary.map((s) => s.message)].join(' ');
			expect(text, `level ${f.level} named another method: ${text}`).not.toMatch(OTHER_METHODS);
		}
	});

	it('names no other method in the panel a user actually reads', () => {
		// The source-level half of the same guard. State enumeration cannot reach copy that only
		// exists in the component — the band leads, the rarity line and the disclosure are all
		// literals in MemeHitLikelihood.svelte — and that is exactly where the five offending
		// sentences lived last time.
		const prose = PANEL_SRC.replace(/<!--[\s\S]*?-->/g, '') // drop authoring comments
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '');
		expect(prose).not.toMatch(OTHER_METHODS);
	});

	it('the shared caveat still says what the number is NOT', () => {
		// The one sentence that has to survive any rewrite of the copy.
		expect(HIT_LIKELIHOOD_CAVEAT).toMatch(/not whether this gene is under selection/i);
		expect(MODEL_BASIS).toMatch(/MEME/);
	});

	it('reaches no ML runtime from anywhere in the gate', () => {
		// A tombstone, RESCOPED — read this before you touch it.
		//
		// This assertion was written as "DM3 ships no ML runtime, anywhere", and for as long as the
		// gate was the only model in the repository those two statements were the same statement.
		// They are not any more. AxoMEME 2.0 is a 3.78 MB transformer that genuinely needs
		// onnxruntime-web: its graph is a real neural network, not 500 trees of three features, and
		// no 40-line walker is going to execute it. So the repo-wide ban would now fail for a
		// legitimate reason, and the fix someone reaches for when a guard fails legitimately is
		// deleting the guard.
		//
		// What was actually being defended was never "no runtime exists". It was: THE GATE COSTS
		// ALMOST NOTHING AND IS REACHABLE FROM EVERY METHOD, SO IT MUST NOT DRAG A RUNTIME BEHIND
		// IT. The gate renders for one method out of fifteen; the first version of this feature
		// downloaded 13.5 MB of ONNX Runtime WASM for all fifteen and then rendered nothing for
		// fourteen of them. That failure mode gets MORE available once a runtime is a legitimate
		// dependency, not less, because now a stray import resolves instead of erroring.
		//
		// So the guard is now about REACHABILITY, which is the property that was always load-bearing:
		// walk the gate's own import closure and prove no ML runtime is in it. That is strictly
		// stronger than the per-file grep it replaces — the old version listed four files by hand and
		// would not have noticed a fifth.
		const RUNTIME = /^(onnxruntime|@tensorflow\/|@xenova\/|onnx|torch|tflite)/i;
		// THREE forms, because the first version of this test had only the first and therefore did
		// not fire when `import 'onnxruntime-web';` was injected into a reachable module to prove it
		// could. A side-effect import has no `from` clause, and it is the exact shape a runtime
		// arrives in — you import it for the WASM registration, not for a binding.
		const SPECIFIER_FORMS = [
			/\bfrom\s*['"]([^'"]+)['"]/g, // import … from 'x' / export … from 'x'
			/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('x')
			/^\s*import\s+['"]([^'"]+)['"]/gm // side-effect import 'x'
		];

		const seen = new Set();
		const offenders = [];
		const visit = (absPath) => {
			if (seen.has(absPath) || !existsSync(absPath)) return;
			seen.add(absPath);
			// Strip comments before matching. hitLikelihoodModel.js documents its own usage with a
			// literal `import … from './hitLikelihood.js'` inside a doc block, and a commented-out
			// runtime import must not be reported as a live edge in either direction.
			const src = readFileSync(absPath, 'utf8')
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/^\s*\/\/.*$/gm, '');
			for (const re of SPECIFIER_FORMS) {
				re.lastIndex = 0;
				let m;
				while ((m = re.exec(src)) !== null) {
					const spec = m[1];
					if (!spec) continue;
					if (RUNTIME.test(spec)) {
						offenders.push(`${absPath.replace(REPO, '')} imports ${spec}`);
						continue;
					}
					// Follow relative edges only. A bare specifier that is not a runtime is somebody
					// else's package and cannot pull one in without appearing in package.json, which
					// is checked separately below.
					if (spec.startsWith('.')) visit(join(dirname(absPath), spec));
				}
			}
		};
		// Every entry point a caller can reach the gate through.
		for (const f of ['scope.js', 'hitLikelihood.js', 'hitLikelihoodModel.js', 'xgbEnsemble.js']) {
			visit(join(PRESCREEN, f));
		}
		expect(offenders, 'an ML runtime is reachable from the gate').toEqual([]);
		// The walk has to have actually walked. Without this the test passes trivially if the entry
		// filenames are ever renamed out from under it.
		expect(seen.size).toBeGreaterThanOrEqual(4);

		// package.json is still checked, but as an ALLOWLIST rather than a ban. onnxruntime-web is
		// permitted because AxoMEME needs it; anything else in this family is not, and adding one is
		// now a deliberate edit to this line rather than something that slips in with a lockfile.
		const ALLOWED = new Set(['onnxruntime-web']);
		const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
		const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
		const unexpected = deps.filter((d) => RUNTIME.test(d) && !ALLOWED.has(d));
		expect(unexpected, 'unexpected ML runtime in package.json').toEqual([]);
	});
});

/**
 * OUT-OF-SAMPLE CALIBRATION — the block that binds the numbers a user actually reads.
 *
 * The block above scores meme_validation.tsv, which is the 3,000 rows the shipped model was FITTED
 * on (train_gate_xgb.py reads that exact file and refits on all of it). Those rates are optimistic
 * by construction: at the 0.10 cut the in-sample 'unlikely' rate is ~16% while the true rate on
 * unseen jobs is ~5%. That block is still worth having — it pins the artifact and catches a model or
 * threshold swap — but it cannot check the panel's claims, because the panel quotes the held-out
 * population and that population is not in it.
 *
 * This block scores the 5,982 jobs the model has never seen: the full 8,982-job MEME universe from
 * silverback, minus every job id present in the training file. Those are the rates the copy quotes,
 * so this is where a copy change that stops being true fails.
 */
const FULL_CORPUS_PATH =
	process.env.MEME_FULL_CORPUS ||
	join(REPO, '..', 'datamonkey-test-corpus', 'meme_full_corpus.tsv');

function readOutOfSample(fullPath, trainPath) {
	if (!existsSync(fullPath) || !existsSync(trainPath)) return null;
	const trainIds = new Set(
		readFileSync(trainPath, 'utf8')
			.trim()
			.split(/\r?\n/)
			.slice(1)
			.map((l) => l.split('\t')[0])
	);
	const lines = readFileSync(fullPath, 'utf8').trim().split(/\r?\n/);
	const head = lines[0].split('\t');
	const col = (n) => {
		const i = head.indexOf(n);
		if (i < 0) throw new Error(`${fullPath}: no '${n}' column (has ${head.join(', ')})`);
		return i;
	};
	const [job, nseq, nsites, bl, p10, p05] = [
		col('job'),
		col('nseq'),
		col('nsites'),
		col('med_pos_tre'),
		col('n_p10'),
		col('n_p05')
	];
	const out = [];
	for (const line of lines.slice(1)) {
		const f = line.split('\t');
		if (trainIds.has(f[job])) continue; // the model has seen this one
		out.push({
			features: [Number(f[nseq]), Number(f[nsites]), Number(f[bl])],
			hit: Number(f[p10]) > 0,
			hit05: Number(f[p05]) > 0
		});
	}
	return out;
}

const oos = readOutOfSample(FULL_CORPUS_PATH, CORPUS_PATH);
if (!oos) {
	console.warn(
		`\n[meme-hit-likelihood] OUT-OF-SAMPLE CALIBRATION SKIPPED — needs both\n` +
			`  ${FULL_CORPUS_PATH}\n  ${CORPUS_PATH}\n` +
			`Expected in CI (production data lives outside the repo). NOT expected on a machine where\n` +
			`band copy is being edited: this is the only test that measures the rates the panel quotes\n` +
			`against the population it quotes them about.\n`
	);
}

describe.skipIf(!oos)('out-of-sample calibration (the rates the copy quotes)', () => {
	let band;

	beforeAll(() => {
		band = {
			unlikely: { n: 0, hit: 0 },
			uncertain: { n: 0, hit: 0 },
			likely: { n: 0, hit: 0 }
		};
		for (const r of oos) {
			const b = band[levelOf(model.score(r.features))];
			b.n++;
			if (r.hit) b.hit++;
		}
		console.log(
			`[meme-hit-likelihood] OUT-OF-SAMPLE on ${oos.length} unseen jobs: ` +
				['unlikely', 'uncertain', 'likely']
					.map(
						(b) =>
							`${b} ${band[b].hit}/${band[b].n} = ${((100 * band[b].hit) / band[b].n).toFixed(1)}%`
					)
					.join(' | ')
		);
	});

	it('excludes every training job, and still has enough left to measure', () => {
		expect(oos.length, 'out-of-sample set is too small to bind anything').toBeGreaterThan(4000);
		for (const b of ['unlikely', 'uncertain', 'likely']) {
			expect(band[b].n, `${b} band never fired out of sample`).toBeGreaterThan(0);
		}
	});

	/**
	 * Tolerances are the measured Clopper-Pearson 95% intervals, widened only enough to survive a
	 * corpus refresh. They are deliberately tight: the whole failure mode this feature has already
	 * shipped twice is copy that states a rate the data does not support, and a guard that cannot
	 * bind is the thing that let it through.
	 */
	const EXPECT = {
		unlikely: { claim: 0.05, lo: 0.02, hi: 0.115 }, // measured 5.41% [2.01, 11.39]
		uncertain: { claim: 0.52, lo: 0.46, hi: 0.58 }, // measured 51.93% [48.62, 55.23]
		likely: { claim: 0.93, lo: 0.9, hi: 0.95 } //      measured 92.57% [91.80, 93.28]
	};

	for (const [level, { claim, lo, hi }] of Object.entries(EXPECT)) {
		it(`'${level}' really happens at the rate the copy claims (~${Math.round(claim * 100)}%)`, () => {
			const rate = band[level].hit / band[level].n;
			expect(
				rate,
				`the ${level} band says ~${Math.round(claim * 100)}% but ${band[level].hit} of ` +
					`${band[level].n} unseen jobs (${(100 * rate).toFixed(1)}%) had MEME report a site. ` +
					`Re-derive the copy against ${FULL_CORPUS_PATH} — do not widen this bound.`
			).toBeGreaterThanOrEqual(lo);
			expect(rate).toBeLessThanOrEqual(hi);
		});
	}

	it('the panel prose agrees with the out-of-sample measurement, not just with itself', () => {
		// PANEL_CLAIMS is checked for internal consistency elsewhere; here each claimed value has to
		// survive contact with the held-out jobs.
		const byValue = { 0.05: 'unlikely', 0.52: 'uncertain', 0.93: 'likely' };
		for (const { value, what } of PANEL_CLAIMS) {
			const level = byValue[value];
			if (!level) continue; // the base-rate claim is checked below
			const rate = band[level].hit / band[level].n;
			expect(
				Math.abs(rate - value),
				`panel's ${what} (${value}) vs measured ${rate.toFixed(3)}`
			).toBeLessThan(0.06);
		}
	});

	it('the held-out population still has the base rate the bands were derived against', () => {
		const hits = oos.reduce((n, r) => n + (r.hit ? 1 : 0), 0);
		expect(Math.abs(hits / oos.length - 0.85)).toBeLessThan(0.03);
	});
});
