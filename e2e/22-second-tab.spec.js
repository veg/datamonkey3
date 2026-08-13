/**
 * Opening a second tab must not kill the first tab's running analysis.
 *
 * IndexedDB is shared across tabs of an origin; the in-memory list of active runs is not. Every tab
 * runs cleanupInterruptedAnalyses at onMount, and a local run's persisted record sits at
 * 'pending'/'wasm' for its whole duration — so a second tab used to reap the first tab's live work,
 * discard hours of compute and offer a Re-run that would duplicate it.
 *
 * The test carries its own positive control. Two records are seeded before the second tab opens: one
 * with a fresh heartbeat (another tab is alive and stamping it) and one with none (a session that is
 * gone). The stale one MUST be reaped — that is the proof the sweep actually ran — and the live one
 * must be untouched. Without both, "nothing was reaped" could just mean "the sweep never happened",
 * which is exactly how this kind of test passes while proving nothing.
 */

import { test, expect } from './fixtures/coverage.js';
import {
	freshStart,
	loadDemoFile,
	goToAnalyzeTab,
	selectMethod,
	clickRunAnalysis
} from './fixtures/helpers.js';

const DB_NAME = 'datamonkey-db';
const DB_VERSION = 2;

/** Put an analysis record straight into the shared database, as another tab would have left it. */
async function seedAnalysisRecord(page, record) {
	return await page.evaluate(
		async ({ record, dbName, dbVersion }) => {
			const db = await new Promise((resolve, reject) => {
				const req = indexedDB.open(dbName, dbVersion);
				req.onupgradeneeded = (e) => {
					const d = e.target.result;
					if (!d.objectStoreNames.contains('files'))
						d.createObjectStore('files', { keyPath: 'id' });
					if (!d.objectStoreNames.contains('analyses'))
						d.createObjectStore('analyses', { keyPath: 'id' });
				};
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
			const tx = db.transaction('analyses', 'readwrite');
			tx.objectStore('analyses').put(record);
			await new Promise((resolve) => {
				tx.oncomplete = resolve;
			});
			db.close();
			return record.id;
		},
		{ record, dbName: DB_NAME, dbVersion: DB_VERSION }
	);
}

/** Read every analysis record's id and status out of the shared database. */
async function readStatuses(page) {
	return await page.evaluate(
		async ({ dbName, dbVersion }) => {
			const db = await new Promise((resolve, reject) => {
				const req = indexedDB.open(dbName, dbVersion);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
			const all = await new Promise((resolve, reject) => {
				const req = db.transaction('analyses', 'readonly').objectStore('analyses').getAll();
				req.onsuccess = () => resolve(req.result || []);
				req.onerror = () => reject(req.error);
			});
			db.close();
			return all.map((a) => ({ id: a.id, status: a.status }));
		},
		{ dbName: DB_NAME, dbVersion: DB_VERSION }
	);
}

/** Read the heartbeat stamp of every local run record. */
async function readHeartbeats(page) {
	return await page.evaluate(
		async ({ dbName, dbVersion }) => {
			const db = await new Promise((resolve, reject) => {
				const req = indexedDB.open(dbName, dbVersion);
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
			const all = await new Promise((resolve, reject) => {
				const req = db.transaction('analyses', 'readonly').objectStore('analyses').getAll();
				req.onsuccess = () => resolve(req.result || []);
				req.onerror = () => reject(req.error);
			});
			db.close();
			return all
				.filter((a) => a.metadata?.executionMode === 'wasm')
				.map((a) => ({ id: a.id, lastHeartbeatAt: a.lastHeartbeatAt }));
		},
		{ dbName: DB_NAME, dbVersion: DB_VERSION }
	);
}

const statusOf = (rows, id) => rows.find((r) => r.id === id)?.status;

test.describe('a second browser tab', () => {
	test.setTimeout(180000);

	test('reaps a dead session’s run but leaves a live one alone', async ({ page, context }) => {
		await freshStart(page);

		const now = Date.now();
		const liveId = `live-run-${now}`;
		const staleId = `stale-run-${now}`;

		// Another tab is running this right now and stamping it every ten seconds.
		await seedAnalysisRecord(page, {
			id: liveId,
			fileId: `file-${now}`,
			method: 'AXOMEME',
			status: 'running',
			metadata: { executionMode: 'wasm' },
			createdAt: now - 30_000,
			lastHeartbeatAt: now
		});

		// POSITIVE CONTROL: no pulse at all, so its tab is gone and it must still be cleaned up.
		await seedAnalysisRecord(page, {
			id: staleId,
			fileId: `file-${now}`,
			method: 'FEL',
			status: 'running',
			metadata: { executionMode: 'wasm' },
			createdAt: now - 600_000
		});

		// The second tab. Same context, so the same IndexedDB.
		const second = await context.newPage();
		await second.goto('/');
		await second.waitForSelector('.sample-card', { timeout: 60000 });

		// Wait for the sweep to have run, evidenced by the stale record being reaped.
		await expect(async () => {
			const rows = await readStatuses(second);
			expect(statusOf(rows, staleId), 'the interrupted sweep never ran').toBe('interrupted');
		}).toPass({ timeout: 30000 });

		// The live run is what this is all about: still running, still re-runnable by nobody.
		const rows = await readStatuses(second);
		expect(statusOf(rows, liveId), 'the second tab reaped a run another tab is still running').toBe(
			'running'
		);

		await second.close();
	});

	test('leaves a pulse on a real run that another tab can see', async ({ page, context }) => {
		// The other half of the mechanism, and the half a seeded record cannot prove: that a REAL local
		// run stamps `lastHeartbeatAt` into the shared database at all. Without it, the gate in the
		// first test would protect nothing, because no live run would ever carry a pulse.
		//
		// Deliberately NOT written as "start a run, open a tab, race the sweep": every local run on the
		// demo alignments finishes in a few seconds, which is faster than a second tab can load, so
		// that version passes on a broken build too — the completed record is not reapable either way.
		await freshStart(page);
		await loadDemoFile(page, 'small.nex');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });
		await selectMethod(page, 'FEL');

		expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);
		const row = page.locator('[data-testid="run-row"]').first();
		await expect(row).toBeVisible({ timeout: 60000 });

		const second = await context.newPage();
		await second.goto('/');
		await second.waitForSelector('.sample-card', { timeout: 60000 });
		// Give the second tab's onMount sweep time to do its worst.
		await second.waitForTimeout(3000);

		const rows = await readStatuses(second);
		expect(
			rows.filter((r) => r.status === 'interrupted'),
			'the second tab interrupted a run started in another tab'
		).toEqual([]);

		// The pulse itself, read from the second tab — the same database the sweep consults.
		const pulses = await readHeartbeats(second);
		expect(pulses.length, 'no analysis record was written at all').toBeGreaterThan(0);
		for (const p of pulses) {
			expect(p.lastHeartbeatAt, `run ${p.id} left no heartbeat, so any tab would reap it`).toEqual(
				expect.any(Number)
			);
			expect(Date.now() - p.lastHeartbeatAt).toBeLessThan(60_000);
		}

		// And the first tab's run still finishes, on the row where it was started.
		await expect(row).toHaveAttribute('data-status', 'completed', { timeout: 150000 });

		await second.close();
	});
});
