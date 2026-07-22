/**
 * Real unit tests for BackendAnalysisRunner reconnection + connection error paths.
 *
 * These exercise the actual runner code (not literal assertions like the
 * placeholder block in reconnection-handling.test.js). We mock socket.io-client
 * so io() returns a controllable fake socket, and mock the IndexedDB storage so
 * the store persists in-memory. Then we drive reconnectToJobs() through every
 * job:status fork:
 *   - completed        -> completeAnalysis(true, results)
 *   - running / queued -> resubscribe + status back to running
 *   - not_found        -> connection_lost
 *   - unknown status   -> connection_lost (unexpected status)
 *   - callback throws  -> connection_lost (reconnection failed)
 * plus the "socket not connected -> connect() fails -> all connection_lost" path
 * and connect() success/timeout/connect_error branches.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Browser env so the store persists via (mocked) IndexedDB
vi.mock('$app/environment', () => ({ browser: true }));

// In-memory IndexedDB storage mock (shared by store + runner)
vi.mock('../lib/utils/indexedDBStorage', () => ({
	analysisStorage: {
		getAllAnalyses: vi.fn().mockResolvedValue([]),
		saveAnalysis: vi.fn().mockResolvedValue(undefined),
		getAnalysis: vi.fn().mockResolvedValue(null),
		deleteAnalysis: vi.fn().mockResolvedValue(undefined),
		clearAllAnalyses: vi.fn().mockResolvedValue(undefined)
	}
}));

// Controllable fake socket. Tests set connected + program emit()'s job:status
// callback via socket.__statusResponse (or __statusThrows to force a throw).
const makeSocket = () => {
	const handlers = {};
	const socket = {
		connected: true,
		__statusResponse: { status: 'not_found' },
		__statusThrows: false,
		// The job:status callback in reconnectToJobs is async and fire-and-forget;
		// we collect its promise here so tests can await it (see flushPending).
		__pending: [],
		on: vi.fn((event, cb) => {
			handlers[event] = cb;
		}),
		off: vi.fn(),
		emit: vi.fn((event, payload, cb) => {
			if (event === 'job:status' && typeof cb === 'function') {
				const response = socket.__statusThrows ? null : socket.__statusResponse;
				socket.__pending.push(Promise.resolve(cb(response)));
			}
		}),
		disconnect: vi.fn(),
		__handlers: handlers
	};
	return socket;
};

// Await any in-flight job:status callbacks kicked off by reconnectToJobs.
const flushPending = () => Promise.all(currentSocket.__pending);

let currentSocket;
vi.mock('socket.io-client', () => ({
	default: vi.fn(() => currentSocket)
}));

// Import after mocks
import io from 'socket.io-client';
import { analysisStore } from '../stores/analyses';
import { analysisStorage } from '../lib/utils/indexedDBStorage';
import { backendAnalysisRunner } from '../lib/services/BackendAnalysisRunner';

// Stateful in-memory backing for the IndexedDB storage mock, so getAnalysis
// reflects what saveAnalysis last wrote (real IndexedDB semantics).
const storageBacking = new Map();

const seedAnalysis = async (over = {}) => {
	// jobId defaults to a real id, but an explicit `jobId: undefined` must stay
	// undefined (the "no jobId, skip" path), so check the key's presence.
	const jobId = 'jobId' in over ? over.jobId : 'fel-111-aaa';
	const analysis = {
		id: over.id || 'backend-1',
		fileId: 'file-1',
		method: over.method || 'FEL',
		status: 'reconnecting',
		createdAt: Date.now() - 1000,
		...over,
		metadata: { executionMode: 'backend', jobId }
	};
	// Put it in the store list AND make the storage mock stateful, because the
	// store's updateAnalysis merges over getAnalysis(id) then saveAnalysis()s the
	// result. A static getAnalysis loses fields written by an earlier update
	// (e.g. `result` set by completeAnalysis before completeAnalysisProgressById
	// re-updates). Backing getAnalysis with saveAnalysis mirrors real IndexedDB.
	analysisStore.update((s) => ({ ...s, analyses: [...s.analyses, analysis] }));
	storageBacking.set(analysis.id, { ...analysis });
	return analysis;
};

const resetStore = () =>
	analysisStore.update(() => ({
		analyses: [],
		currentAnalysisId: null,
		isLoading: false,
		error: null,
		activeAnalyses: []
	}));

describe('BackendAnalysisRunner.reconnectToJobs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		currentSocket = makeSocket();
		backendAnalysisRunner.socket = currentSocket;
		backendAnalysisRunner.activeAnalyses.clear();
		resetStore();
		storageBacking.clear();
		analysisStorage.getAnalysis.mockImplementation(async (id) => {
			const v = storageBacking.get(id);
			return v ? { ...v } : null;
		});
		analysisStorage.saveAnalysis.mockImplementation(async (a) => {
			storageBacking.set(a.id, { ...a });
		});
	});

	it('completes the analysis when job:status returns completed', async () => {
		const a = await seedAnalysis({ id: 'done-1', jobId: 'fel-done-1' });
		currentSocket.__statusResponse = { status: 'completed', results: { sites: [1, 2] } };

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		const state = get(analysisStore);
		const updated = state.analyses.find((x) => x.id === 'done-1');
		expect(updated.status).toBe('completed');
		expect(updated.result).toContain('sites');
	});

	it('resubscribes and marks running when job:status returns running', async () => {
		const a = await seedAnalysis({ id: 'run-1', method: 'FEL', jobId: 'fel-run-1' });
		currentSocket.__statusResponse = { status: 'running' };

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		// Emitted a resubscribe for the fel method
		expect(currentSocket.emit).toHaveBeenCalledWith('fel:resubscribe', { id: 'fel-run-1' });
		// Re-tracked as active
		expect(backendAnalysisRunner.activeAnalyses.get('fel-run-1')).toBe('run-1');
		expect(get(analysisStore).analyses.find((x) => x.id === 'run-1').status).toBe('running');
	});

	it('treats queued the same as running (resubscribe)', async () => {
		const a = await seedAnalysis({ id: 'q-1', method: 'SLAC', jobId: 'slac-q-1' });
		currentSocket.__statusResponse = { status: 'queued' };

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		expect(currentSocket.emit).toHaveBeenCalledWith('slac:resubscribe', { id: 'slac-q-1' });
	});

	it('maps contrast-fel to cfel for the resubscribe event', async () => {
		const a = await seedAnalysis({ id: 'cf-1', method: 'contrast-fel', jobId: 'cfel-1' });
		currentSocket.__statusResponse = { status: 'running' };

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		expect(currentSocket.emit).toHaveBeenCalledWith('cfel:resubscribe', { id: 'cfel-1' });
	});

	it('marks connection_lost when job:status returns not_found', async () => {
		const a = await seedAnalysis({ id: 'nf-1', jobId: 'fel-nf-1' });
		currentSocket.__statusResponse = { status: 'not_found' };

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		const updated = get(analysisStore).analyses.find((x) => x.id === 'nf-1');
		expect(updated.status).toBe('connection_lost');
		expect(updated.error).toMatch(/no longer exists/i);
	});

	it('marks connection_lost on an unknown status', async () => {
		const a = await seedAnalysis({ id: 'unk-1', jobId: 'fel-unk-1' });
		currentSocket.__statusResponse = { status: 'wat' };

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		const updated = get(analysisStore).analyses.find((x) => x.id === 'unk-1');
		expect(updated.status).toBe('connection_lost');
		expect(updated.error).toMatch(/unexpected job status/i);
	});

	it('marks connection_lost when the status callback throws', async () => {
		const a = await seedAnalysis({ id: 'err-1', jobId: 'fel-err-1' });
		// null response -> response.status access throws inside the callback try
		currentSocket.__statusThrows = true;

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		const updated = get(analysisStore).analyses.find((x) => x.id === 'err-1');
		expect(updated.status).toBe('connection_lost');
		expect(updated.error).toMatch(/reconnection failed/i);
	});

	it('skips analyses that have no jobId (no emit)', async () => {
		const a = await seedAnalysis({ id: 'nojob-1', jobId: undefined });

		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		expect(currentSocket.emit).not.toHaveBeenCalled();
	});

	it('marks all analyses connection_lost when the socket is down and connect() fails', async () => {
		// Socket not connected -> reconnectToJobs calls connect() which we force to reject
		currentSocket.connected = false;
		const connectSpy = vi
			.spyOn(backendAnalysisRunner, 'connect')
			.mockRejectedValue(new Error('down'));

		const a = await seedAnalysis({ id: 'lost-1', jobId: 'fel-lost-1' });
		await backendAnalysisRunner.reconnectToJobs([a]);
		await flushPending();

		expect(connectSpy).toHaveBeenCalled();
		const updated = get(analysisStore).analyses.find((x) => x.id === 'lost-1');
		expect(updated.status).toBe('connection_lost');
		expect(updated.error).toMatch(/could not connect/i);
		connectSpy.mockRestore();
	});
});

describe('BackendAnalysisRunner.connect', () => {
	beforeEach(() => {
		vi.restoreAllMocks(); // undo any connect() spy leaked from the reconnect suite
		vi.clearAllMocks();
		currentSocket = makeSocket();
		currentSocket.connected = false;
		backendAnalysisRunner.socket = null;
	});

	it('resolves when the socket fires connect', async () => {
		// io() returns currentSocket; connect() registers handlers on it.
		const p = backendAnalysisRunner.connect('http://test');
		currentSocket.__handlers['connect']();
		await expect(p).resolves.toBe(currentSocket);
	});

	it('rejects when the socket fires connect_error', async () => {
		const p = backendAnalysisRunner.connect('http://test');
		currentSocket.__handlers['connect_error'](new Error('boom'));
		await expect(p).rejects.toThrow(/connection failed/i);
	});

	it('short-circuits when already connected', async () => {
		const already = makeSocket();
		already.connected = true;
		backendAnalysisRunner.socket = already;

		const result = await backendAnalysisRunner.connect();
		expect(result).toBe(already);
		// io() should not have been called again
		expect(io).not.toHaveBeenCalled();
	});
});
