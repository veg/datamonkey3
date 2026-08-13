/**
 * The submission watchdog: what happens between "Job submitted" and the server saying anything.
 *
 * Before this, a spawn the server silently dropped left the run sitting at 'pending' forever — there
 * was no ack, no timer and nothing that ever revisited the state. These tests pin the three
 * decisions that make the fix correct rather than merely present:
 *
 *  1. The ack the server ALREADY sends (`job created`) disarms the watchdog, so a healthy job is
 *     never probed.
 *  2. Expiry does not fail the run. It probes `job:status`, and only an unambiguous 'not_found' (or
 *     no answer at all) is treated as loss. 'unknown' means keep waiting — see the comment in
 *     probeSubmission for why a healthy job answers 'unknown'.
 *  3. The spawn emit takes exactly two arguments. A third turns it into an ack request, which the
 *     server's stream router misreads as the job parameters and rejects. That one is a regression
 *     guard against a "fix" that would break every backend submission.
 *
 * NOT NAMED backend-*.test.js ON PURPOSE: vite.config.ts:21-26 excludes both `src/test/backend-*`
 * and `src/test/*-backend*` from the vitest run, so a file named for what it tests would never
 * execute.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { backendAnalysisRunner } from '../lib/services/BackendAnalysisRunner.js';
import { analysisStore } from '../stores/analyses.js';

// Ack replies from the job:status probe, per test.
let ackReply = [null, { status: 'unknown' }];
const ackEmit = vi.fn((event, payload, cb) => cb(...ackReply));

const mockSocket = {
	connected: true,
	connect: vi.fn(),
	disconnect: vi.fn(),
	emit: vi.fn(),
	on: vi.fn(),
	off: vi.fn(),
	timeout: vi.fn(() => ({ emit: ackEmit }))
};

vi.mock('socket.io-client', () => ({
	default: vi.fn(() => mockSocket)
}));

vi.mock('../stores/analyses.js', () => ({
	analysisStore: {
		// BaseAnalysisRunner.completeAnalysis does a svelte `get()` on this store, so the mock has to
		// honour the store contract, not just the method surface.
		subscribe: (run) => {
			run({ analyses: [], activeAnalyses: [] });
			return () => {};
		},
		createAnalysis: vi.fn(),
		updateAnalysis: vi.fn(),
		startAnalysisProgress: vi.fn(),
		updateAnalysisProgress: vi.fn(),
		updateAnalysisProgressById: vi.fn(),
		completeAnalysisProgress: vi.fn(),
		completeAnalysisProgressById: vi.fn(),
		removeFromActiveAnalyses: vi.fn(),
		cancelAnalysis: vi.fn()
	}
}));

const FASTA = '>seq1\nACGACG\n>seq2\nACGACG';
const TREE = '(seq1:0.1,seq2:0.1);';

/** Register the global handlers against the mock socket without going through connect(). */
function attachSocket() {
	backendAnalysisRunner.socket = mockSocket;
	mockSocket.connected = true;
	backendAnalysisRunner.setupGlobalHandlers();
}

/** The handler setupGlobalHandlers registered for a given socket event. */
function handlerFor(event) {
	const call = [...mockSocket.on.mock.calls].reverse().find((c) => c[0] === event);
	expect(call?.[1], `no socket handler registered for '${event}'`).toBeTypeOf('function');
	return call[1];
}

async function submitFel() {
	analysisStore.createAnalysis.mockResolvedValue('analysis-1');
	const { jobId, analysisId } = await backendAnalysisRunner.runAnalysis(
		'FEL',
		{ geneticCode: 'Universal', executionMode: 'backend' },
		FASTA,
		TREE,
		'file-1'
	);
	return { jobId, analysisId };
}

const connectionLostCalls = () =>
	analysisStore.updateAnalysis.mock.calls.filter((c) => c[1]?.status === 'connection_lost');

describe('backend submission watchdog', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		ackReply = [null, { status: 'unknown' }];
		backendAnalysisRunner.activeAnalyses.clear();
		backendAnalysisRunner.clearAllSubmissionWatchdogs();
		backendAnalysisRunner.socket = null;
	});

	afterEach(() => {
		backendAnalysisRunner.disconnect();
		vi.useRealTimers();
	});

	it('does not probe a job the server acknowledged', async () => {
		attachSocket();
		const { jobId } = await submitFel();

		// `job created` is what the server already publishes on acceptance
		// (app/hyphyjob.js -> lib/clientsocket.js). Feeding it back disarms the watchdog.
		handlerFor('job created')({ id: jobId, status: 'queued' });

		await vi.advanceTimersByTimeAsync(61_000);

		expect(mockSocket.timeout).not.toHaveBeenCalled();
		expect(connectionLostCalls()).toHaveLength(0);
	});

	it('reports the acknowledged queue state instead of a bare job id', async () => {
		attachSocket();
		const { jobId, analysisId } = await submitFel();

		handlerFor('job created')({ id: jobId, status: 'Q' });
		expect(analysisStore.updateAnalysisProgressById).toHaveBeenCalledWith(
			analysisId,
			'pending',
			10,
			'Queued on the server'
		);

		handlerFor('job metadata')({ id: jobId, status: 'R' });
		expect(analysisStore.updateAnalysisProgressById).toHaveBeenCalledWith(
			analysisId,
			'running',
			10,
			'Running on the server'
		);
	});

	it('marks the run connection_lost when the server has no record of the job', async () => {
		attachSocket();
		const { analysisId } = await submitFel();
		ackReply = [null, { status: 'not_found' }];

		await vi.advanceTimersByTimeAsync(61_000);

		expect(ackEmit).toHaveBeenCalledWith('job:status', expect.any(Object), expect.any(Function));
		expect(analysisStore.updateAnalysis).toHaveBeenCalledWith(
			analysisId,
			expect.objectContaining({
				status: 'connection_lost',
				error: 'The server has no record of this job. It was never accepted.'
			})
		);
		expect(backendAnalysisRunner.activeAnalyses.size).toBe(0);
	});

	it('marks the run connection_lost when the probe itself goes unanswered', async () => {
		attachSocket();
		const { analysisId } = await submitFel();
		ackReply = [new Error('operation has timed out'), undefined];

		await vi.advanceTimersByTimeAsync(61_000);

		expect(analysisStore.updateAnalysis).toHaveBeenCalledWith(
			analysisId,
			expect.objectContaining({
				status: 'connection_lost',
				error: 'The server never confirmed this job.'
			})
		);
	});

	it("keeps waiting on 'unknown', which a healthy queued job reports", async () => {
		attachSocket();
		await submitFel();
		ackReply = [null, { status: 'unknown' }];

		await vi.advanceTimersByTimeAsync(61_000);

		expect(ackEmit).toHaveBeenCalledTimes(1);
		expect(connectionLostCalls()).toHaveLength(0);

		// And it re-arms rather than giving up silently.
		await vi.advanceTimersByTimeAsync(61_000);
		expect(ackEmit).toHaveBeenCalledTimes(2);
		expect(connectionLostCalls()).toHaveLength(0);
	});

	it('submits the spawn with exactly two arguments and no ack request', async () => {
		// REGRESSION GUARD. `socket.timeout(ms).emit(spawn, data, cb)` arrives at the server's stream
		// router (lib/router.js:26) as stream=data, data=ackFn, so analysis-routes.js reads the ack
		// function as the job parameters and answers 'Invalid job parameters' for every submission.
		attachSocket();
		await submitFel();

		const call = mockSocket.emit.mock.calls.find((c) => c[0] === 'fel:spawn');
		expect(call, 'the spawn must go out on socket.emit, not socket.timeout().emit').toBeDefined();
		expect(call).toHaveLength(2);
		expect(mockSocket.timeout).not.toHaveBeenCalled();
	});

	it('stops chasing a job that completed while unacknowledged', async () => {
		attachSocket();
		const { jobId } = await submitFel();

		handlerFor('completed')({ jobId, results: { some: 'result' } });
		await vi.advanceTimersByTimeAsync(61_000);

		expect(mockSocket.timeout).not.toHaveBeenCalled();
		expect(connectionLostCalls()).toHaveLength(0);
	});

	it('never asks the server for the job queue, which would disconnect the socket', async () => {
		// server.js:54-59 answers `job queue` with a reply followed by socket.disconnect(), tearing
		// down the status stream for every in-flight job.
		attachSocket();
		await submitFel();

		const queueEmits = mockSocket.emit.mock.calls.filter((c) => c[0] === 'job queue');
		expect(queueEmits).toHaveLength(0);
	});
});
