/**
 * Unit tests for HyPhyAnalysisRunner lifecycle/error branches that don't need a
 * real WASM worker: stopAnalysis, cleanupAnalysis, the status-checker timeout
 * path (driven with fake timers), and stopStatusChecker.
 *
 * We mock the analysis store (the runner only calls a handful of its methods)
 * and hyphyOutputParser so importing the singleton is side-effect free.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('../stores/analyses', () => ({
	analysisStore: {
		startAnalysisProgress: vi.fn(),
		updateAnalysisProgressById: vi.fn(),
		completeAnalysisProgress: vi.fn(),
		completeAnalysisProgressById: vi.fn(),
		removeFromActiveAnalyses: vi.fn()
	}
}));

vi.mock('../lib/utils/hyphyOutputParser', () => ({
	hyphyOutputParser: { parse: vi.fn(), reset: vi.fn() }
}));

import { hyPhyAnalysisRunner } from '../lib/services/HyPhyAnalysisRunner';
import { analysisStore } from '../stores/analyses';

const makeWorker = () => ({ terminate: vi.fn() });

describe('HyPhyAnalysisRunner.stopAnalysis', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hyPhyAnalysisRunner.runningAnalyses.clear();
	});

	it('returns false when the analysis is not tracked', () => {
		expect(hyPhyAnalysisRunner.stopAnalysis('missing')).toBe(false);
		expect(analysisStore.updateAnalysisProgressById).not.toHaveBeenCalled();
	});

	it('terminates the worker and marks the store on stop', () => {
		const worker = makeWorker();
		hyPhyAnalysisRunner.runningAnalyses.set('a1', {
			id: 'a1',
			status: 'running',
			startTime: Date.now(),
			worker
		});

		const result = hyPhyAnalysisRunner.stopAnalysis('a1');

		expect(result).toBe(true);
		expect(worker.terminate).toHaveBeenCalled();
		expect(analysisStore.updateAnalysisProgressById).toHaveBeenCalledWith(
			'a1',
			'error',
			0,
			'Analysis was stopped by user'
		);
		expect(analysisStore.completeAnalysisProgress).toHaveBeenCalledWith(
			false,
			'Analysis was stopped by user'
		);
	});

	it('handles a stopped analysis that has no worker yet', () => {
		hyPhyAnalysisRunner.runningAnalyses.set('a2', {
			id: 'a2',
			status: 'initializing',
			startTime: Date.now(),
			worker: null
		});

		expect(hyPhyAnalysisRunner.stopAnalysis('a2')).toBe(true);
		expect(analysisStore.completeAnalysisProgress).toHaveBeenCalled();
	});
});

describe('HyPhyAnalysisRunner.cleanupAnalysis', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hyPhyAnalysisRunner.runningAnalyses.clear();
		hyPhyAnalysisRunner.outputBuffer.clear();
	});

	it('is a no-op when the analysis is not tracked', () => {
		expect(() => hyPhyAnalysisRunner.cleanupAnalysis('missing')).not.toThrow();
	});

	it('clears interval, terminates worker, and drops tracking maps', () => {
		const worker = makeWorker();
		const completionInterval = setInterval(() => {}, 100000);
		hyPhyAnalysisRunner.runningAnalyses.set('a1', {
			id: 'a1',
			status: 'running',
			worker,
			completionInterval
		});
		hyPhyAnalysisRunner.outputBuffer.set('a1', 'partial output');

		hyPhyAnalysisRunner.cleanupAnalysis('a1');

		expect(worker.terminate).toHaveBeenCalled();
		expect(hyPhyAnalysisRunner.runningAnalyses.has('a1')).toBe(false);
		expect(hyPhyAnalysisRunner.outputBuffer.has('a1')).toBe(false);
	});
});

describe('HyPhyAnalysisRunner status checker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		hyPhyAnalysisRunner.runningAnalyses.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('marks an over-long analysis as timed out and cleans it up', () => {
		// Re-arm the checker under fake timers so its setInterval is controllable
		hyPhyAnalysisRunner.startStatusChecker();

		const worker = makeWorker();
		hyPhyAnalysisRunner.runningAnalyses.set('slow', {
			id: 'slow',
			status: 'running',
			startTime: Date.now() - 3_700_000, // > 1 hour ago
			worker
		});

		// Advance past one checker tick (2s interval)
		vi.advanceTimersByTime(2100);

		expect(analysisStore.updateAnalysisProgressById).toHaveBeenCalledWith(
			'slow',
			'error',
			0,
			'Analysis timed out after 1 hour'
		);
		// cleanupAnalysis ran → no longer tracked
		expect(hyPhyAnalysisRunner.runningAnalyses.has('slow')).toBe(false);

		hyPhyAnalysisRunner.stopStatusChecker();
	});

	it('leaves already-completed analyses untouched', () => {
		hyPhyAnalysisRunner.startStatusChecker();

		hyPhyAnalysisRunner.runningAnalyses.set('done', {
			id: 'done',
			status: 'completed',
			startTime: Date.now() - 3_700_000,
			worker: null
		});

		vi.advanceTimersByTime(2100);

		expect(analysisStore.updateAnalysisProgressById).not.toHaveBeenCalled();
		expect(hyPhyAnalysisRunner.runningAnalyses.has('done')).toBe(true);

		hyPhyAnalysisRunner.stopStatusChecker();
	});

	it('stopStatusChecker clears the interval', () => {
		hyPhyAnalysisRunner.startStatusChecker();
		expect(hyPhyAnalysisRunner.statusCheckInterval).not.toBeNull();

		hyPhyAnalysisRunner.stopStatusChecker();
		expect(hyPhyAnalysisRunner.statusCheckInterval).toBeNull();
	});
});
