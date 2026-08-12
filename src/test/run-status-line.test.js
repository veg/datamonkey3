/**
 * Tests for the run row's copy rules (design/03-run-feedback/, audit item 3).
 *
 * These are not incidental strings. Each threshold was chosen against a measured property of the
 * timing model, and the most important assertion in this file is a NEGATIVE one: the estimate must
 * never appear next to the elapsed clock. The fitted power law is R² ≈ 0.63 — good to a factor of
 * two, not to the minute — so "02:13 elapsed · typically ~4 min" reads as a countdown the software
 * cannot honour, and a user at 4:30 against "~4 min" concludes something is wrong when nothing is.
 */
import { describe, it, expect } from 'vitest';
import {
	runStatusLine,
	formatElapsed,
	locationLabel,
	isTerminal,
	RUN_STATUS_CONSTANTS as C
} from '../lib/utils/runStatusLine.js';

const E = 240; // a 4-minute estimate, in seconds

describe('formatElapsed', () => {
	it('is m:ss under an hour and h:mm:ss past it', () => {
		expect(formatElapsed(0)).toBe('0:00');
		expect(formatElapsed(9)).toBe('0:09');
		expect(formatElapsed(133)).toBe('2:13');
		expect(formatElapsed(3600)).toBe('1:00:00');
		expect(formatElapsed(3725)).toBe('1:02:05');
	});

	it('does not produce negative or NaN clocks', () => {
		expect(formatElapsed(-5)).toBe('0:00');
		expect(formatElapsed(undefined)).toBe('0:00');
	});
});

describe('locationLabel carries the consequence, not the jargon', () => {
	it('says what a reload will do, rather than "Local" / "Server"', () => {
		// A reload kills a local run and does not kill a server one. "Local" does not tell a biologist
		// that; "in this tab" does.
		expect(locationLabel('wasm')).toBe('in this tab');
		expect(locationLabel(undefined)).toBe('in this tab');
		expect(locationLabel('backend')).toBe('on the server');
	});
});

describe('a running row', () => {
	const running = (elapsed, estimate = E) =>
		runStatusLine({
			method: 'fel',
			status: 'running',
			executionMode: 'wasm',
			elapsedSeconds: elapsed,
			estimateSeconds: estimate
		});

	it('shows no clock in the first ten seconds', () => {
		// A timer at 0:03 invites watching it, and many local runs finish inside ten seconds.
		const r = running(3);
		expect(r.clock).toBeNull();
		expect(r.detail).toBe('in this tab · starting');
	});

	it('shows elapsed as plain fact once past ten seconds', () => {
		const r = running(133);
		expect(r.clock).toBe('2:13');
		expect(r.detail).toBe('in this tab · running');
	});

	it('NEVER prints the estimate beside the clock', () => {
		// The rule this module exists to enforce. If this fails, the row has become a countdown.
		for (const t of [11, 60, 133, 300, 600, 2000, 5000]) {
			const r = running(t);
			const text = `${r.detail} ${r.clock ?? ''}`;
			expect(text, `estimate leaked at t=${t}`).not.toMatch(/typical|~|estimated|expected|4 min/i);
		}
	});

	it('calls a run long only past twice the estimate', () => {
		expect(running(2 * E - 1).detail).toBe('in this tab · running');
		expect(running(2 * E + 1).detail).toBe('in this tab · longer than most runs this size');
	});

	it('says "than most runs this size", never "than expected"', () => {
		// The software never expected anything. It fitted a curve.
		expect(running(2 * E + 1).detail).not.toMatch(/expected/i);
	});

	it('does not escalate tone merely for being long', () => {
		// Information, not an alarm.
		expect(running(2 * E + 1).tone).toBe('running');
	});

	it('only reaches "much longer" past BOTH 6x and the 30-minute floor', () => {
		// The floor exists so a 4-second FUBAR run does not raise a flag at 24 seconds.
		expect(6 * E).toBeLessThan(C.MUCH_LONGER_FLOOR_SECONDS);
		expect(running(6 * E + 10).detail).not.toMatch(/much longer/);

		const past = C.MUCH_LONGER_FLOOR_SECONDS + 1;
		expect(running(past).detail).toBe('in this tab · much longer than most runs this size');
		expect(running(past).tone).toBe('slow');
		expect(running(past).showDetails).toBe(true);
	});

	it('uses 6x when the estimate is large enough for it to dominate the floor', () => {
		const big = 20 * 60; // 20 min estimate -> 6x = 2h, well past the floor
		const r = runStatusLine({
			method: 'busted',
			status: 'running',
			elapsedSeconds: 6 * big + 60,
			estimateSeconds: big
		});
		expect(r.detail).toMatch(/much longer/);
	});

	it('says nothing beyond elapsed when the method has no fitted equation', () => {
		// PRIME, AxoMEME, B-STILL. Inventing a threshold from no data is the dishonest option.
		// null rather than undefined: undefined would trigger the helper's default estimate.
		const r = running(100000, null);
		expect(r.clock).toBe(formatElapsed(100000));
		expect(r.detail).toBe('in this tab · running');
		expect(r.detail).not.toMatch(/longer/);
	});
});

describe('a finished row', () => {
	it('reports elapsed as a fact and drops the running clock', () => {
		const r = runStatusLine({
			method: 'fel',
			status: 'completed',
			elapsedSeconds: 221,
			estimateSeconds: E
		});
		expect(r.detail).toBe('finished in 3:41');
		expect(r.tone).toBe('done');
		expect(r.clock).toBeNull();
	});

	it('does not score itself against the estimate', () => {
		const r = runStatusLine({
			method: 'fel',
			status: 'completed',
			elapsedSeconds: 221,
			estimateSeconds: E
		});
		expect(r.detail).not.toMatch(/estimate|typical|~/i);
	});
});

describe('a failed row', () => {
	it('puts the first line of the error inline and offers the rest', () => {
		const r = runStatusLine({
			method: 'fel',
			status: 'error',
			elapsedSeconds: 12,
			error: 'Tree format error.\nPlease select "Inferred NJ tree" above, or upload a valid tree.'
		});
		expect(r.detail).toBe('failed after 0:12 · Tree format error.');
		expect(r.tone).toBe('failed');
		expect(r.showDetails).toBe(true);
	});

	it('is still readable when no error text was recorded', () => {
		const r = runStatusLine({ method: 'fel', status: 'error', elapsedSeconds: 12 });
		expect(r.detail).toBe('failed after 0:12');
		expect(r.showDetails).toBe(false);
	});
});

describe('isTerminal', () => {
	it('covers every state a run can stop in', () => {
		for (const s of ['completed', 'error', 'cancelled', 'interrupted', 'connection_lost']) {
			expect(isTerminal(s), s).toBe(true);
		}
		for (const s of ['pending', 'running', 'initializing', 'mounting', 'processing']) {
			expect(isTerminal(s), s).toBe(false);
		}
	});
});
