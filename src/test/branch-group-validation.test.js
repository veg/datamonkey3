import { describe, it, expect } from 'vitest';
import {
	countBranchGroups,
	contrastFelHasEnoughGroups
} from '../lib/utils/branchGroupValidation.js';

// Coverage for issue #144: Contrast-FEL must require >= 2 branch groups before
// submission. A single group core-dumps HyPhy downstream, so the UI blocks it.

describe('countBranchGroups', () => {
	it('counts distinct non-empty group names', () => {
		expect(countBranchGroups(['Set1', 'Set2'])).toBe(2);
		expect(countBranchGroups(['Set1', 'Set2', 'Set3'])).toBe(3);
	});

	it('deduplicates repeated names', () => {
		expect(countBranchGroups(['Set1', 'Set1'])).toBe(1);
		expect(countBranchGroups(['Set1', ' Set1 '])).toBe(1); // trimmed
	});

	it('ignores empty / whitespace-only / non-string entries', () => {
		expect(countBranchGroups(['Set1', '', '   ', null, undefined, 5])).toBe(1);
		expect(countBranchGroups([])).toBe(0);
	});

	it('returns 0 for non-array input', () => {
		expect(countBranchGroups(undefined)).toBe(0);
		expect(countBranchGroups(null)).toBe(0);
		expect(countBranchGroups('Set1')).toBe(0);
	});
});

describe('contrastFelHasEnoughGroups — Interactive mode', () => {
	const interactive = (count) => ({
		branchesToTest: 'Interactive',
		selectionSetCount: count
	});

	it('blocks with zero or one tagged group', () => {
		expect(contrastFelHasEnoughGroups(interactive(0))).toBe(false);
		expect(contrastFelHasEnoughGroups(interactive(1))).toBe(false);
		// No interaction yet => selectionSetCount undefined
		expect(contrastFelHasEnoughGroups({ branchesToTest: 'Interactive' })).toBe(false);
		// Default mode is Interactive when unspecified
		expect(contrastFelHasEnoughGroups({})).toBe(false);
	});

	it('allows with two or more tagged groups', () => {
		expect(contrastFelHasEnoughGroups(interactive(2))).toBe(true);
		expect(contrastFelHasEnoughGroups(interactive(3))).toBe(true);
	});
});

describe('contrastFelHasEnoughGroups — Custom mode', () => {
	it('requires both branch-set text fields to be non-empty', () => {
		expect(
			contrastFelHasEnoughGroups({ branchesToTest: 'Custom', branchSet1: 'Source', branchSet2: 'Test' })
		).toBe(true);
		expect(
			contrastFelHasEnoughGroups({ branchesToTest: 'Custom', branchSet1: 'Source', branchSet2: '' })
		).toBe(false);
		expect(
			contrastFelHasEnoughGroups({ branchesToTest: 'Custom', branchSet1: '   ', branchSet2: 'Test' })
		).toBe(false);
		expect(contrastFelHasEnoughGroups({ branchesToTest: 'Custom' })).toBe(false);
	});
});
