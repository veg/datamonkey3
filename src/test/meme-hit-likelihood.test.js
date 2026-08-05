/**
 * Unit tests for the MEME hit-likelihood estimate.
 *
 * Scoring runs through the SHIPPED path — the pure-JS tree-ensemble evaluator over
 * meme_hit_likelihood.ensemble.json — which is exactly what the browser executes. There is no
 * native binding and no ONNX runtime anywhere in this file, so it runs on any CPU architecture;
 * the predecessor to this suite could not even be collected on an x64 node because the ONNX
 * runtime it imported ships no darwin/x64 binary.
 *
 * The golden vectors are the same ones the ONNX model was pinned against, so they double as the
 * parity check between the JS evaluator and the .onnx it was generated from.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
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
	noteForLevel,
	STATUS,
	MODEL_BASIS,
	HIT_LIKELIHOOD_CAVEAT
} from '../lib/services/prescreen/hitLikelihood.js';
import {
	extractHitLikelihoodFeatures,
	checkFeatureDomain,
	levelOf,
	runHitLikelihood,
	BRANCH_SPLIT_COUNTS,
	FEATURE_DOMAIN,
	FEATURE_NAMES,
	LIVE_FEATURES
} from '../lib/services/prescreen/hitLikelihoodModel.js';
import {
	recommendFor,
	substitutionBudget,
	ROUTING
} from '../lib/services/prescreen/recommendation.js';
import { prepareTreeEnsemble, evalTreeEnsemble } from '../lib/services/prescreen/treeEnsemble.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESCREEN = join(HERE, '..', 'lib', 'services', 'prescreen');

const featureFixtures = JSON.parse(readFileSync(join(PRESCREEN, 'feature.fixtures.json'), 'utf8'));
const golden = JSON.parse(readFileSync(join(PRESCREEN, 'golden.fixtures.json'), 'utf8'));
const ensembleDoc = JSON.parse(
	readFileSync(join(PRESCREEN, 'meme_hit_likelihood.ensemble.json'), 'utf8')
);

let model; // the shipped scorer

beforeAll(async () => {
	model = await loadHitLikelihoodModel();
});

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

describe('feature extraction parity (vs python gate_features)', () => {
	for (const fx of featureFixtures) {
		it(`matches on fixture: ${fx.name}`, () => {
			const got = extractHitLikelihoodFeatures(fx.alignment, fx.tree);
			expect(got[0]).toBe(fx.expected[0]); // num_seqs
			expect(got[1]).toBe(fx.expected[1]); // num_sites
			expect(got[3]).toBe(fx.expected[3]); // frac_p_defined
			expect(Math.abs(got[2] - fx.expected[2])).toBeLessThan(1e-12); // median_pos_dist
		});
	}
});

describe('model parity (JS evaluator vs the sklearn/ONNX golden vectors)', () => {
	it('matches all 12 golden vectors within 1e-6', async () => {
		const ensemble = prepareTreeEnsemble(ensembleDoc);
		let maxDiff = 0;
		for (const v of golden.vectors) {
			maxDiff = Math.max(maxDiff, Math.abs(evalTreeEnsemble(ensemble, v.input) - v.expected_prob));
		}
		expect(maxDiff).toBeLessThan(1e-6);
	});

	it('scores the same through the loaded model as through the raw evaluator', async () => {
		const ensemble = prepareTreeEnsemble(ensembleDoc);
		for (const v of golden.vectors) {
			expect(model.score(v.input)).toBeCloseTo(evalTreeEnsemble(ensemble, v.input), 12);
		}
	});

	it('pins the .onnx it was generated from', () => {
		// Hash the file on disk, do not merely check the field LOOKS like a hash. A pattern match
		// passes for any 64 hex characters, so it would not notice the coefficients being
		// regenerated from a different model than the .onnx sitting next to them — which is the
		// one failure this pin exists to catch. Full ONNX-vs-JS scoring parity is enforced
		// separately by scripts/prescreen/verify_parity.py in CI; this is the cheap local half.
		const onDisk = createHash('sha256')
			.update(readFileSync(join(PRESCREEN, 'meme_hit_likelihood.onnx')))
			.digest('hex');
		expect(ensembleDoc.source_sha256).toBe(onDisk);
		expect(ensembleDoc.n_trees).toBe(150);
	});
});

describe('frac_p_defined is inert', () => {
	// The 4th feature is only knowable AFTER a MEME run. The shipped model splits on it zero times,
	// which is the only reason passing a constant is not a leak — so that claim is a test, not a
	// comment. If a retrain starts using it, this fails and the placeholder becomes a real bug.
	it('has no branch nodes in the shipped ensemble', () => {
		expect(BRANCH_SPLIT_COUNTS.frac_p_defined).toBe(0);
		expect(ensembleDoc.branch_split_counts[FEATURE_NAMES.indexOf('frac_p_defined')]).toBe(0);
		expect(LIVE_FEATURES).not.toContain('frac_p_defined');
	});

	it('cannot move the score by any value', () => {
		const base = model.score([50, 200, 0.02, 1.0]);
		for (const v of [-100, -1, 0, 0.25, 2, 100, 1e9]) {
			expect(model.score([50, 200, 0.02, v])).toBe(base);
		}
	});
});

describe('level boundaries', () => {
	it('likely >= 0.70, unlikely < 0.35, uncertain between', () => {
		expect(levelOf(0.7)).toBe('likely');
		expect(levelOf(0.6999999)).toBe('uncertain');
		expect(levelOf(0.35)).toBe('uncertain');
		expect(levelOf(0.3499999)).toBe('unlikely');
	});
});

describe('out-of-distribution guard', () => {
	const feat = (seqs, sites, dist) => [seqs, sites, dist, 1.0];

	it('accepts a vector inside the fitted range', () => {
		expect(checkFeatureDomain(feat(50, 200, 0.02)).ok).toBe(true);
	});

	it('rejects a tree whose branch lengths are not substitutions/site', () => {
		// A time-calibrated tree, in millions of years. The model does not widen out
		// here, it rails to a confident leaf — so it must not be asked.
		const d = checkFeatureDomain(feat(20, 300, 12.5));
		expect(d.ok).toBe(false);
		expect(d.reasons[0]).toMatchObject({ feature: 'median_pos_dist', code: 'above-max' });
		expect(d.summary).toContain('not a codon-model tree');
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

	it('rejects vectors past the top of the fitted range', () => {
		expect(checkFeatureDomain(feat(5000, 200, 0.02)).reasons[0].code).toBe('above-max');
		expect(checkFeatureDomain(feat(50, 20000, 0.02)).reasons[0].code).toBe('above-max');
	});

	it('rejects vectors below it', () => {
		expect(checkFeatureDomain(feat(3, 200, 0.02)).reasons[0].code).toBe('below-min');
		expect(checkFeatureDomain(feat(50, 5, 0.02)).reasons[0].code).toBe('below-min');
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

	it('documents a domain no wider than the model support it cites', () => {
		expect(FEATURE_DOMAIN.num_seqs.max).toBeLessThanOrEqual(501);
		expect(FEATURE_DOMAIN.median_pos_dist.max).toBeLessThanOrEqual(0.5);
	});
});

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
		expect(res.num_seqs).toBe(20);
		expect(res.num_sites).toBe(100);
		expect(res.note).toBe(noteForLevel(res.level));
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
		// evidence about BUSTED, aBSREL or FUBAR, so it must not claim what they would find.
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

describe('copy', () => {
	it('has a note for every level and nothing for none', () => {
		expect(noteForLevel('likely')).toBeTruthy();
		expect(noteForLevel('uncertain')).toBeTruthy();
		expect(noteForLevel('unlikely')).toBeTruthy();
		expect(noteForLevel(null)).toBe('');
	});

	it('states what the estimate is not', () => {
		expect(HIT_LIKELIHOOD_CAVEAT).toContain('not whether this gene is under selection');
	});
});

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

	it('names no other method in any reachable state', async () => {
		const states = [
			['non-MEME method', { method: 'fel', alignment: bigAln, tree: bigTree }],
			['no alignment', { method: 'meme', alignment: '', tree: bigTree }],
			['topology-only tree', { method: 'meme', alignment: bigAln, tree: '((a,b),c);' }],
			['out of distribution', { method: 'meme', alignment: bigAln, tree: timeTree }],
			['scored, ample data', { method: 'meme', alignment: bigAln, tree: bigTree }],
			['scored, thin data', { method: 'meme', alignment: tinyAln, tree: tinyTree }],
			['user tree', { method: 'meme', alignment: bigAln, tree: bigTree, treeSource: 'user' }],
			['inferred tree', { method: 'meme', alignment: bigAln, tree: bigTree, treeSource: 'nj' }],
			['unknown tree', { method: 'meme', alignment: bigAln, tree: bigTree, treeSource: 'zzz' }]
		];
		for (const [name, args] of states) {
			const res = await estimateHitLikelihood({ ...args, model, opts: { resampleAvailable: true } });
			const text = visibleText(res);
			expect(text, `state "${name}" named another method: ${text}`).not.toMatch(OTHER_METHODS);
		}
		// The failure path is constructed, not reachable through estimateHitLikelihood.
		expect(visibleText(hitLikelihoodError())).not.toMatch(OTHER_METHODS);
	});

	it('names no other method in the per-level guidance or notes', () => {
		for (const level of ['likely', 'uncertain', 'unlikely']) {
			expect(noteForLevel(level)).not.toMatch(OTHER_METHODS);
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

	it('the shared caveat still says what the number is NOT', () => {
		// The one sentence that has to survive any rewrite of the copy.
		expect(HIT_LIKELIHOOD_CAVEAT).toMatch(/not whether this gene is under selection/i);
		expect(MODEL_BASIS).toMatch(/MEME/);
	});
});

