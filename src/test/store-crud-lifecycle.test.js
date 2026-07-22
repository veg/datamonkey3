/**
 * Phase 2: state-transition + error-branch coverage for the analyses store CRUD
 * methods. The existing store tests (analysis-store-counts, concurrent-state-
 * management, reconnection-handling, page-refresh-handling) cover reconnection
 * and progress counting; this file targets the load/create/get/delete/cancel/
 * clear success AND error (storage-rejects) forks that were uncovered.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('../lib/utils/indexedDBStorage', () => ({
	analysisStorage: {
		getAllAnalyses: vi.fn().mockResolvedValue([]),
		saveAnalysis: vi.fn().mockResolvedValue(undefined),
		getAnalysis: vi.fn().mockResolvedValue(null),
		deleteAnalysis: vi.fn().mockResolvedValue(undefined),
		clearAllAnalyses: vi.fn().mockResolvedValue(undefined)
	}
}));

import { analysisStore } from '../stores/analyses';
import { analysisStorage } from '../lib/utils/indexedDBStorage';

const reset = () =>
	analysisStore.update(() => ({
		analyses: [],
		currentAnalysisId: null,
		isLoading: false,
		error: null,
		activeAnalyses: []
	}));

beforeEach(() => {
	vi.clearAllMocks();
	analysisStorage.getAllAnalyses.mockResolvedValue([]);
	analysisStorage.saveAnalysis.mockResolvedValue(undefined);
	analysisStorage.getAnalysis.mockResolvedValue(null);
	analysisStorage.deleteAnalysis.mockResolvedValue(undefined);
	analysisStorage.clearAllAnalyses.mockResolvedValue(undefined);
	reset();
});

describe('loadAnalyses', () => {
	it('loads analyses from storage into the list', async () => {
		analysisStorage.getAllAnalyses.mockResolvedValue([
			{ id: '1', status: 'completed' },
			{ id: '2', status: 'error' }
		]);

		await analysisStore.loadAnalyses();

		const state = get(analysisStore);
		expect(state.analyses).toHaveLength(2);
		expect(state.isLoading).toBe(false);
	});

	it('records the error and stops loading when storage rejects', async () => {
		analysisStorage.getAllAnalyses.mockRejectedValue(new Error('db down'));

		await analysisStore.loadAnalyses();

		const state = get(analysisStore);
		expect(state.error).toBe('db down');
		expect(state.isLoading).toBe(false);
	});
});

describe('createAnalysis', () => {
	it('saves a pending analysis and sets it current', async () => {
		const id = await analysisStore.createAnalysis('file-1', 'FEL');

		expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
			expect.objectContaining({ id, fileId: 'file-1', method: 'FEL', status: 'pending' })
		);
		const state = get(analysisStore);
		expect(state.currentAnalysisId).toBe(id);
		expect(state.analyses.some((a) => a.id === id)).toBe(true);
	});

	it('rethrows and records the error when the save fails', async () => {
		analysisStorage.saveAnalysis.mockRejectedValue(new Error('quota exceeded'));

		await expect(analysisStore.createAnalysis('file-1', 'FEL')).rejects.toThrow('quota exceeded');
		expect(get(analysisStore).error).toBe('quota exceeded');
	});
});

describe('getAnalysis', () => {
	it('fetches and merges the analysis into the list', async () => {
		analysisStore.update((s) => ({ ...s, analyses: [{ id: 'x', status: 'pending' }] }));
		analysisStorage.getAnalysis.mockResolvedValue({ id: 'x', status: 'completed' });

		const result = await analysisStore.getAnalysis('x');

		expect(result.status).toBe('completed');
		expect(get(analysisStore).analyses.find((a) => a.id === 'x').status).toBe('completed');
	});

	it('rethrows on storage error', async () => {
		analysisStorage.getAnalysis.mockRejectedValue(new Error('read fail'));
		await expect(analysisStore.getAnalysis('x')).rejects.toThrow('read fail');
		expect(get(analysisStore).error).toBe('read fail');
	});
});

describe('deleteAnalysis', () => {
	it('removes the analysis from the list', async () => {
		analysisStore.update((s) => ({
			...s,
			analyses: [{ id: 'a' }, { id: 'b' }],
			currentAnalysisId: 'a'
		}));

		await analysisStore.deleteAnalysis('a');

		const state = get(analysisStore);
		expect(state.analyses.map((a) => a.id)).toEqual(['b']);
		// currentAnalysisId cleared because it was the deleted one
		expect(state.currentAnalysisId).toBeNull();
	});

	it('keeps currentAnalysisId when deleting a different analysis', async () => {
		analysisStore.update((s) => ({
			...s,
			analyses: [{ id: 'a' }, { id: 'b' }],
			currentAnalysisId: 'b'
		}));

		await analysisStore.deleteAnalysis('a');

		expect(get(analysisStore).currentAnalysisId).toBe('b');
	});

	it('rethrows and records the error when the delete fails', async () => {
		analysisStorage.deleteAnalysis.mockRejectedValue(new Error('locked'));
		await expect(analysisStore.deleteAnalysis('a')).rejects.toThrow('locked');
		expect(get(analysisStore).error).toBe('locked');
	});
});

describe('cancelAnalysis', () => {
	it('marks the analysis cancelled and removes it from activeAnalyses', async () => {
		analysisStorage.getAnalysis.mockResolvedValue({ id: 'a', status: 'running' });
		analysisStore.update((s) => ({
			...s,
			analyses: [{ id: 'a', status: 'running' }],
			activeAnalyses: [{ id: 'a' }]
		}));

		await analysisStore.cancelAnalysis('a');

		expect(analysisStorage.saveAnalysis).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'cancelled' })
		);
		expect(get(analysisStore).activeAnalyses).toHaveLength(0);
	});

	it('rethrows when the underlying update fails', async () => {
		analysisStorage.getAnalysis.mockResolvedValue({ id: 'a' });
		analysisStorage.saveAnalysis.mockRejectedValue(new Error('save fail'));
		await expect(analysisStore.cancelAnalysis('a')).rejects.toThrow('save fail');
	});
});

describe('clearAllAnalyses', () => {
	it('empties the store and clears storage', async () => {
		analysisStore.update((s) => ({
			...s,
			analyses: [{ id: 'a' }],
			currentAnalysisId: 'a',
			activeAnalyses: [{ id: 'a' }]
		}));

		await analysisStore.clearAllAnalyses();

		expect(analysisStorage.clearAllAnalyses).toHaveBeenCalled();
		const state = get(analysisStore);
		expect(state.analyses).toEqual([]);
		expect(state.currentAnalysisId).toBeNull();
		expect(state.activeAnalyses).toEqual([]);
	});

	it('rethrows and records the error when clearing storage fails', async () => {
		analysisStorage.clearAllAnalyses.mockRejectedValue(new Error('clear fail'));
		await expect(analysisStore.clearAllAnalyses()).rejects.toThrow('clear fail');
		expect(get(analysisStore).error).toBe('clear fail');
	});
});
