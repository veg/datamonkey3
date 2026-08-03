/**
 * gateAdvisory.js — DM3-side wrapper around the AxoMEME stage-1 MEME-power gate.
 *
 * The gate is a client-side, geometry-only pre-screen: given a codon alignment + a
 * branch-length tree, it scores P(a full MEME run finds episodic selection) and buckets
 * it into GREEN / YELLOW / RED. It is an ADVISORY only — it never blocks a run.
 *
 * This module keeps the Svelte component thin and the logic unit-testable:
 *   - loadGateSession(): lazy-load onnxruntime-web + create the InferenceSession once.
 *   - computeAdvisory(): the pure decision — returns an advisory object or null.
 *
 * Scope: MEME only. The gate's training label is "MEME found selection", so it is not
 * calibrated for other methods; callers pass the method and we no-op for non-MEME.
 */

import { runGate } from './gate.js';

// Where the vendored model + ORT wasm live (see static/prescreen/).
export const GATE_MODEL_URL = '/prescreen/meme_power_gate.onnx';
const ORT_WASM_PATH = '/prescreen/ort/';

// Only MEME is gated (case-insensitive).
export function isGatedMethod(method) {
	return typeof method === 'string' && method.toLowerCase() === 'meme';
}

// A tree is usable only if it carries at least one positive branch length — the gate's
// median_pos_dist feature is meaningless on a topology-only tree, so we degrade gracefully.
export function treeHasBranchLengths(tree) {
	if (!tree || typeof tree !== 'string') return false;
	const re = /:(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g;
	let m;
	while ((m = re.exec(tree)) !== null) {
		if (parseFloat(m[1]) > 0) return true;
	}
	return false;
}

let _sessionPromise = null;

/**
 * Lazy-load onnxruntime-web and create the gate InferenceSession (once per page).
 * Returns { session, Tensor }. Browser-only: onnxruntime-web loads WASM and must not
 * run during SSR — callers guard with the `browser` flag / onMount.
 * @param {object} [deps] - injectable for tests: { ort, modelUrl }
 */
export async function loadGateSession(deps = {}) {
	if (_sessionPromise && !deps.ort) return _sessionPromise;

	const build = async () => {
		// Use the CPU-only (wasm) build, not the default WebGPU/JSEP bundle — the gate is a
		// tiny tree model, so the 13 MB plain wasm is all we need (and all we vendor).
		const ort = deps.ort || (await import('onnxruntime-web/wasm'));
		// Serve the WASM runtime from our own origin (CSP-safe, offline-capable).
		if (ort.env?.wasm) {
			ort.env.wasm.wasmPaths = ORT_WASM_PATH;
		}
		const modelUrl = deps.modelUrl || GATE_MODEL_URL;
		const session = await ort.InferenceSession.create(modelUrl);
		return { session, Tensor: ort.Tensor };
	};

	const p = build();
	if (!deps.ort) _sessionPromise = p; // cache only the real (non-injected) session
	return p;
}

/** Reset the cached session — test hook. */
export function _resetGateSession() {
	_sessionPromise = null;
}

/**
 * Compute the pre-screen advisory for a submission.
 * Returns null when the gate does not apply (non-MEME method, missing alignment/tree,
 * or a topology-only tree) — the caller renders nothing in those cases.
 *
 * @param {object} args
 * @param {string} args.method - the selected analysis method
 * @param {string} args.alignment - FASTA/NEXUS alignment string
 * @param {string} args.tree - newick tree string (needs branch lengths)
 * @param {object} args.session - an ONNX InferenceSession (from loadGateSession)
 * @param {Function} args.Tensor - the ORT Tensor constructor
 * @param {{greenThresh?: number, redThresh?: number}} [args.opts]
 * @returns {Promise<object|null>} { tier, gate_score, num_seqs, num_sites,
 *   median_pos_dist, recommend_full_meme, note } or null
 */
export async function computeAdvisory({ method, alignment, tree, session, Tensor, opts = {} }) {
	if (!isGatedMethod(method)) return null;
	if (!alignment || !alignment.trim()) return null;
	if (!treeHasBranchLengths(tree)) return null;

	const res = await runGate(alignment, tree, session, Tensor, opts);
	return { ...res, note: noteForTier(res.tier) };
}

/** One-line, honest guidance per tier. */
export function noteForTier(tier) {
	switch (tier) {
		case 'GREEN':
			return 'MEME is likely to find signal at this tree depth.';
		case 'YELLOW':
			return 'Some power — MEME may find signal, but confidence is lower.';
		case 'RED':
			return 'MEME is likely underpowered at this tree depth; it may find nothing.';
		default:
			return '';
	}
}
