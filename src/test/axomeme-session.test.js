/**
 * Tests for AxoMEME session loading.
 *
 * The load path is where 17 MB of runtime and model either does or does not reach a user, and where a
 * swapped artifact either is or is not caught. Both failure modes are silent — the wrong model still
 * returns five plausible numbers per site — so every guard here is exercised in both directions.
 *
 * The ONNX runtime is faked. These tests are about the loading policy, not about inference; the real
 * graph is exercised by the end-to-end check, which needs the 3.78 MB artifact and a browser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	loadSession,
	resetSession,
	isSessionLoaded,
	runSites,
	MODEL_URL
} from '../lib/services/axomeme/session.js';
import { VERIFIED_MODEL_SHA256 } from '../lib/services/axomeme/modelContract.js';

/** Bytes whose sha256 is the pinned value — impossible to forge, so tests bypass the check instead. */
const SOME_BYTES = new Uint8Array([1, 2, 3, 4]).buffer;

function fakeOrt(
	inputNames = ['msa_codons', 'msa_aas', 'dist_matrix', 'mds_coords', 'mds_coords']
) {
	const created = [];
	return {
		created,
		Tensor: class {
			constructor(type, data, dims) {
				this.type = type;
				this.data = data;
				this.dims = dims;
			}
		},
		InferenceSession: {
			create: vi.fn(async (bytes) => {
				created.push(bytes.byteLength ?? bytes.length);
				return {
					inputNames,
					outputNames: ['lrt', 'alpha', 'beta_neg', 'beta_pos', 'p_neg'],
					run: vi.fn(async (feeds) => {
						const n = feeds.msa_codons.dims[0];
						const f = () => ({ data: new Float32Array(n).fill(1) });
						return { lrt: f(), alpha: f(), beta_neg: f(), beta_pos: f(), p_neg: f() };
					})
				};
			})
		}
	};
}

const okFetch = (buffer = SOME_BYTES) =>
	vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => buffer }));

describe('loadSession', () => {
	beforeEach(() => resetSession());

	it('does not load anything just by importing the module', () => {
		// The whole cost discipline in one assertion: fourteen other methods import nothing by
		// touching this file.
		expect(isSessionLoaded()).toBe(false);
	});

	it('fetches the model from static/, not from the bundle', () => {
		// A bundled model would be a build-time import and would land in the JS graph.
		expect(MODEL_URL).toMatch(/^\/models\//);
		expect(MODEL_URL).toMatch(/\.onnx$/);
	});

	it('loads and reports the byte count', async () => {
		const ort = fakeOrt();
		const r = await loadSession({ ort, fetchImpl: okFetch(), verifyHash: false });
		expect(r.bytes).toBe(4);
		expect(ort.InferenceSession.create).toHaveBeenCalledTimes(1);
	});

	it('REFUSES a model whose hash is not the verified one', async () => {
		// The contract's conclusions — eval-mode export, lrt already decoded, rate heads in log1p
		// space — were read off one specific graph. A different one may be fine; nothing here knows
		// that, and guessing produces wrong numbers rather than an error.
		const err = await loadSession({ ort: fakeOrt(), fetchImpl: okFetch() }).catch((e) => e);
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toMatch(/hash mismatch/);
		expect(err.message).toContain(VERIFIED_MODEL_SHA256);
		// And it must say what to do about it, not just that it failed.
		expect(err.message).toMatch(/VERIFIED_MODEL_SHA256/);
	});

	it('refuses a graph that is missing a contract input', async () => {
		const ort = fakeOrt(['msa_codons', 'msa_aas', 'dist_matrix']); // no mds_coords / padding_mask
		const err = await loadSession({ ort, fetchImpl: okFetch(), verifyHash: false }).catch((e) => e);
		expect(err.message).toMatch(/missing expected inputs/);
		expect(err.message).toMatch(/mds_coords/);
		expect(err.message).toMatch(/mds_coords/);
	});

	it('reports a failed fetch with its status', async () => {
		const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }));
		const err = await loadSession({ ort: fakeOrt(), fetchImpl, verifyHash: false }).catch((e) => e);
		expect(err.message).toMatch(/404/);
	});

	it('memoises the PRODUCTION path, so a second alignment does not re-download 17 MB', async () => {
		// This test used to pass `ort`/`fetchImpl`, which loadSession treats as "do not memoise" — so it
		// asserted the BYPASS path and the memo itself had no coverage at all. A regression that dropped
		// the memo would have left the suite green while every alignment re-downloaded 3.78 MB of model.
		//
		// The production path takes no options, so it is driven here by stubbing the globals it reaches
		// for. onnxruntime-web cannot be imported under jsdom, so the assertion is on the FETCH count:
		// one download no matter how many callers ask.
		const buffer = SOME_BYTES;
		let fetches = 0;
		const realFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			fetches++;
			return { ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => buffer };
		};
		try {
			const a = loadSession();
			const b = loadSession();
			expect(a, 'a second call returned a different promise — the memo is not shared').toBe(b);
			expect(isSessionLoaded(), 'isSessionLoaded stayed false on the production path').toBe(true);
			await Promise.allSettled([a, b]);
			// It fails at the hash check or the ort import, but only ONE fetch may have happened.
			expect(fetches).toBeLessThanOrEqual(1);
		} finally {
			globalThis.fetch = realFetch;
		}
	});

	it('bypasses the memo when options are supplied, so tests stay independent', async () => {
		const ort = fakeOrt();
		const fetchImpl = okFetch();
		await loadSession({ ort, fetchImpl, verifyHash: false });
		await loadSession({ ort, fetchImpl, verifyHash: false });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		// And an options call must never populate the production memo — including verifyHash:false,
		// which would otherwise cache a session that was never checked against the pinned artifact.
		expect(isSessionLoaded()).toBe(false);
	});

	it('does not memoise a FAILURE, so a transient error is recoverable', async () => {
		// Caching a rejected promise would disable the feature for the life of the page.
		await loadSession({ ort: fakeOrt(), fetchImpl: okFetch() }).catch(() => {});
		expect(isSessionLoaded()).toBe(false);
	});
});

describe('runSites', () => {
	it('feeds every tensor with the dtype the graph expects', async () => {
		const ort = fakeOrt();
		const { session } = await loadSession({ ort, fetchImpl: okFetch(), verifyHash: false });
		const B = 2;
		const N = 3;
		const bundle = {
			msa_codons: { data: new BigInt64Array(B * N), dims: [B, N, 1] },
			msa_aas: { data: new BigInt64Array(B * N), dims: [B, N, 1] },
			dist_matrix: { data: new Float32Array(B * N * N), dims: [B, N, N] },
			mds_coords: { data: new Float32Array(B * N * 4), dims: [B, N, 4] }
		};
		const out = await runSites(session, bundle, ort);
		const feeds = session.run.mock.calls[0][0];
		// int64 for the token streams: passing float32 of the same values is a type error at
		// session.run, not a silent coercion.
		expect(feeds.msa_codons.type).toBe('int64');
		expect(feeds.msa_aas.type).toBe('int64');
		expect(feeds.dist_matrix.type).toBe('float32');
		expect(feeds.mds_coords.type).toBe('float32');
		// Four tensors, and no fifth: v1-viral has no padding_mask input, and feeding a tensor the
		// graph does not declare is an error at session.run rather than something it ignores.
		expect(Object.keys(feeds).sort()).toEqual([
			'dist_matrix',
			'mds_coords',
			'msa_aas',
			'msa_codons'
		]);
		expect(Object.keys(out).sort()).toEqual(['lrt']);
		expect(out.lrt).toHaveLength(B);
	});

	it('runs ALL sites in one call, not one call per site', async () => {
		// The three phylo tensors are per-alignment, so batching is nearly free. The reference driver
		// loops one forward pass per codon; for a 441-site alignment that is 441x the overhead.
		const ort = fakeOrt();
		const { session } = await loadSession({ ort, fetchImpl: okFetch(), verifyHash: false });
		const B = 441;
		const N = 2;
		await runSites(
			session,
			{
				msa_codons: { data: new BigInt64Array(B * N), dims: [B, N, 1] },
				msa_aas: { data: new BigInt64Array(B * N), dims: [B, N, 1] },
				dist_matrix: { data: new Float32Array(B * N * N), dims: [B, N, N] },
				mds_coords: { data: new Float32Array(B * N * 4), dims: [B, N, 4] }
			},
			ort
		);
		expect(session.run).toHaveBeenCalledTimes(1);
	});
});
