/**
 * Execution mode: what the panel actually defaults to, mounted.
 *
 * executionAdvice() is unit-tested next door; this file exists because the bug was never in the
 * arithmetic. The app has always computed "~2h 15m in this browser" and printed it one row below a
 * Local radio it had already selected. What has to be asserted is the RADIO — `.checked` on the
 * inputs — not any sentence the unfixed page also renders.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analysisConfig } from '../stores/analysisConfig.js';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import MethodSelector from '../lib/MethodSelector.svelte';
import { backendConnectivity } from '../stores/backendConnectivity.js';
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

// The two entries this file needs, copied from +page.svelte's methodConfig. BGM is the slow one
// (~2h 15m locally at 20x255); FEL is the fast one.
const methodConfig = {
	BGM: {
		command: 'bgm',
		outputSuffix: 'BGM.json',
		url: 'bgm',
		args: [],
		description: 'A method for detecting coevolving sites.'
	},
	FEL: {
		command: 'fel',
		outputSuffix: 'FEL.json',
		url: 'fel',
		args: [],
		description: 'A method for detecting pervasive selection.'
	}
};

const SEQS = 20;
const SITES = 255;

async function mountWith({ connected, method }) {
	backendConnectivity.set({
		isConnected: connected,
		isConnecting: false,
		serverUrl: 'http://localhost:7015',
		lastChecked: null,
		error: null
	});
	fileMetricsStore.set({ FILE_INFO: { sequences: SEQS, sites: SITES } });

	render(MethodSelector, { props: { methodConfig, runMethod: vi.fn() } });
	const dropdown = screen.getByTestId('method-dropdown');
	await fireEvent.change(dropdown, { target: { value: method } });
	await tick();
	await tick();
	return {
		local: document.querySelector('input[value="local"]'),
		backend: document.querySelector('input[value="backend"]')
	};
}

describe('execution mode default', () => {
	// analysisConfig is a module singleton that deliberately survives tab switches (that is the whole
	// point of item 3.4). It therefore also survives between tests in this file: the hours-long-run
	// case above selects the server, and without this reset the fast-method case inherits it and sees
	// backend pre-selected. Production behaviour is correct; only the isolation was missing, and it
	// could not have been noticed before 3.4 and 2.1 were merged together.
	beforeEach(() => {
		analysisConfig.reset();
		fileMetricsStore.set(null);
	});

	afterEach(() => {
		cleanup();
		fileMetricsStore.set(null);
		backendConnectivity.set({
			isConnected: false,
			isConnecting: false,
			serverUrl: 'http://localhost:7015',
			lastChecked: null,
			error: null
		});
	});

	it('pre-selects the server for an hours-long local run, and yields to a click', async () => {
		const { local, backend } = await mountWith({ connected: true, method: 'BGM' });

		// THE ASSERTION. On unfixed main this is local:true / backend:false with "~2h 15m" printed
		// directly underneath.
		expect(backend.checked).toBe(true);
		expect(local.checked).toBe(false);
		expect(backend.disabled).toBe(false);

		const advice = screen.getByTestId('execution-mode-advice').textContent;
		expect(advice).toContain('in this browser');
		expect(advice).toContain('on the server');
		// It says so rather than moving the radio silently.
		expect(advice).toMatch(/server is selected/i);

		// A click is a decision and outranks a fitted curve. Without the touched flag the reactive
		// statement immediately puts it back on backend.
		await fireEvent.click(local);
		await tick();
		await tick();
		expect(local.checked).toBe(true);
		expect(backend.checked).toBe(false);
		// And the copy stops claiming a selection that is no longer true.
		expect(screen.getByTestId('execution-mode-advice').textContent).not.toMatch(
			/server is selected/i
		);
	}, 30000);

	it('leaves a fast method alone, and still states what each mode costs', async () => {
		const { local, backend } = await mountWith({ connected: true, method: 'FEL' });

		expect(local.checked).toBe(true);
		expect(backend.checked).toBe(false);
		// No nagging on a run that finishes in under a minute either way.
		expect(screen.queryAllByTestId('execution-mode-advice')).toHaveLength(0);

		// But the sub-labels are not silent. They used to read "Fast • Small datasets" and "Powerful •
		// Large datasets" — a claim about the dataset made without looking at it, on a panel that had
		// the estimate in hand. Now each names its own duration and what it costs the user.
		const localLabel = local.closest('.execution-mode-option').textContent;
		const backendLabel = backend.closest('.execution-mode-option').textContent;
		expect(localLabel).toMatch(/in this tab/);
		expect(backendLabel).toMatch(/on the server/);
		expect(localLabel).not.toMatch(/Small datasets/);
		expect(backendLabel).not.toMatch(/Large datasets/);
	}, 30000);

	it('states the cost instead of recommending a server that is down', async () => {
		const { local, backend } = await mountWith({ connected: false, method: 'BGM' });

		expect(local.checked).toBe(true);
		expect(backend.disabled).toBe(true);

		const advice = screen.getByTestId('execution-mode-advice');
		expect(advice.textContent).toMatch(/tab must stay open/);
		// The disconnected sentence is a second line of the existing warning, not a competing box.
		expect(advice.closest('.backend-status-warning')).not.toBeNull();
		expect(advice.textContent).not.toMatch(/on the server/);
	}, 30000);
});
