/**
 * Unit tests for the AxoMEME stage-1 pre-screen gate wiring in DM3.
 *
 * Scoring runs through the REAL exported ONNX model via onnxruntime-node (which shares
 * op kernels with onnxruntime-web), injected into loadGateSession — so this exercises
 * the exact path the browser runs, without a browser.
 *
 * @vitest-environment node
 *
 * (node env, not jsdom: onnxruntime-node's Tensor does a strict `Float32Array` constructor
 * identity check that fails under jsdom's separate realm. The browser has a single realm,
 * so this is a test-harness concern only.)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as ortNode from 'onnxruntime-node';

import {
	computeAdvisory,
	loadGateSession,
	isGatedMethod,
	treeHasBranchLengths,
	noteForTier
} from '../lib/services/prescreen/gateAdvisory.js';
import { extractGateFeatures, tierOf } from '../lib/services/prescreen/gate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESCREEN = join(HERE, '..', 'lib', 'services', 'prescreen');
const MODEL_PATH = join(HERE, '..', '..', 'static', 'prescreen', 'meme_power_gate.onnx');

const featureFixtures = JSON.parse(readFileSync(join(PRESCREEN, 'feature.fixtures.json'), 'utf8'));
const golden = JSON.parse(readFileSync(join(PRESCREEN, 'golden.fixtures.json'), 'utf8'));

let ctx; // { session, Tensor }

beforeAll(async () => {
	// Inject onnxruntime-node + a filesystem model path (the model is bytes here, not a URL).
	const modelBytes = new Uint8Array(readFileSync(MODEL_PATH));
	ctx = await loadGateSession({ ort: ortNode, modelUrl: modelBytes });
});

describe('gate method scope', () => {
	it('gates MEME only (case-insensitive)', () => {
		expect(isGatedMethod('meme')).toBe(true);
		expect(isGatedMethod('MEME')).toBe(true);
		expect(isGatedMethod('fel')).toBe(false);
		expect(isGatedMethod('slac')).toBe(false);
		expect(isGatedMethod(null)).toBe(false);
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

describe('feature extraction parity (vs python gate_features)', () => {
	for (const fx of featureFixtures) {
		it(`matches on fixture: ${fx.name}`, () => {
			const got = extractGateFeatures(fx.alignment, fx.tree);
			expect(got[0]).toBe(fx.expected[0]); // num_seqs
			expect(got[1]).toBe(fx.expected[1]); // num_sites
			expect(got[3]).toBe(fx.expected[3]); // frac_p_defined
			expect(Math.abs(got[2] - fx.expected[2])).toBeLessThan(1e-12); // median_pos_dist
		});
	}
});

describe('ONNX model parity (vs sklearn predict_proba)', () => {
	it('matches the golden vectors within 1e-6 through onnxruntime', async () => {
		let maxDiff = 0;
		for (const v of golden.vectors) {
			const input = new ortNode.Tensor('float32', Float32Array.from(v.input), [1, v.input.length]);
			const out = await ctx.session.run({ [ctx.session.inputNames[0]]: input });
			const probs = out.probabilities ?? out[ctx.session.outputNames.at(-1)];
			const got = Number(probs.data[1]);
			maxDiff = Math.max(maxDiff, Math.abs(got - v.expected_prob));
		}
		expect(maxDiff).toBeLessThan(1e-6);
	});
});

describe('tier boundaries', () => {
	it('GREEN >= 0.70, RED < 0.35, YELLOW between', () => {
		expect(tierOf(0.7)).toBe('GREEN');
		expect(tierOf(0.6999999)).toBe('YELLOW');
		expect(tierOf(0.35)).toBe('YELLOW');
		expect(tierOf(0.3499999)).toBe('RED');
	});
});

describe('computeAdvisory', () => {
	const memeTree = '((seqA:0.3,seqB:0.4):0.2,(seqC:0.5,seqD:0.35):0.25);';
	const memeAln = '>seqA\nATGACTGATCCC\n>seqB\nATGACAGATCCC\n>seqC\nATGACTGGTCCC\n>seqD\nATGACTGATCCA\n';

	it('returns null for a non-MEME method', async () => {
		const res = await computeAdvisory({ method: 'fel', alignment: memeAln, tree: memeTree, ...ctx });
		expect(res).toBeNull();
	});

	it('returns null when the tree has no branch lengths', async () => {
		const res = await computeAdvisory({ method: 'meme', alignment: memeAln, tree: '((seqA,seqB),seqC);', ...ctx });
		expect(res).toBeNull();
	});

	it('returns null when the alignment is empty', async () => {
		const res = await computeAdvisory({ method: 'meme', alignment: '', tree: memeTree, ...ctx });
		expect(res).toBeNull();
	});

	it('returns a well-formed advisory for a MEME submission', async () => {
		const res = await computeAdvisory({ method: 'meme', alignment: memeAln, tree: memeTree, ...ctx });
		expect(res).not.toBeNull();
		expect(['GREEN', 'YELLOW', 'RED']).toContain(res.tier);
		expect(res.gate_score).toBeGreaterThanOrEqual(0);
		expect(res.gate_score).toBeLessThanOrEqual(1);
		expect(res.num_seqs).toBe(4);
		expect(res.recommend_full_meme).toBe(res.tier !== 'RED');
		expect(res.note).toBe(noteForTier(res.tier));
	});

	it('a shallow tree gates RED (underpowered)', async () => {
		// few taxa, tiny branch lengths -> low power
		const shallowTree = '((a:0.005,b:0.004):0.003,c:0.006);';
		const shallowAln = '>a\nATGACT\n>b\nATGACA\n>c\nATGACG\n';
		const res = await computeAdvisory({ method: 'meme', alignment: shallowAln, tree: shallowTree, ...ctx });
		expect(res).not.toBeNull();
		expect(res.tier).toBe('RED');
		expect(res.recommend_full_meme).toBe(false);
	});
});
