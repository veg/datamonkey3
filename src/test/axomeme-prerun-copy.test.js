/**
 * AxoMEME's pre-run copy, mounted.
 *
 * TRAP THIS FILE AVOIDS: asserting body text like /percentile/ or /rank sites/. Unfixed main already
 * renders "percentile and zscore rank sites within this alignment…" in the option description, so
 * such an assertion passes with the fix reverted and proves nothing. What is new is a line that
 * states the CONSEQUENCE of the mode currently selected — so the assertions are on its testid, and
 * on the sentence CHANGING when the mode changes.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import MethodSelector from '../lib/MethodSelector.svelte';
import { fileMetricsStore } from '../stores/fileInfo.js';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('../lib/utils/indexedDBStorage.js', () => ({
	fileStorage: {
		getAllFiles: vi.fn().mockResolvedValue([]),
		getFile: vi.fn().mockResolvedValue(null),
		saveFile: vi.fn().mockResolvedValue(true),
		deleteFile: vi.fn().mockResolvedValue(true)
	},
	analysisStorage: {
		getAllAnalyses: vi.fn().mockResolvedValue([]),
		saveAnalysis: vi.fn().mockResolvedValue(true),
		getAnalysis: vi.fn().mockResolvedValue(null),
		deleteAnalysis: vi.fn().mockResolvedValue(true),
		getAnalysesByFileId: vi.fn().mockResolvedValue([]),
		clearAllAnalyses: vi.fn().mockResolvedValue(true)
	}
}));

// The AxoMEME entry from +page.svelte's methodConfig, verbatim in the fields this component reads.
const methodConfig = {
	AxoMEME: {
		command: null,
		outputSuffix: null,
		url: 'axomeme',
		args: [],
		runner: 'axomeme',
		noGeneticCode: true,
		description:
			'Predicts what MEME would report for each site, in seconds rather than hours. A neural surrogate, not a substitute for the full analysis.'
	}
};

/** The 'How to rank sites' control, identified by what it offers rather than by DOM position. */
function callModeSelect() {
	return [...document.querySelectorAll('select')].find((s) =>
		[...s.options].some((o) => o.value === 'pvalue')
	);
}

describe('AxoMEME pre-run copy', () => {
	afterEach(() => {
		cleanup();
		fileMetricsStore.set(null);
	});

	it('says a fixed share is always called, and changes when the mode does', async () => {
		fileMetricsStore.set({ FILE_INFO: { sequences: 12, sites: 187 } });
		render(MethodSelector, { props: { methodConfig, runMethod: vi.fn() } });
		await fireEvent.change(screen.getByTestId('method-dropdown'), {
			target: { value: 'AxoMEME' }
		});
		await tick();
		await tick();

		const line = screen.getByTestId('axomeme-call-consequence');
		expect(line.textContent).toMatch(/top 2%/i);
		// The sentence that was missing: percentile mode calls a share of the alignment regardless of
		// whether anything in it is under selection.
		expect(line.textContent).toMatch(/whether or not/i);
		expect(line.textContent).toMatch(/variable sites/i);

		// THE ASSERTION THAT CANNOT PASS BY ACCIDENT: switching the mode rewrites the consequence.
		const select = callModeSelect();
		expect(select, 'call-mode select not found').toBeTruthy();
		await fireEvent.change(select, { target: { value: 'pvalue' } });
		await tick();
		await tick();

		const after = screen.getByTestId('axomeme-call-consequence').textContent;
		expect(after).toMatch(/usually reports nothing/i);
		expect(after).toContain('4.45');
		expect(after).not.toMatch(/top 2%/i);
	}, 30000);
});
