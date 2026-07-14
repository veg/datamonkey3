import { describe, it, expect } from 'vitest';
import { backendAnalysisRunner } from '../lib/services/BackendAnalysisRunner.js';

// Regression coverage for issue #141.
//
// The "Interactive" branch-selection mode is a UI concept (let the user label
// branches on the tree). It must be translated to the HyPHY branch label "FG"
// before it reaches the `--branches` argument. Passing "Interactive" verbatim
// makes HyPHY reject the analysis at startup:
//   Error: 'Interactive' is not a valid choice passed to
//   'Choose the set of branches to test for selection'.
//
// prepareAnalysisParameters is a pure mapping function, so it can be tested
// without a live backend socket connection.
describe('branch-selection parameter mapping (issue #141)', () => {
	// Methods that expose a single test-branch set via `branches`.
	const singleSetMethods = ['BUSTED', 'aBSREL', 'PRIME'];

	it.each(singleSetMethods)('maps Interactive to FG for %s', (method) => {
		const params = backendAnalysisRunner.prepareAnalysisParameters(method, {
			branchesToTest: 'Interactive'
		});
		expect(params.branches).toBe('FG');
	});

	it.each(singleSetMethods)('passes built-in branch sets through unchanged for %s', (method) => {
		for (const set of ['All', 'Internal', 'Leaves', 'Unlabeled branches']) {
			const params = backendAnalysisRunner.prepareAnalysisParameters(method, {
				branchesToTest: set
			});
			expect(params.branches).toBe(set);
		}
	});

	it.each(singleSetMethods)('defaults to All when no branch set is provided for %s', (method) => {
		const params = backendAnalysisRunner.prepareAnalysisParameters(method, {});
		expect(params.branches).toBe('All');
	});

	it('never emits the literal "Interactive" as a --branches value', () => {
		for (const method of singleSetMethods) {
			const params = backendAnalysisRunner.prepareAnalysisParameters(method, {
				branchesToTest: 'Interactive'
			});
			expect(params.branches).not.toBe('Interactive');
		}
	});
});
