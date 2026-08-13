/**
 * analysisConfig.restoreFrom — what "Re-run" is allowed to bring back.
 *
 * The dangerous part of this feature is not losing settings, it is restoring the WRONG ones. A
 * backend run persists its parameters in the SERVER's shape (gencodeid, 'ds-variation', 'branch-set')
 * and keeps the UI's own config alongside under `originalConfig`. Feeding the former into the option
 * bag would inject controls the UI never had and silently change what the next run submits — a
 * scientific result computed with parameters the user never chose.
 *
 * So these tests are mostly about what must NOT come back.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { analysisConfig, describeRestoredSettings } from '../stores/analysisConfig.js';

const METHOD_KEYS = ['FEL', 'MEME', 'AxoMEME', 'GARD'];

/** A backend FEL record: server-shaped `parameters`, UI-shaped `originalConfig`. */
const backendFelRecord = {
	id: 'analysis-fel-1',
	method: 'FEL',
	metadata: {
		arguments: {
			parameters: { gencodeid: 0, 'ds-variation': 2, pvalue: 0.1 },
			originalConfig: {
				method: 'FEL',
				geneticCode: 'Universal',
				geneticCodeId: 0,
				executionMode: 'backend',
				branchesToTest: 'Internal',
				pValueThreshold: 0.05
			}
		}
	}
};

describe('analysisConfig.restoreFrom', () => {
	beforeEach(() => {
		analysisConfig.reset();
	});

	it('prefers the UI config over the backend-shaped parameters', () => {
		analysisConfig.restoreFrom(backendFelRecord, METHOD_KEYS);
		const state = get(analysisConfig);

		expect(state.selectedMethod).toBe('FEL');
		expect(state.methodOptions.FEL.branchesToTest).toBe('Internal');
		expect(state.methodOptions.FEL.pValueThreshold).toBe(0.05);

		// The backend's own vocabulary must never reach the UI's option bag.
		expect(Object.keys(state.methodOptions.FEL)).not.toContain('gencodeid');
		expect(Object.keys(state.methodOptions.FEL)).not.toContain('ds-variation');
	});

	it('lifts the shared settings to the top level rather than into the option bag', () => {
		analysisConfig.restoreFrom(backendFelRecord, METHOD_KEYS);
		const state = get(analysisConfig);

		expect(state.geneticCode).toBe('Universal');
		expect(state.executionMode).toBe('backend');
		expect(Object.keys(state.methodOptions.FEL)).not.toContain('geneticCode');
		expect(Object.keys(state.methodOptions.FEL)).not.toContain('executionMode');
		expect(Object.keys(state.methodOptions.FEL)).not.toContain('method');
	});

	it('drops an option the method no longer has', () => {
		// A release that removes a control must not have it resurrected by an old record.
		analysisConfig.restoreFrom(
			{
				id: 'analysis-fel-2',
				method: 'FEL',
				metadata: {
					arguments: {
						originalConfig: { branchesToTest: 'All', thisOptionWasRemovedInV4: 'boom' }
					}
				}
			},
			METHOD_KEYS
		);

		const opts = get(analysisConfig).methodOptions.FEL;
		expect(opts.branchesToTest).toBe('All');
		expect(Object.keys(opts)).not.toContain('thisOptionWasRemovedInV4');
	});

	it('degrades to method-only for a record with no arguments, and says so', () => {
		// AxomemeAnalysisRunner calls startAnalysisTracking with four arguments, so `args` is null and
		// its records carry no metadata.arguments at all. Claiming settings were restored would be a
		// lie the user cannot check.
		const result = analysisConfig.restoreFrom(
			{ id: 'analysis-axo-1', method: 'AXOMEME', metadata: {} },
			METHOD_KEYS
		);

		expect(result.restoredSettings).toBe(false);
		expect(get(analysisConfig).selectedMethod).toBe('AxoMEME');
		expect(get(analysisConfig).methodOptions.AxoMEME).toBeUndefined();
	});

	it('matches the stored upper-cased method back to the dropdown’s own casing', () => {
		// Records are written with method.toUpperCase(); the <select> values are 'AxoMEME', 'aBSREL'.
		// Without this the option never matches and the dropdown shows its placeholder.
		analysisConfig.restoreFrom({ id: 'a', method: 'AXOMEME' }, METHOD_KEYS);
		expect(get(analysisConfig).selectedMethod).toBe('AxoMEME');
	});

	it('restores a wasm record, whose parameters ARE the UI config', () => {
		// WasmAnalysisRunner persists `parameters: config` with no originalConfig, so the fallback
		// side of the precedence has to work too.
		analysisConfig.restoreFrom(
			{
				id: 'analysis-meme-1',
				method: 'MEME',
				metadata: {
					arguments: { parameters: { geneticCode: 'Universal', rates: 3, pvalue: 0.05 } }
				}
			},
			METHOD_KEYS
		);

		const state = get(analysisConfig);
		expect(state.methodOptions.MEME.rates).toBe(3);
		expect(state.methodOptions.MEME.pvalue).toBe(0.05);
	});

	it('keeps other methods’ option bags untouched', () => {
		analysisConfig.update((s) => ({
			...s,
			methodOptions: { MEME: { rates: 4 } }
		}));
		analysisConfig.restoreFrom(backendFelRecord, METHOD_KEYS);

		expect(get(analysisConfig).methodOptions.MEME.rates).toBe(4);
	});
});

describe('describeRestoredSettings', () => {
	it('names what actually came back', () => {
		analysisConfig.reset();
		analysisConfig.restoreFrom(backendFelRecord, METHOD_KEYS);
		const text = get(analysisConfig).restoredSummary;

		expect(text).toContain('genetic code Universal');
		expect(text).toMatch(/internal/i);
	});

	it('says nothing at all when nothing was restored', () => {
		// THE TRAP: a summary built from store state would read the DEFAULT genetic code back out and
		// tell an AxoMEME re-run that its settings had been restored. They were not; the record has no
		// arguments to restore.
		analysisConfig.reset();
		analysisConfig.restoreFrom({ id: 'a', method: 'AXOMEME' }, METHOD_KEYS);
		expect(get(analysisConfig).restoredSummary).toBe('');
		expect(describeRestoredSettings('AxoMEME', { geneticCode: null, options: {} })).toBe('');
	});
});
