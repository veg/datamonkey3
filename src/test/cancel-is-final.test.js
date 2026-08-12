/**
 * Regression tests for issue #201 — a cancelled local analysis un-cancelled itself.
 *
 * The sequence: the user cancels, the record goes to 'cancelled', hyphy.wasm keeps running because
 * nothing terminates the worker, and minutes later completeAnalysis writes 'completed' over the
 * cancelled record. The #170 terminal-state guard did not stop it, because that guard only rejects
 * NON-terminal incoming states and 'completed' is terminal.
 *
 * The user is then shown a result produced by settings they explicitly rejected, on a card that
 * visibly changed itself from Cancelled to Completed. Nothing throws, nothing is logged, and the
 * result looks exactly like a real one — which is why this needs a test rather than a code comment.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analysisStore } from '../stores/analyses.js';

// The store persists through this module; stub it so the tests exercise the guard, not IndexedDB.
vi.mock('../lib/utils/indexedDBStorage', () => {
	const records = new Map();
	return {
		analysisStorage: {
			getAnalysis: vi.fn(async (id) => records.get(id) ?? null),
			saveAnalysis: vi.fn(async (a) => {
				records.set(a.id, a);
				return a;
			}),
			getAllAnalyses: vi.fn(async () => [...records.values()]),
			deleteAnalysis: vi.fn(async (id) => records.delete(id)),
			clearAllAnalyses: vi.fn(async () => records.clear()),
			__records: records
		}
	};
});

vi.mock('$app/environment', () => ({ browser: true }));

const { analysisStorage } = await import('../lib/utils/indexedDBStorage');

describe('#201 cancellation is final', () => {
	beforeEach(() => {
		analysisStorage.__records.clear();
	});

	async function seedCancelled(id = 'a1') {
		await analysisStorage.saveAnalysis({
			id,
			fileId: 'f1',
			method: 'busted',
			status: 'cancelled',
			createdAt: 1
		});
		return id;
	}

	it("does not let a late 'completed' overwrite a cancelled record", async () => {
		// The bug, exactly. WASM finishes after the user cancelled and reports success.
		const id = await seedCancelled();
		await analysisStore.updateAnalysis(id, { status: 'completed', result: '{"MLE":{}}' });

		const stored = await analysisStorage.getAnalysis(id);
		expect(stored.status, 'a cancelled analysis un-cancelled itself').toBe('cancelled');
	});

	it('does not attach a result to a cancelled record', async () => {
		// Even if the status were somehow preserved, attaching the payload would leave a cancelled
		// card that renders real-looking results.
		const id = await seedCancelled();
		await analysisStore.updateAnalysis(id, { status: 'completed', result: '{"MLE":{}}' });

		const stored = await analysisStorage.getAnalysis(id);
		expect(stored.result).toBeUndefined();
	});

	it("does not let a late 'error' overwrite it either", async () => {
		const id = await seedCancelled();
		await analysisStore.updateAnalysis(id, { status: 'error', error: 'boom' });
		expect((await analysisStorage.getAnalysis(id)).status).toBe('cancelled');
	});

	it('still allows unrelated terminal records to be written normally', async () => {
		// The guard must be about cancellation, not about freezing every record.
		await analysisStorage.saveAnalysis({
			id: 'a2',
			fileId: 'f1',
			method: 'fel',
			status: 'running',
			createdAt: 2
		});
		await analysisStore.updateAnalysis('a2', { status: 'completed', result: '{}' });
		expect((await analysisStorage.getAnalysis('a2')).status).toBe('completed');
	});
});

describe('#201 a cancelled run does not announce itself', () => {
	let runner;
	let toasts;

	beforeEach(async () => {
		const { BaseAnalysisRunner } = await import('../lib/services/BaseAnalysisRunner.js');
		runner = new BaseAnalysisRunner();
		toasts = [];
		const { toastStore } = await import('../stores/toast.js');
		toastStore.dismissAll();
		toasts = toastStore;
	});

	afterEach(async () => {
		const { toastStore } = await import('../stores/toast.js');
		toastStore.dismissAll();
	});

	it('suppresses completeAnalysis entirely for a cancelled analysis', async () => {
		const { get } = await import('svelte/store');
		runner.cancelledAnalyses.add('a9');

		await runner.completeAnalysis('a9', true, { MLE: {} });

		// No success toast: "FEL analysis complete!" for work called off minutes ago is the visible
		// half of the bug.
		expect(get(toasts), 'a cancelled run popped a completion toast').toHaveLength(0);
		// And the marker is consumed, so a later legitimate run of the same id is unaffected.
		expect(runner.cancelledAnalyses.has('a9')).toBe(false);
	});

	it('still reports a normal completion', async () => {
		const { get } = await import('svelte/store');
		await runner.completeAnalysis('a10', true, { MLE: {} });
		expect(get(toasts).length, 'a normal completion was suppressed').toBeGreaterThan(0);
	});

	it('marks the analysis cancelled before touching the store, so a race is covered', async () => {
		// cancelAnalysis records the id first; a completion arriving concurrently then finds it.
		await runner.cancelAnalysis('a11').catch(() => {});
		expect(runner.cancelledAnalyses.has('a11')).toBe(true);
	});
});
