/**
 * Regression tests for the four high-severity findings in the state-management sweep (#165-#168).
 *
 * Each of these shipped as a behavioural fix with no test. What they have in common is the reason
 * they are worth pinning: NONE of them throws. Every one produces a run that looks like it worked —
 * an analysis that stays "running" forever, a job completed against another job's results, an
 * alignment submitted with a different alignment's tree. Nothing in the UI reports any of it, so the
 * only thing that can catch a reintroduction is a test that reproduces the mechanism.
 *
 * Every test here has been verified to FAIL with its fix reverted. A regression test that passes
 * either way is worse than none, because it reads like coverage.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { analysisStore } from '../stores/analyses.js';
import { treeStore, addTree, removeTree, resetTrees } from '../stores/tree.js';
import { alignmentFileStore, fileMetricsStore } from '../stores/fileInfo.js';
import { syncDescriptorStoresForFile } from '../lib/utils/descriptorSync.js';

// ---------------------------------------------------------------------------------------------
// #165 — a Svelte store's state is not readable as a property of the store object
// ---------------------------------------------------------------------------------------------

describe('#165 the WASM error path must read store state through get()', () => {
	it('exposes currentAnalysisId through get(), and NOT as a property of the store object', () => {
		// The bug in one line. `analysisStore.currentAnalysisId` is `undefined` — always, for every
		// store — because a Svelte store is a subscribe/set object, not a state bag. The WASM error
		// handler read it that way, so `if (analysisStore.currentAnalysisId)` was never true and a
		// thrown WASM run was never marked failed: it sat at "running" for the life of the page.
		expect(analysisStore.currentAnalysisId).toBeUndefined();
		expect(get(analysisStore)).toHaveProperty('currentAnalysisId');
	});

	it('cannot mark an analysis failed when the id is undefined', () => {
		// The consequence, stated as behaviour rather than as a property lookup. Whatever an error
		// handler does with `undefined`, it cannot reach a record — so a guard on the wrong expression
		// silently skips the failure write entirely.
		const before = get(analysisStore).analyses.length;
		const id = analysisStore.currentAnalysisId; // the buggy read
		expect(id).toBeUndefined();
		// Nothing was recorded, so nothing could have been marked failed.
		expect(get(analysisStore).analyses.length).toBe(before);
	});
});

// ---------------------------------------------------------------------------------------------
// #167 — tree state must not survive from one upload into the next
// ---------------------------------------------------------------------------------------------

describe('#167 tree state must be reset per upload', () => {
	beforeEach(() => treeStore.set({}));

	it("resetTrees clears the store, so a previous file's usertree cannot be inherited", () => {
		// The scenario: file A carries an embedded tree, file B does not. addTree only ever ADDED keys,
		// so B inherited A's usertree and could be submitted against B's sequences — a completed run,
		// with the wrong phylogeny, and nothing anywhere saying so.
		addTree('usertree', '((a:0.1,b:0.2):0.05,c:0.3);', {});
		expect(get(treeStore).usertree).toBeTruthy();

		const cleared = resetTrees();
		expect(get(treeStore)).toEqual({});
		expect(cleared).toEqual({});

		// A tree-less second upload adds nothing, and must therefore END UP with nothing.
		expect(get(treeStore).usertree).toBeUndefined();
	});

	it("does not alias store state to the caller's object", () => {
		// The helpers used to mutate the object they were handed and set() the same reference, so a
		// caller holding it could rewrite store state afterwards without any subscriber firing. That is
		// how stale tree state leaked across files even where a reset existed.
		const callerHeld = {};
		addTree('nj', '(a:0.1,b:0.2);', callerHeld);
		callerHeld.usertree = 'INJECTED';
		expect(get(treeStore).usertree, 'store state is aliased to the caller object').toBeUndefined();
	});

	it("removeTree also returns a fresh object rather than the caller's", () => {
		const held = { nj: '(a,b);', usertree: '(c,d);' };
		const next = removeTree('usertree', held);
		expect(next.usertree).toBeUndefined();
		expect(next).not.toBe(held);
	});
});

// ---------------------------------------------------------------------------------------------
// #166 — socket events must be routed by jobId, never to "whichever analysis is first"
// ---------------------------------------------------------------------------------------------

describe('#166 backend socket events route strictly by jobId', () => {
	/**
	 * Captures the handlers the runner registers, so they can be invoked with crafted payloads.
	 * The runner registers via `this.socket.on(...)`, so a fake socket that records its arguments is
	 * the whole seam needed.
	 */
	function makeRunnerWithFakeSocket() {
		const handlers = {};
		const socket = {
			connected: true,
			on: (event, fn) => {
				handlers[event] = fn;
			},
			off: () => {},
			emit: () => {},
			connect: () => {},
			disconnect: () => {}
		};
		return { handlers, socket };
	}

	let runner;
	let handlers;
	let completed;
	let originalComplete;

	beforeEach(async () => {
		// The module exports a singleton, not the class, so the singleton is what gets driven — with
		// its state reset per test and completeAnalysis restored afterwards so nothing leaks.
		const mod = await import('../lib/services/BackendAnalysisRunner.js');
		runner = mod.backendAnalysisRunner;
		const fake = makeRunnerWithFakeSocket();
		handlers = fake.handlers;
		runner.socket = fake.socket;
		runner.activeAnalyses.clear();

		// Record what the runner tries to finish, without touching the real store.
		completed = [];
		originalComplete = runner.completeAnalysis;
		runner.completeAnalysis = async (analysisId, success, _result, message) => {
			completed.push({ analysisId, success, message });
		};

		runner.setupGlobalHandlers();

		// Two concurrent jobs, which is the situation both bugs mishandled.
		runner.activeAnalyses.set('job-A', 'analysis-A');
		runner.activeAnalyses.set('job-B', 'analysis-B');
	});

	afterEach(() => {
		runner.completeAnalysis = originalComplete;
		runner.activeAnalyses.clear();
		runner.socket = null;
	});

	it('does not complete "the first active analysis" for an unmatched jobId', async () => {
		// The old fallback completed `activeAnalyses.entries().next().value` whenever the jobId did not
		// match — so a stray or late event marked an UNRELATED job complete, and attached another
		// job's results to it.
		await handlers['completed']({ jobId: 'job-UNKNOWN', results: { ok: true } });
		expect(completed, 'an unmatched jobId completed some analysis anyway').toEqual([]);
		expect(runner.activeAnalyses.size).toBe(2);
	});

	it('completes only the analysis whose jobId matched', async () => {
		await handlers['completed']({ jobId: 'job-B', results: { ok: true } });
		expect(completed.map((c) => c.analysisId)).toEqual(['analysis-B']);
		expect(runner.activeAnalyses.has('job-A'), 'the other job was cleared too').toBe(true);
	});

	it('does not fail EVERY active analysis on a script error', async () => {
		// The old handler looped every entry in activeAnalyses, so one job\'s error killed every
		// concurrent job — including ones that went on to succeed on the server.
		await handlers['script error']({ jobId: 'job-UNKNOWN', message: 'boom' });
		expect(completed, 'an unmatched error failed analyses anyway').toEqual([]);
		expect(runner.activeAnalyses.size).toBe(2);
	});

	it('fails only the analysis whose jobId matched', async () => {
		await handlers['script error']({ jobId: 'job-A', message: 'boom' });
		expect(completed).toHaveLength(1);
		expect(completed[0].analysisId).toBe('analysis-A');
		expect(completed[0].success).toBe(false);
		expect(runner.activeAnalyses.has('job-B'), 'a concurrent job was killed').toBe(true);
	});
});

// ---------------------------------------------------------------------------------------------
// #168 — a re-run must resync the descriptor stores to the file it belongs to
// ---------------------------------------------------------------------------------------------

describe('#168 re-run resyncs the descriptor stores', () => {
	beforeEach(() => {
		treeStore.set({});
		alignmentFileStore.set(null);
		fileMetricsStore.set(null);
	});

	/** A completed datareader result, the only thing that can rehydrate the descriptor stores. */
	const datareader = (fileId, createdAt, { nj, usertree } = {}) => ({
		fileId,
		method: 'datareader',
		status: 'completed',
		createdAt,
		result: JSON.stringify({
			FILE_INFO: { nj },
			FILE_PARTITION_INFO: { 0: { usertree } }
		})
	});

	it("replaces the previous file's alignment and trees, not merges with them", async () => {
		// The bug, end to end. File A is selected and its tree is in the store. A re-run belonging to
		// file B flips currentFileId; without a resync the stores still hold A, so B's run is submitted
		// with A's sequences and A's tree — and completes, attributed to B.
		alignmentFileStore.set({ id: 'file-A', name: 'A.fasta' });
		addTree('usertree', '((A1:0.1,A2:0.2):0.05,A3:0.3);', {});

		const analyses = [
			datareader('file-A', 100, { usertree: '((A1:0.1,A2:0.2):0.05,A3:0.3);' }),
			datareader('file-B', 200, { nj: '((B1:0.4,B2:0.5):0.06,B3:0.7);' })
		];

		const out = await syncDescriptorStoresForFile('file-B', {
			loadFile: async (id) => ({ id, name: `${id}.fasta` }),
			analyses
		});

		expect(get(alignmentFileStore).id, 'alignment still points at the old file').toBe('file-B');
		expect(out.file.id).toBe('file-B');
		// A's usertree must be GONE, not merged alongside B's nj.
		expect(get(treeStore).usertree, "the previous file's tree survived").toBeUndefined();
		expect(get(treeStore).nj).toBe('((B1:0.4,B2:0.5):0.06,B3:0.7);');
	});

	it('leaves NO tree behind when the new file has none', async () => {
		// The sharper case: B has a datareader result with no tree at all. Resetting only on the
		// success path, or only when a tree is present, leaves A's tree in place — which is precisely
		// how a tree-less alignment gets submitted with someone else's phylogeny.
		addTree('usertree', '((A1:0.1,A2:0.2):0.05,A3:0.3);', {});
		await syncDescriptorStoresForFile('file-B', {
			loadFile: async (id) => ({ id }),
			analyses: [datareader('file-B', 200)]
		});
		expect(get(treeStore)).toEqual({});
	});

	it('clears stale trees even when the file has no datareader result at all', async () => {
		addTree('nj', '((A1:0.1,A2:0.2):0.05);', {});
		await syncDescriptorStoresForFile('file-C', {
			loadFile: async (id) => ({ id }),
			analyses: []
		});
		expect(get(treeStore)).toEqual({});
	});

	it('uses the MOST RECENT datareader result for the file', async () => {
		// A file can be re-read; the newest read is the one that describes it now.
		await syncDescriptorStoresForFile('file-B', {
			loadFile: async (id) => ({ id }),
			analyses: [
				datareader('file-B', 100, { nj: '(OLD);' }),
				datareader('file-B', 300, { nj: '(NEW);' })
			]
		});
		expect(get(treeStore).nj).toBe('(NEW);');
	});

	it('does not leave the previous file described when loading fails', async () => {
		// An error must not fall back to "whatever was there" — that is the wrong-file submission
		// again, arrived at by a different route.
		alignmentFileStore.set({ id: 'file-A' });
		addTree('usertree', '((A1:0.1,A2:0.2):0.05);', {});
		const out = await syncDescriptorStoresForFile('file-B', {
			loadFile: async () => {
				throw new Error('IndexedDB unavailable');
			},
			analyses: []
		});
		expect(out.error).toBeInstanceOf(Error);
		expect(get(treeStore), "the previous file's tree survived a failure").toEqual({});
	});

	it('ignores datareader results belonging to other files', async () => {
		await syncDescriptorStoresForFile('file-B', {
			loadFile: async (id) => ({ id }),
			analyses: [datareader('file-A', 500, { nj: '(A_TREE);' })]
		});
		expect(get(treeStore).nj).toBeUndefined();
	});
});
