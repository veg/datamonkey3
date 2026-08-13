/**
 * Tests for page refresh handling of WASM analyses
 *
 * When a user refreshes the page during a WASM analysis:
 * 1. The WASM worker is terminated
 * 2. The analysis status should be marked as 'interrupted'
 * 3. Users can re-run interrupted analyses
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock browser environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock IndexedDB storage
vi.mock('../lib/utils/indexedDBStorage', () => ({
	analysisStorage: {
		getAllAnalyses: vi.fn(),
		saveAnalysis: vi.fn(),
		getAnalysis: vi.fn(),
		deleteAnalysis: vi.fn(),
		clearAllAnalyses: vi.fn()
	}
}));

// Import after mocking
import { analysisStore } from '../stores/analyses';
import { analysisStorage } from '../lib/utils/indexedDBStorage';

describe('Page Refresh Handling', () => {
	beforeEach(() => {
		// Reset store state
		analysisStore.update(() => ({
			analyses: [],
			currentAnalysisId: null,
			isLoading: false,
			error: null,
			activeAnalyses: []
		}));

		// Reset mocks
		vi.clearAllMocks();
	});

	describe('cleanupInterruptedAnalyses', () => {
		it('should mark running WASM analyses as interrupted', async () => {
			// Setup: WASM analysis that was running when page refreshed
			const runningWasmAnalysis = {
				id: 'wasm-analysis-1',
				fileId: 'file-1',
				method: 'FEL',
				status: 'running',
				metadata: { executionMode: 'wasm' },
				createdAt: Date.now() - 60000
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([runningWasmAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			// Execute cleanup
			await analysisStore.cleanupInterruptedAnalyses();

			// Verify analysis was saved with interrupted status
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'wasm-analysis-1',
					status: 'interrupted',
					// Reworded with the heartbeat gate: a reaped record is no longer necessarily a
					// refresh — it may be a tab that was closed. See multi-tab-liveness.test.js.
					error: 'This run stopped when its browser tab closed or reloaded.'
				})
			);

			// Verify store state was updated
			const state = get(analysisStore);
			expect(state.analyses[0].status).toBe('interrupted');
			expect(state.activeAnalyses).toEqual([]);
		});

		it('should mark pending WASM analyses as interrupted', async () => {
			const pendingWasmAnalysis = {
				id: 'wasm-analysis-2',
				fileId: 'file-1',
				method: 'SLAC',
				status: 'pending',
				metadata: { executionMode: 'wasm' },
				createdAt: Date.now() - 30000
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([pendingWasmAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'interrupted'
				})
			);
		});

		it('should mark initializing/processing/saving WASM analyses as interrupted', async () => {
			const initializingAnalysis = {
				id: 'wasm-1',
				status: 'initializing',
				metadata: { executionMode: 'wasm' }
			};
			const processingAnalysis = {
				id: 'wasm-2',
				status: 'processing',
				metadata: { executionMode: 'wasm' }
			};
			const savingAnalysis = {
				id: 'wasm-3',
				status: 'saving',
				metadata: { executionMode: 'wasm' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([
				initializingAnalysis,
				processingAnalysis,
				savingAnalysis
			]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			await analysisStore.cleanupInterruptedAnalyses();

			// All three should be saved as interrupted
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledTimes(3);
		});

		it('should NOT mark backend analyses as interrupted', async () => {
			const backendAnalysis = {
				id: 'backend-analysis-1',
				fileId: 'file-1',
				method: 'FEL',
				status: 'running',
				metadata: { executionMode: 'backend' },
				createdAt: Date.now() - 60000
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([backendAnalysis]);

			await analysisStore.cleanupInterruptedAnalyses();

			// Should NOT call saveAnalysis because backend analyses shouldn't be interrupted
			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should NOT mark already completed analyses as interrupted', async () => {
			const completedAnalysis = {
				id: 'completed-analysis-1',
				status: 'completed',
				metadata: { executionMode: 'wasm' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([completedAnalysis]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should NOT mark error analyses as interrupted', async () => {
			const errorAnalysis = {
				id: 'error-analysis-1',
				status: 'error',
				metadata: { executionMode: 'wasm' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([errorAnalysis]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should NOT mark cancelled analyses as interrupted', async () => {
			const cancelledAnalysis = {
				id: 'cancelled-analysis-1',
				status: 'cancelled',
				metadata: { executionMode: 'wasm' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([cancelledAnalysis]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should clear activeAnalyses on cleanup when there are interrupted analyses', async () => {
			// Setup initial state with active analyses
			analysisStore.update((state) => ({
				...state,
				activeAnalyses: [
					{ id: 'active-1', status: 'running' },
					{ id: 'active-2', status: 'running' }
				]
			}));

			// Need at least one interrupted analysis for the store to be updated
			const runningWasmAnalysis = {
				id: 'wasm-1',
				status: 'running',
				metadata: { executionMode: 'wasm' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([runningWasmAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			await analysisStore.cleanupInterruptedAnalyses();

			const state = get(analysisStore);
			expect(state.activeAnalyses).toEqual([]);
		});

		it('should add interruptedAt timestamp when marking as interrupted', async () => {
			const runningAnalysis = {
				id: 'wasm-1',
				status: 'running',
				metadata: { executionMode: 'wasm' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([runningAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					interruptedAt: expect.any(Number)
				})
			);
		});

		it('should handle mixed WASM and backend analyses correctly', async () => {
			const wasmRunning = {
				id: 'wasm-1',
				status: 'running',
				metadata: { executionMode: 'wasm' }
			};
			const backendRunning = {
				id: 'backend-1',
				status: 'running',
				metadata: { executionMode: 'backend' }
			};
			const wasmCompleted = {
				id: 'wasm-2',
				status: 'completed',
				metadata: { executionMode: 'wasm' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([
				wasmRunning,
				backendRunning,
				wasmCompleted
			]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			await analysisStore.cleanupInterruptedAnalyses();

			// Only the running WASM analysis should be saved
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledTimes(1);
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'wasm-1',
					status: 'interrupted'
				})
			);
		});

		it('should handle empty analyses list gracefully', async () => {
			analysisStorage.getAllAnalyses.mockResolvedValue([]);

			await analysisStore.cleanupInterruptedAnalyses();

			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should handle analyses without metadata gracefully', async () => {
			const analysisWithoutMetadata = {
				id: 'no-metadata-1',
				status: 'running'
				// No metadata field
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([analysisWithoutMetadata]);

			await analysisStore.cleanupInterruptedAnalyses();

			// Should not throw and should not save (no metadata means we can't tell if it's WASM)
			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});
	});
});
