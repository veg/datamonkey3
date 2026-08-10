/**
 * Tests for treeSanitation.js.
 *
 * The fixtures are not invented. They are the shapes DM3's own NJ inference produces
 * (src/data/shared/NJ.bf) and the values measured to crash the AxoMEME 2.0 inference path at
 * predict_regression_nexus.py:955, which computes log((node_count + 1.0) / (dist + 0.1)).
 */
import { describe, it, expect } from 'vitest';
import {
	branchLengths,
	inspectBranchLengths,
	hasCrashingBranchLength,
	NJ_SATURATION_SENTINEL
} from '../lib/utils/treeSanitation.js';

describe('branchLengths', () => {
	it('reads plain, scientific and negative lengths', () => {
		expect(branchLengths('((a:0.1,b:0.2):0.05,c:0.3);')).toEqual([0.1, 0.2, 0.05, 0.3]);
		expect(branchLengths('(a:1.5e-2,b:3.0E-3);')).toEqual([0.015, 0.003]);
		expect(branchLengths('(x:-0.5,y:0.2,z:0.4);')).toEqual([-0.5, 0.2, 0.4]);
	});

	it('returns nothing for a topology-only tree or non-string input', () => {
		expect(branchLengths('((a,b),c);')).toEqual([]);
		expect(branchLengths('')).toEqual([]);
		expect(branchLengths(null)).toEqual([]);
	});

	it('is not confused by a bootstrap value or a quoted label', () => {
		// )95: is a support value on an internal node, not a length; 'Homo:sapiens' is a name.
		expect(branchLengths('((a:0.1,b:0.2)95:0.05,c:0.3);')).toEqual([0.1, 0.2, 0.05, 0.3]);
		expect(branchLengths("(('Homo:sapiens':0.1,b:0.2):0.05);")).toEqual([0.1, 0.2, 0.05]);
	});

	it('is re-entrant — a global regex must not carry lastIndex between calls', () => {
		const t = '((a:0.1,b:0.2):0.05,c:0.3);';
		expect(branchLengths(t)).toEqual(branchLengths(t));
	});
});

describe('inspectBranchLengths', () => {
	it('passes a clean tree', () => {
		const r = inspectBranchLengths('((a:0.1,b:0.2):0.05,c:0.3);');
		expect(r.ok).toBe(true);
		expect(r.negative).toBe(0);
		expect(r.hasLengths).toBe(true);
		expect(r.reasons).toEqual([]);
	});

	it('flags a topology-only tree', () => {
		const r = inspectBranchLengths('((a,b),c);');
		expect(r.ok).toBe(false);
		expect(r.hasLengths).toBe(false);
		expect(r.reasons[0]).toMatch(/topology-only/);
	});

	it('counts negatives and reports the worst one', () => {
		const r = inspectBranchLengths('(x:-0.5,y:0.2,z:-0.01);');
		expect(r.negative).toBe(2);
		expect(r.total).toBe(3);
		expect(r.min).toBe(-0.5);
		expect(r.negativeFraction).toBeCloseTo(2 / 3, 10);
		expect(r.reasons.join(' ')).toMatch(/negative/);
	});

	it('flags the NJ saturation sentinel, which is not a distance', () => {
		// NJ.bf:99 returns 1000 for a saturated pair; the three-taxon closed form at NJ.bf:214-220
		// turns that into roughly -499.9.
		const r = inspectBranchLengths(`(a:${NJ_SATURATION_SENTINEL},b:0.2);`);
		expect(r.saturated).toBe(1);
		expect(r.ok).toBe(false);
		expect(r.reasons.join(' ')).toMatch(/saturation sentinel/);

		const derived = inspectBranchLengths('(a:-499.9,b:0.2);');
		expect(derived.negative).toBe(1);
		expect(derived.ok).toBe(false);
	});

	it('does not modify the tree it inspects', () => {
		// The module reports; it must never silently rewrite branch lengths, because those are the
		// input a consumer's distances are built from.
		const t = '(x:-0.5,y:0.2);';
		inspectBranchLengths(t);
		expect(t).toBe('(x:-0.5,y:0.2);');
	});
});

describe('hasCrashingBranchLength', () => {
	// Measured against the real inference path: log((3 + 1.0) / (d + 0.1)) is a math domain error
	// for d <= -0.1. -0.010 survives; -0.11, -0.5 and -499.9 all crash.
	it('matches the measured crash threshold', () => {
		expect(hasCrashingBranchLength('(a:-0.010,b:0.2);')).toBe(false);
		expect(hasCrashingBranchLength('(a:-0.11,b:0.2);')).toBe(true);
		expect(hasCrashingBranchLength('(a:-0.5,b:0.2);')).toBe(true);
		expect(hasCrashingBranchLength('(a:-499.9,b:0.2);')).toBe(true);
	});

	it('is false for clean and topology-only trees', () => {
		expect(hasCrashingBranchLength('((a:0.1,b:0.2):0.05,c:0.3);')).toBe(false);
		expect(hasCrashingBranchLength('((a,b),c);')).toBe(false);
	});

	it('honours a different epsilon', () => {
		expect(hasCrashingBranchLength('(a:-0.3,b:0.2);', 0.5)).toBe(false);
		expect(hasCrashingBranchLength('(a:-0.6,b:0.2);', 0.5)).toBe(true);
	});

	it('is documented as necessary but NOT sufficient', () => {
		// The consumer's threshold is on PATRISTIC distances — path sums — which can be more
		// negative than any single branch. Two small negatives on one path sum past the threshold
		// while no individual branch does. This test pins that limitation so nobody reads a false
		// return as a safety guarantee.
		const t = '((a:-0.06,b:-0.06):0.01,c:0.3);';
		expect(hasCrashingBranchLength(t)).toBe(false); // no single branch reaches -0.1
		const sum = branchLengths(t)
			.filter((v) => v < 0)
			.reduce((s, v) => s + v, 0);
		expect(sum).toBeLessThan(-0.1); // but the path they share does
	});
});
