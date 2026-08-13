/**
 * A second browser tab must not kill the first tab's running analysis.
 *
 * IndexedDB is shared across tabs of the origin; `activeAnalyses` is not. A local run's persisted
 * record sits at 'pending'/'wasm' for its entire duration (progress updates are in-memory only), so
 * the interrupted-sweep that every tab runs at onMount used to reap live work belonging to another
 * tab — discarding hours of compute and offering a Re-run that would duplicate it.
 *
 * The fix is a heartbeat: the owning tab stamps `lastHeartbeatAt` while it is running, and the sweep
 * only reaps records whose pulse has stopped. These tests pin both halves — that a live run survives,
 * and that a genuinely dead one is still cleaned up.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('../lib/utils/indexedDBStorage', () => ({
	analysisStorage: {
		getAllAnalyses: vi.fn(),
		saveAnalysis: vi.fn(),
		getAnalysis: vi.fn(),
		deleteAnalysis: vi.fn(),
		clearAllAnalyses: vi.fn()
	}
}));

import { analysisStore } from '../stores/analyses';
import { analysisStorage } from '../lib/utils/indexedDBStorage';

const resetStore = () =>
	analysisStore.update(() => ({
		analyses: [],
		currentAnalysisId: null,
		isLoading: false,
		error: null,
		activeAnalyses: []
	}));

const wasmRun = (overrides = {}) => ({
	id: 'wasm-run-1',
	fileId: 'file-1',
	method: 'FEL',
	status: 'running',
	metadata: { executionMode: 'wasm' },
	createdAt: Date.now() - 60_000,
	...overrides
});

describe('multi-tab liveness', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetStore();
		vi.clearAllMocks();
		analysisStorage.saveAnalysis.mockResolvedValue(undefined);
	});

	afterEach(() => {
		// Drop any heartbeat interval this test started before handing the timers back.
		resetStore();
		analysisStore.removeFromActiveAnalyses('cleanup-noop');
		vi.useRealTimers();
	});

	describe("cleanupInterruptedAnalyses respects another tab's pulse", () => {
		it('leaves a run alone while its tab is still stamping it', async () => {
			// THE ACTUAL BUG. Five seconds since the last beat: that run is alive in another tab.
			analysisStorage.getAllAnalyses.mockResolvedValue([
				wasmRun({ lastHeartbeatAt: Date.now() - 5_000 })
			]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
			expect(get(analysisStore).analyses[0]?.status).not.toBe('interrupted');
		});

		it('still reaps a run whose tab stopped stamping it', async () => {
			// Not "never reap": two minutes of silence is a dead tab, and its record must be cleaned up.
			analysisStorage.getAllAnalyses.mockResolvedValue([
				wasmRun({ lastHeartbeatAt: Date.now() - 120_000 })
			]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'wasm-run-1',
					status: 'interrupted',
					error: 'This run stopped when its browser tab closed or reloaded.'
				})
			);
		});

		it('reaps a record written before heartbeats existed', async () => {
			// A record with no pulse at all is by definition from a session that is gone.
			analysisStorage.getAllAnalyses.mockResolvedValue([wasmRun()]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'wasm-run-1', status: 'interrupted' })
			);
		});

		it('never touches a server job, heartbeat or not', async () => {
			analysisStorage.getAllAnalyses.mockResolvedValue([
				wasmRun({ id: 'backend-run', metadata: { executionMode: 'backend' } })
			]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});
	});

	describe('the pulse itself', () => {
		it('stamps the record the moment the run starts, not ten seconds later', async () => {
			// Without this, a tab opened inside the first interval still reaps a brand new run.
			analysisStorage.getAnalysis.mockResolvedValue({
				id: 'wasm-run-1',
				status: 'pending',
				metadata: {}
			});

			await analysisStore.startAnalysisProgress('wasm-run-1', 'Starting…', 'FEL', {
				executionMode: 'wasm'
			});

			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({ lastHeartbeatAt: expect.any(Number) })
			);
		});

		it('keeps stamping a newer time while the run is active, and stops when it finishes', async () => {
			analysisStorage.getAnalysis.mockResolvedValue({
				id: 'wasm-run-1',
				status: 'running',
				metadata: { executionMode: 'wasm' }
			});

			await analysisStore.startAnalysisProgress('wasm-run-1', 'Starting…', 'FEL', {
				executionMode: 'wasm'
			});
			analysisStorage.saveAnalysis.mockClear();

			await vi.advanceTimersByTimeAsync(25_000);

			const beats = analysisStorage.saveAnalysis.mock.calls.map((c) => c[0].lastHeartbeatAt);
			expect(beats.length).toBeGreaterThanOrEqual(2);
			for (let i = 1; i < beats.length; i++) {
				expect(beats[i]).toBeGreaterThan(beats[i - 1]);
			}

			// Once the run finishes there is nothing left to vouch for, and the timer must stop —
			// otherwise every completed run leaves an interval rewriting IndexedDB forever.
			await analysisStore.completeAnalysisProgressById('wasm-run-1', true, 'done');
			analysisStorage.saveAnalysis.mockClear();

			await vi.advanceTimersByTimeAsync(25_000);
			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('does not stamp a record that has already stopped', async () => {
			// Read-modify-write guard: a completion landing between the read and the write would
			// otherwise be written back as unfinished.
			await analysisStore.startAnalysisProgress('wasm-run-1', 'Starting…', 'FEL', {
				executionMode: 'wasm'
			});
			analysisStorage.getAnalysis.mockResolvedValue({
				id: 'wasm-run-1',
				status: 'completed',
				metadata: { executionMode: 'wasm' }
			});
			analysisStorage.saveAnalysis.mockClear();

			await vi.advanceTimersByTimeAsync(25_000);

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('does not start a pulse for a server job', async () => {
			analysisStorage.getAnalysis.mockResolvedValue({
				id: 'backend-run',
				status: 'pending',
				metadata: {}
			});

			await analysisStore.startAnalysisProgress('backend-run', 'Starting…', 'FEL', {
				executionMode: 'backend',
				jobId: 'FEL-123'
			});
			analysisStorage.saveAnalysis.mockClear();

			await vi.advanceTimersByTimeAsync(25_000);

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});
	});
});
