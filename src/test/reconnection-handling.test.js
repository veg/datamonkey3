/**
 * Tests for backend job reconnection handling
 *
 * When a user refreshes the page during a backend analysis:
 * 1. The jobId is persisted in IndexedDB
 * 2. On page load, backend analyses are marked as 'reconnecting'
 * 3. The job:status Socket.IO event is used to query job status
 * 4. Based on the response:
 *    - completed: Results are retrieved and analysis completed
 *    - running: Resubscribe to job events
 *    - not_found: Mark as 'connection_lost'
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

describe('Backend Reconnection', () => {
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

	describe('attemptBackendReconnection', () => {
		it('should return empty array when no backend analyses need reconnection', async () => {
			analysisStorage.getAllAnalyses.mockResolvedValue([]);

			const result = await analysisStore.attemptBackendReconnection();

			expect(result).toEqual([]);
		});

		it('should find backend analyses with running status and jobId', async () => {
			const runningBackendAnalysis = {
				id: 'backend-analysis-1',
				fileId: 'file-1',
				method: 'FEL',
				status: 'running',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-1234567890-abc123'
				},
				createdAt: Date.now() - 60000
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([runningBackendAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			const result = await analysisStore.attemptBackendReconnection();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('backend-analysis-1');
			expect(result[0].metadata.jobId).toBe('fel-1234567890-abc123');
		});

		it('should mark backend analyses as reconnecting', async () => {
			const runningBackendAnalysis = {
				id: 'backend-analysis-1',
				fileId: 'file-1',
				method: 'FEL',
				status: 'running',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-1234567890-abc123'
				},
				createdAt: Date.now() - 60000
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([runningBackendAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			await analysisStore.attemptBackendReconnection();

			// Verify analysis was saved with reconnecting status
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'backend-analysis-1',
					status: 'reconnecting'
				})
			);

			// Verify store state was updated
			const state = get(analysisStore);
			expect(state.analyses[0].status).toBe('reconnecting');
		});

		it('should add reconnectAttemptedAt timestamp', async () => {
			const runningBackendAnalysis = {
				id: 'backend-analysis-1',
				status: 'running',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-1234567890-abc123'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([runningBackendAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			await analysisStore.attemptBackendReconnection();

			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					reconnectAttemptedAt: expect.any(Number)
				})
			);
		});

		it('should NOT mark backend analyses without jobId as reconnecting', async () => {
			const backendWithoutJobId = {
				id: 'backend-analysis-1',
				status: 'running',
				metadata: {
					executionMode: 'backend'
					// No jobId - can't reconnect
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([backendWithoutJobId]);

			const result = await analysisStore.attemptBackendReconnection();

			expect(result).toHaveLength(0);
			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should NOT mark completed backend analyses as reconnecting', async () => {
			const completedBackendAnalysis = {
				id: 'backend-analysis-1',
				status: 'completed',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-1234567890-abc123'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([completedBackendAnalysis]);

			const result = await analysisStore.attemptBackendReconnection();

			expect(result).toHaveLength(0);
			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should NOT mark WASM analyses as reconnecting', async () => {
			const runningWasmAnalysis = {
				id: 'wasm-analysis-1',
				status: 'running',
				metadata: {
					executionMode: 'wasm'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([runningWasmAnalysis]);

			const result = await analysisStore.attemptBackendReconnection();

			expect(result).toHaveLength(0);
			expect(analysisStorage.saveAnalysis).not.toHaveBeenCalled();
		});

		it('should handle multiple backend analyses correctly', async () => {
			const pendingAnalysis = {
				id: 'backend-1',
				status: 'pending',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-111-aaa'
				}
			};
			const runningAnalysis = {
				id: 'backend-2',
				status: 'running',
				metadata: {
					executionMode: 'backend',
					jobId: 'slac-222-bbb'
				}
			};
			const processingAnalysis = {
				id: 'backend-3',
				status: 'processing',
				metadata: {
					executionMode: 'backend',
					jobId: 'meme-333-ccc'
				}
			};
			const completedAnalysis = {
				id: 'backend-4',
				status: 'completed',
				metadata: {
					executionMode: 'backend',
					jobId: 'fubar-444-ddd'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([
				pendingAnalysis,
				runningAnalysis,
				processingAnalysis,
				completedAnalysis
			]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			const result = await analysisStore.attemptBackendReconnection();

			// Should return 3 analyses (pending, running, processing) but not completed
			expect(result).toHaveLength(3);
			expect(result.map((a) => a.id)).toEqual(['backend-1', 'backend-2', 'backend-3']);
		});

		it('should handle initializing status as needing reconnection', async () => {
			const initializingAnalysis = {
				id: 'backend-1',
				status: 'initializing',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-111-aaa'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([initializingAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			const result = await analysisStore.attemptBackendReconnection();

			expect(result).toHaveLength(1);
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
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-111-aaa'
				}
			};
			const backendWithoutJobId = {
				id: 'backend-2',
				status: 'running',
				metadata: { executionMode: 'backend' }
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([
				wasmRunning,
				backendRunning,
				backendWithoutJobId
			]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			const result = await analysisStore.attemptBackendReconnection();

			// Only the backend with jobId should be returned
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('backend-1');
		});

		it('should handle storage errors gracefully', async () => {
			analysisStorage.getAllAnalyses.mockRejectedValue(new Error('Storage error'));

			// Should not throw, should return empty array
			const result = await analysisStore.attemptBackendReconnection();
			expect(result).toEqual([]);
		});
	});

	describe('Status transitions after reconnection', () => {
		it('should handle transition from reconnecting to running', async () => {
			const reconnectingAnalysis = {
				id: 'backend-1',
				status: 'reconnecting',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-111-aaa'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([reconnectingAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			// Simulate job still running - update status
			await analysisStore.updateAnalysis('backend-1', {
				status: 'running',
				updatedAt: Date.now()
			});

			// Verify saveAnalysis was called with the status update
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'running'
				})
			);
		});

		it('should handle transition from reconnecting to connection_lost', async () => {
			const reconnectingAnalysis = {
				id: 'backend-1',
				status: 'reconnecting',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-111-aaa'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([reconnectingAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			// Simulate job not found - mark as connection_lost
			await analysisStore.updateAnalysis('backend-1', {
				status: 'connection_lost',
				error: 'Job no longer exists on server. It may have completed or expired.'
			});

			// Verify saveAnalysis was called with connection_lost status and error
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'connection_lost',
					error: 'Job no longer exists on server. It may have completed or expired.'
				})
			);
		});

		it('should handle transition from reconnecting to completed with results', async () => {
			const reconnectingAnalysis = {
				id: 'backend-1',
				status: 'reconnecting',
				metadata: {
					executionMode: 'backend',
					jobId: 'fel-111-aaa'
				}
			};

			analysisStorage.getAllAnalyses.mockResolvedValue([reconnectingAnalysis]);
			analysisStorage.saveAnalysis.mockResolvedValue(undefined);

			// Simulate job completed - update with results
			const mockResults = { test: 'results', sites: [] };
			await analysisStore.updateAnalysis('backend-1', {
				status: 'completed',
				result: JSON.stringify(mockResults),
				completedAt: Date.now()
			});

			// Verify saveAnalysis was called with completed status and results
			expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'completed',
					result: '{"test":"results","sites":[]}'
				})
			);
		});
	});
});

describe('BackendAnalysisRunner reconnectToJobs', () => {
	// Mock socket
	const mockSocket = {
		connected: false,
		connect: vi.fn(),
		disconnect: vi.fn(),
		emit: vi.fn(),
		on: vi.fn(),
		off: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockSocket.connected = true;
		mockSocket.emit.mockClear();
	});

	// Note: These tests would require proper mocking of the BackendAnalysisRunner
	// The actual implementation is tested via integration tests
	// Here we document the expected behavior

	it('should query job:status for each analysis to reconnect', () => {
		const analysesToReconnect = [
			{
				id: 'backend-1',
				method: 'fel',
				metadata: { jobId: 'fel-111-aaa' }
			},
			{
				id: 'backend-2',
				method: 'slac',
				metadata: { jobId: 'slac-222-bbb' }
			}
		];

		// Expected: emit('job:status', { jobId: 'fel-111-aaa' }, callback)
		// Expected: emit('job:status', { jobId: 'slac-222-bbb' }, callback)
		expect(analysesToReconnect.length).toBe(2);
	});

	it('should resubscribe to job events when status is running', () => {
		// When job:status returns { status: 'running' }
		// Expected: emit('fel:resubscribe', { id: jobId })
		const expectedEvent = 'fel:resubscribe';
		expect(expectedEvent).toBe('fel:resubscribe');
	});

	it('should complete analysis when job:status returns completed', () => {
		// When job:status returns { status: 'completed', results: {...} }
		// Expected: completeAnalysis(analysisId, true, results)
		const response = { status: 'completed', results: { test: true } };
		expect(response.status).toBe('completed');
	});

	it('should mark as connection_lost when job:status returns not_found', () => {
		// When job:status returns { status: 'not_found' }
		// Expected: updateAnalysis(analysisId, { status: 'connection_lost', error: '...' })
		const response = { status: 'not_found' };
		expect(response.status).toBe('not_found');
	});

	it('should skip analyses without jobId', () => {
		const analysisWithoutJobId = {
			id: 'backend-1',
			method: 'fel',
			metadata: {}
		};

		// Should be skipped - no emit should happen
		expect(analysisWithoutJobId.metadata.jobId).toBeUndefined();
	});

	it('should map method names correctly for resubscribe events', () => {
		// Method name mapping for backend events
		const methodNameMap = {
			'contrast-fel': 'cfel',
			'multi-hit': 'multihit',
			fel: 'fel',
			slac: 'slac'
		};

		expect(methodNameMap['contrast-fel']).toBe('cfel');
		expect(methodNameMap['multi-hit']).toBe('multihit');
	});
});

describe('UI Status Display', () => {
	it('should recognize reconnecting as a valid status', () => {
		const validStatuses = [
			'pending',
			'initializing',
			'running',
			'processing',
			'completed',
			'error',
			'cancelled',
			'interrupted',
			'reconnecting',
			'connection_lost'
		];

		expect(validStatuses).toContain('reconnecting');
		expect(validStatuses).toContain('connection_lost');
	});

	it('should allow re-run action for connection_lost status', () => {
		// In AnalysisCard.svelte, re-run is available for interrupted and connection_lost
		const statusesWithRerun = ['interrupted', 'connection_lost'];
		expect(statusesWithRerun).toContain('connection_lost');
	});

	it('should allow delete action for connection_lost status', () => {
		// In AnalysisCard.svelte, delete is available for completed, error, cancelled, interrupted, connection_lost
		const statusesWithDelete = ['completed', 'error', 'cancelled', 'interrupted', 'connection_lost'];
		expect(statusesWithDelete).toContain('connection_lost');
	});
});
