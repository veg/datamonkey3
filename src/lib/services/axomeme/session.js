/**
 * session.js — loading and running the AxoMEME 2.0 ONNX graph in the browser.
 *
 * THE COST DISCIPLINE THIS FILE EXISTS TO ENFORCE. onnxruntime-web is ~13 MB of WASM and the model is
 * another 3.78 MB. DataMonkey has fifteen analysis methods and AxoMEME is one of them; the other
 * fourteen must download none of it. That is not a nice-to-have — the first version of the MEME
 * hit-likelihood gate shipped 13.5 MB of ONNX Runtime to every method and rendered nothing for
 * fourteen of them, and an "is the element absent?" test passed the whole time because the element
 * WAS absent. The bytes were the bug.
 *
 * So:
 *   - The runtime is loaded by DYNAMIC import inside loadSession(), never at module scope. Importing
 *     this file costs nothing; calling loadSession() is what costs 17 MB.
 *   - The model is fetched from static/ rather than bundled, so it is cached by the browser
 *     independently of the JS and never enters the bundle graph.
 *   - The session is memoised, because a second 17 MB download to score a second alignment would be
 *     indefensible.
 *
 * INTEGRITY. The artifact's sha256 is pinned in modelContract.js and verified after fetch. The
 * contract's conclusions — eval-mode export, `lrt` already decoded, rate heads in log1p space — were
 * read off THAT graph, and a silently swapped model would make all of them wrong while everything
 * continued to run. Verification is skipped only when Web Crypto is unavailable (non-secure context),
 * which is reported rather than hidden.
 *
 * BATCHING. dist_matrix, mds_coords and padding_mask are per-alignment, not per-site — the reference
 * computes them once and `expand`s them across sites. So every codon site of an alignment goes
 * through the graph in ONE run, with those three tensors repeated along the batch axis. The reference
 * driver instead loops one forward pass per site (predict_regression_nexus.py:1345), which for a
 * 441-site alignment is 441 sessions of overhead for identical work.
 */

import { INPUT_NAMES, VERIFIED_MODEL_SHA256 } from './modelContract.js';

/** Where the artifact lives. Served from static/, never imported, never bundled. */
export const MODEL_URL = '/models/axomeme/axomeme_2.0_viral_finetuned.onnx';

/** Memoised session promise. Null until the first scoring call. */
let sessionPromise = null;

/**
 * Hex sha256 of a buffer, or null where Web Crypto is unavailable.
 *
 * Digests a Uint8Array VIEW rather than the ArrayBuffer itself. `digest` accepts either per spec, but
 * an ArrayBuffer constructed in another realm fails the implementation's instanceof check — which is
 * exactly what happens under jsdom, and would equally happen for a buffer crossing a worker boundary.
 * Constructing the view here puts it in this module's realm.
 */
async function sha256Hex(buffer) {
	if (typeof globalThis.crypto?.subtle?.digest !== 'function') return null;
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(buffer));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Load the ONNX session, downloading the runtime and the model on first call.
 *
 * @param {{url?: string, verifyHash?: boolean, ort?: any, fetchImpl?: typeof fetch}} [options]
 *   `ort` and `fetchImpl` exist for tests; production passes neither.
 * @returns {Promise<{session: any, sha256: string|null, bytes: number}>}
 */
export function loadSession(options = {}) {
	if (sessionPromise && !options.url && !options.ort && !options.fetchImpl) return sessionPromise;

	const promise = (async () => {
		const url = options.url ?? MODEL_URL;
		const doFetch = options.fetchImpl ?? globalThis.fetch;

		// The dynamic import is the whole point — see the header. Do not hoist it.
		//
		// NOTE THE SUBPATH: 'onnxruntime-web/wasm', not 'onnxruntime-web'. The default entry is the
		// full build, which resolves its binary to the JSEP variant — the WebGPU-enabled one, a 26.8 MB
		// wasm this feature has no use for. Importing the CPU-only build makes it load the plain
		// SIMD+threads binary (12.9 MB) that scripts/copy-ort-wasm.mjs vendors. Found the hard way:
		// with the default entry the runtime asks for ort-wasm-simd-threaded.jsep.mjs and aborts with
		// "no available backend found", which reads like a broken model rather than a wrong build.
		const ort = options.ort ?? (await import('onnxruntime-web/wasm'));

		// SERVE THE RUNTIME OURSELVES. onnxruntime-web does not bundle its WASM binary; it fetches it
		// at run time, and with no wasmPaths set it resolves to a jsDelivr CDN. That violates this
		// project's core constraint — the site must be servable with no other domains involved — and
		// it also simply fails, with "no available backend found", which reads like a broken model
		// rather than a missing asset. scripts/copy-ort-wasm.mjs puts the binary in static/ort/ at
		// build time, pinned by package.json rather than committed.
		//
		// numThreads 1 because multi-threading needs SharedArrayBuffer, which needs COOP/COEP headers
		// this app does not set. Asking for threads without them makes the runtime fall back anyway,
		// and the fallback path is slower than starting single-threaded.
		if (ort.env?.wasm) {
			ort.env.wasm.wasmPaths = options.wasmPaths ?? '/ort/';
			ort.env.wasm.numThreads = 1;
		}

		const response = await doFetch(url);
		if (!response.ok) {
			throw new Error(`AxoMEME model fetch failed: ${response.status} ${response.statusText}`);
		}
		const buffer = await response.arrayBuffer();

		const sha256 = options.verifyHash === false ? null : await sha256Hex(buffer);
		if (sha256 && sha256 !== VERIFIED_MODEL_SHA256) {
			// Refuse rather than score. Every conclusion in modelContract.js was read off the pinned
			// graph; a different one may well be fine, but nothing here knows that, and the failure
			// mode of guessing is silently wrong numbers rather than an error.
			throw new Error(
				`AxoMEME model hash mismatch.\n  expected ${VERIFIED_MODEL_SHA256}\n  got      ${sha256}\n` +
					'The input/output contract was verified against the expected artifact. If the model was ' +
					'deliberately updated, re-verify src/lib/services/axomeme/modelContract.js and update ' +
					'VERIFIED_MODEL_SHA256 in the same commit.'
			);
		}

		const session = await ort.InferenceSession.create(new Uint8Array(buffer));

		// The graph must expose exactly what the contract says. A rename upstream would otherwise
		// surface as an opaque runtime error deep inside session.run.
		const missing = INPUT_NAMES.filter((n) => !session.inputNames.includes(n));
		if (missing.length) {
			throw new Error(`AxoMEME model is missing expected inputs: ${missing.join(', ')}`);
		}

		return { session, sha256, bytes: buffer.byteLength };
	})();

	if (!options.url && !options.ort && !options.fetchImpl) sessionPromise = promise;
	// A failed load must not be memoised as a permanent failure — a transient fetch error would
	// otherwise disable the feature for the rest of the page's life.
	promise.catch(() => {
		if (sessionPromise === promise) sessionPromise = null;
	});
	return promise;
}

/** Drop the memoised session. Tests use this; production has no reason to. */
export function resetSession() {
	sessionPromise = null;
}

/** True once a session is loaded or loading — lets a caller avoid triggering a 17 MB download. */
export function isSessionLoaded() {
	return sessionPromise !== null;
}

/**
 * Run every site of an alignment through the graph.
 *
 * @param {any} session an ONNX InferenceSession
 * @param {object} bundle tensors as produced by the assembly layer, shaped per modelContract
 * @param {any} ort the onnxruntime module (passed in so this stays a pure function)
 * @returns {Promise<{lrt: Float32Array, alpha: Float32Array, beta_neg: Float32Array,
 *   beta_pos: Float32Array, p_neg: Float32Array}>}
 */
export async function runSites(session, bundle, ort) {
	const feeds = {
		msa_codons: new ort.Tensor('int64', bundle.msa_codons.data, bundle.msa_codons.dims),
		msa_aas: new ort.Tensor('int64', bundle.msa_aas.data, bundle.msa_aas.dims),
		dist_matrix: new ort.Tensor('float32', bundle.dist_matrix.data, bundle.dist_matrix.dims),
		mds_coords: new ort.Tensor('float32', bundle.mds_coords.data, bundle.mds_coords.dims),
		padding_mask: new ort.Tensor('bool', bundle.padding_mask.data, bundle.padding_mask.dims)
	};
	const out = await session.run(feeds);
	return {
		lrt: out.lrt.data,
		alpha: out.alpha.data,
		beta_neg: out.beta_neg.data,
		beta_pos: out.beta_pos.data,
		p_neg: out.p_neg.data
	};
}
