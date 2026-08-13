/**
 * executionAdvice() — which mode a submission defaults to, and what the panel says about it.
 *
 * The assertions below compare against the ESTIMATOR'S OWN output rather than against literal
 * durations ('~2h 15m'). A literal would turn every retune of the fitted equations into a red test
 * for no reason, and — worse — would let the advice and the "Before you run" row drift apart while
 * both stayed green. The point of the module is that they read from one place.
 */

import { describe, it, expect } from 'vitest';
import { executionAdvice, SLOW_CATEGORIES } from '../lib/utils/executionAdvice.js';
import { calculateRuntimeEstimate, SPEED_CATEGORIES } from '../lib/utils/timingEstimates.js';

// A real dataset shape from the bundled demos. BGM at this size is 'very-slow' locally and 'slow' on
// the server — the exact case where defaulting to the browser costs a user hours.
const SEQS = 20;
const SITES = 255;

describe('executionAdvice', () => {
	it('recommends the server for a slow local run when the server is up', () => {
		const result = executionAdvice({
			method: 'bgm',
			sequences: SEQS,
			sites: SITES,
			serverConnected: true
		});

		const local = calculateRuntimeEstimate('bgm', SEQS, SITES, 'wasm');
		const server = calculateRuntimeEstimate('bgm', SEQS, SITES, 'backend');

		expect(result.hasEstimate).toBe(true);
		expect(result.recommend).toBe('backend');
		expect(result.advice).toContain(local.description);
		expect(result.advice).toContain(server.description);
		// Both estimates travel with the advice so the radio sub-labels can print them.
		expect(result.local.description).toBe(local.description);
		expect(result.server.description).toBe(server.description);
	});

	it('never promises a server that is down', () => {
		const result = executionAdvice({
			method: 'bgm',
			sequences: SEQS,
			sites: SITES,
			serverConnected: false
		});

		const local = calculateRuntimeEstimate('bgm', SEQS, SITES, 'wasm');
		const server = calculateRuntimeEstimate('bgm', SEQS, SITES, 'backend');

		expect(result.recommend).toBeNull();
		expect(result.advice).toMatch(/tab must stay open/);
		expect(result.advice).toContain(local.description);
		// THE ASSERTION THAT MATTERS: no server duration anywhere in the sentence. Offering "~33 min on
		// the server" while the socket is down is advice the user cannot act on.
		expect(result.advice).not.toContain(server.description);
	});

	it('says nothing about a run that is not slow', () => {
		const result = executionAdvice({
			method: 'fel',
			sequences: SEQS,
			sites: SITES,
			serverConnected: true
		});

		expect(result.hasEstimate).toBe(true);
		expect(SLOW_CATEGORIES.has(result.local.category)).toBe(false);
		expect(result.recommend).toBeNull();
		expect(result.advice).toBeNull();
		// Still carries both estimates: the sub-labels state durations even when there is no advice.
		expect(result.local.description).toBeTruthy();
		expect(result.server.description).toBeTruthy();
	});

	it('invents nothing for a method with no fitted equation', () => {
		// AxoMEME, PRIME, NRM, B-STILL and FADE are absent from BACKEND_TIMING_EQUATIONS. A guessed
		// duration is worse than none, and a guessed CATEGORY would silently move a radio.
		for (const method of ['axomeme', 'prime', 'nrm', 'b-still', 'fade']) {
			const result = executionAdvice({
				method,
				sequences: SEQS,
				sites: SITES,
				serverConnected: true
			});
			expect(result, method).toEqual({
				hasEstimate: false,
				local: null,
				server: null,
				recommend: null,
				advice: null
			});
		}
	});

	it('stays silent with no file loaded', () => {
		for (const input of [
			{ method: 'bgm', sequences: 0, sites: SITES },
			{ method: 'bgm', sequences: SEQS, sites: 0 },
			{ method: null, sequences: SEQS, sites: SITES },
			{}
		]) {
			const result = executionAdvice({ ...input, serverConnected: true });
			expect(result.hasEstimate, JSON.stringify(input)).toBe(false);
			expect(result.recommend).toBeNull();
			expect(result.advice).toBeNull();
		}
	});

	it('accepts the method name in the case the dropdown uses', () => {
		// MethodSelector passes selectedMethod straight through, and methodConfig's keys are 'BGM',
		// 'aBSREL', 'AxoMEME'. Lowercasing happens inside the estimator; this pins that it happens.
		const upper = executionAdvice({
			method: 'BGM',
			sequences: SEQS,
			sites: SITES,
			serverConnected: true
		});
		expect(upper.recommend).toBe('backend');
	});

	it('applies advanced options that multiply the runtime', () => {
		// Same alignment, 10x the MCMC steps: the estimate has to move, or the advice is describing a
		// run nobody submitted.
		const plain = executionAdvice({ method: 'bgm', sequences: SEQS, sites: SITES });
		const heavy = executionAdvice({
			method: 'bgm',
			sequences: SEQS,
			sites: SITES,
			methodOptions: { steps: 100000 }
		});
		expect(heavy.local.minutes).toBeGreaterThan(plain.local.minutes);
	});

	it('names categories that timingEstimates.js actually defines', () => {
		// Drift guard. Rename 'very-slow' in SPEED_CATEGORIES and this set silently stops matching
		// anything, which disables the advice everywhere without failing a single other test.
		expect(Object.keys(SPEED_CATEGORIES)).toEqual(expect.arrayContaining([...SLOW_CATEGORIES]));
	});
});
