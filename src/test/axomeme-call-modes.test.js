/**
 * describeCallMode() — the pre-run sentence that says what AxoMEME's calling mode will do.
 *
 * The tests that matter here are the DERIVATION ones. Copy that hard-codes "top 2%" is true until
 * someone retunes tier1Percentile, at which point the pre-run promise and the results table disagree
 * and nothing fails. Every number in the sentence has to come out of the config it is describing.
 */

import { describe, it, expect } from 'vitest';
import { describeCallMode, CALL_DEFAULTS } from '../lib/services/axomeme/callModes.js';

describe('describeCallMode', () => {
	it('states the fixed share percentile mode always calls', () => {
		const text = describeCallMode('percentile');
		// The band it flags as Tier 1...
		expect(text).toContain('top 2%');
		// ...and the CUMULATIVE label the results table will print for Tier 2 (postprocess.js labels
		// the 95th-98th band 'Top 5%'). Pre-run copy naming only the exclusive 3% would read as a
		// contradiction of the results page.
		expect(text).toContain('Top 5%');
		expect(text).toContain('next 3%');
		// VARIABLE sites, not sites: percentiles are computed over variable sites only, and on the
		// conserved alignments this line exists for that is a small fraction of the gene.
		expect(text).toMatch(/variable sites/i);
		// The thing that was missing before: a share is called whether or not anything is selected.
		expect(text).toMatch(/whether or not any site is under selection/i);
	});

	it('derives every percentage from the gates rather than hard-coding them', () => {
		const text = describeCallMode('percentile', {
			...CALL_DEFAULTS,
			tier1Percentile: 99,
			tier2Percentile: 90
		});
		expect(text).toContain('top 1%');
		expect(text).toContain('next 9%');
		expect(text).toContain('Top 10%');
		expect(text).not.toContain('2%');
		expect(text).not.toContain('5%');
	});

	it('names the z-score gates it is describing', () => {
		expect(describeCallMode('zscore')).toContain(`Z ≥ ${CALL_DEFAULTS.tier1Zscore}`);
		// Distinct values, so neither number can pass by being a substring of the other.
		const text = describeCallMode('zscore', {
			...CALL_DEFAULTS,
			tier1Zscore: 3.75,
			tier2Zscore: 1.25
		});
		expect(text).toContain('Z ≥ 3.75');
		expect(text).toContain('Z ≥ 1.25');
		expect(text).toMatch(/relative to this alignment/i);
	});

	it('warns that pvalue mode usually reports nothing', () => {
		const text = describeCallMode('pvalue');
		expect(text).toContain(String(CALL_DEFAULTS.tier1LrtGate)); // 4.45
		expect(text).toContain(String(CALL_DEFAULTS.tier2LrtGate)); // 3.12
		expect(text).toMatch(/usually reports nothing/i);
		// It is a fixed gate, not a rank — that distinction is the whole reason pvalue is not default.
		expect(text).toMatch(/rather than ranks/i);
	});

	it('falls back to the mode a missing value actually runs as', () => {
		// METHOD_ADVANCED_OPTIONS.axomeme.callMode.default is CALL_DEFAULTS.mode, so an undefined or
		// unrecognised mode runs as percentile. The sentence has to describe THAT, not shrug.
		expect(CALL_DEFAULTS.mode).toBe('percentile');
		const fallback = describeCallMode('percentile');
		expect(describeCallMode(undefined)).toBe(fallback);
		expect(describeCallMode('nonsense')).toBe(fallback);
	});

	it('keeps one definition of the gates after the move out of postprocess.js', () => {
		// postprocess.js re-exports rather than re-declares. A fork here would let the results table
		// and the pre-run copy disagree about the same run.
		return Promise.all([
			import('../lib/services/axomeme/postprocess.js'),
			import('../lib/services/axomeme/callModes.js')
		]).then(([postprocess, callModes]) => {
			expect(postprocess.CALL_DEFAULTS).toBe(callModes.CALL_DEFAULTS);
		});
	});
});
