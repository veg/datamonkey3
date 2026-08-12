/**
 * Parameter mapping for server-side AxoMEME.
 *
 * Verified against the running server (localhost:7015) before these were written: the payload built
 * here spawns a real job and returns results whose modelSha256 matches the browser path's
 * VERIFIED_MODEL_SHA256, so both surfaces run the same checkpoint.
 *
 * The load-bearing assertion is a NEGATIVE one — `gencodeid` must not be sent. Every other method
 * spreads it in from baseParams, and the server's validateParameters override WARNS when a genetic
 * code is supplied for axomeme, because universal is baked into the model's tokenizer. Sending it
 * would produce a warning on every run for a value that cannot be honoured, and the natural way to
 * write this case (spreading baseParams like its neighbours) reintroduces it silently.
 */
import { describe, it, expect } from 'vitest';
import { backendAnalysisRunner } from '../lib/services/BackendAnalysisRunner.js';

const prep = (config = {}) => backendAnalysisRunner.prepareAnalysisParameters('axomeme', config);

describe('AxoMEME backend parameters', () => {
	it('never sends a genetic code', () => {
		const p = prep({ geneticCodeId: 1, geneticCode: 'Vertebrate mitochondrial' });
		expect(p.gencodeid, 'the server warns on genetic_code for axomeme').toBeUndefined();
		expect(p.genetic_code).toBeUndefined();
	});

	it('identifies itself as axomeme', () => {
		expect(prep().analysis_type).toBe('axomeme');
	});

	it('defaults call_mode to percentile, matching the in-browser path', () => {
		// Not the reference driver's pvalue default: the model's predicted LRT rarely reaches the
		// fixed chi-square gates pvalue compares against, so pvalue makes the method silent.
		expect(prep().call_mode).toBe('percentile');
	});

	it('passes the chosen call mode through', () => {
		for (const mode of ['percentile', 'zscore', 'pvalue']) {
			expect(prep({ callMode: mode }).call_mode).toBe(mode);
		}
	});

	it('omits max_species unless the user set one', () => {
		// The server clamps to [2, 512] and defaults to 512. Omitting it keeps that the single source
		// of truth rather than duplicating the default on the client where it can drift.
		expect(prep()).not.toHaveProperty('max_species');
		expect(prep({ maxSpecies: 128 }).max_species).toBe(128);
	});

	it('ignores a non-numeric max_species rather than forwarding garbage', () => {
		expect(prep({ maxSpecies: 'lots' })).not.toHaveProperty('max_species');
	});

	it('omits reference_sequence unless chosen', () => {
		// Dropped to "" server-side unless it matches SAFE_SEQUENCE_NAME, which is a security control:
		// the value is interpolated into a comma-joined SLURM --export string.
		expect(prep()).not.toHaveProperty('reference_sequence');
		expect(prep({ referenceSequence: 'HIV1_B_US_1983' }).reference_sequence).toBe('HIV1_B_US_1983');
	});

	it('sends no branch selection or p-value', () => {
		// AxoMEME honours neither; the descriptor has no field for either.
		const p = prep({ branchesToTest: 'Internal', pValueThreshold: 0.05 });
		expect(p.branches).toBeUndefined();
		expect(p.pvalue).toBeUndefined();
	});
});
