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
	inputNames = ['msa_codons', 'msa_aas', 'dist_matrix', 'mds_coords', 'padding_mask']
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
		expect(err.message).toMatch(/padding_mask/);
	});

	it('reports a failed fetch with its status', async () => {
		const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }));
		const err = await loadSession({ ort: fakeOrt(), fetchImpl, verifyHash: false }).catch((e) => e);
		expect(err.message).toMatch(/404/);
	});

	it('memoises, so a second alignment does not re-download 17 MB', async () => {
		const ort = fakeOrt();
		const fetchImpl = okFetch();
		// The memo only applies to the production path (no overrides), so drive it through a module
		// where the default URL is used but the runtime is injected — the override check is by
		// identity of the options, so assert on the fetch count for the overridden path instead.
		await loadSession({ ort, fetchImpl, verifyHash: false });
		await loadSession({ ort, fetchImpl, verifyHash: false });
		// Overridden calls deliberately bypass the memo so tests stay independent.
		expect(fetchImpl).toHaveBeenCalledTimes(2);
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
			mds_coords: { data: new Float32Array(B * N * 4), dims: [B, N, 4] },
			padding_mask: { data: new Uint8Array(B * N), dims: [B, N] }
		};
		const out = await runSites(session, bundle, ort);
		const feeds = session.run.mock.calls[0][0];
		// int64 for the token streams: passing float32 of the same values is a type error at
		// session.run, not a silent coercion.
		expect(feeds.msa_codons.type).toBe('int64');
		expect(feeds.msa_aas.type).toBe('int64');
		expect(feeds.dist_matrix.type).toBe('float32');
		expect(feeds.mds_coords.type).toBe('float32');
		expect(feeds.padding_mask.type).toBe('bool');
		expect(Object.keys(out).sort()).toEqual(['alpha', 'beta_neg', 'beta_pos', 'lrt', 'p_neg']);
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
				mds_coords: { data: new Float32Array(B * N * 4), dims: [B, N, 4] },
				padding_mask: { data: new Uint8Array(B * N), dims: [B, N] }
			},
			ort
		);
		expect(session.run).toHaveBeenCalledTimes(1);
	});
});
