/**
 * A configuration must survive looking at another tab.
 *
 * +page.svelte mounts <AnalyzeTab> inside {#if activeTab === 'analyze'}, so Svelte destroys it — and
 * every local in MethodSelector — on every tab switch. Choosing MEME, setting its rate classes, then
 * glancing at Results used to drop all of it on the floor: the dropdown came back on "Select an
 * analysis method" as though nothing had been chosen.
 *
 * The assertions here are the SELECT'S VALUE and a specific input's value, never page-body text. The
 * string "MEME" is present in the option list either way, so a text assertion would pass on the
 * broken build — which is exactly the trap this suite has fallen into before.
 */

import { test, expect } from './fixtures/coverage.js';
import {
	freshStart,
	loadDemoFile,
	goToAnalyzeTab,
	goToResultsTab,
	selectMethod
} from './fixtures/helpers.js';

/** The number input rendered for an advanced option, found by its label. */
const optionInput = (page, label) =>
	page.locator('label.option-label', { hasText: label }).locator('input');

/**
 * An interrupted MEME run against the file the page has loaded, carrying the settings it was
 * configured with — the shape WasmAnalysisRunner persists (`parameters` IS the UI config).
 */
async function seedInterruptedMeme(page) {
	return await page.evaluate(async () => {
		const db = await new Promise((resolve, reject) => {
			const req = indexedDB.open('datamonkey-db', 2);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		const files = await new Promise((resolve, reject) => {
			const req = db.transaction('files', 'readonly').objectStore('files').getAll();
			req.onsuccess = () => resolve(req.result || []);
			req.onerror = () => reject(req.error);
		});
		const fileId = files[files.length - 1]?.id;
		const id = `seeded-meme-${Date.now()}`;
		const tx = db.transaction('analyses', 'readwrite');
		tx.objectStore('analyses').put({
			id,
			fileId,
			method: 'MEME',
			status: 'interrupted',
			createdAt: Date.now(),
			metadata: {
				executionMode: 'wasm',
				arguments: {
					parameters: { geneticCode: 'Universal', rates: 6, pvalue: 0.05 }
				}
			}
		});
		await new Promise((resolve) => {
			tx.oncomplete = resolve;
		});
		db.close();
		return id;
	});
}

test.describe('analysis configuration', () => {
	test.setTimeout(120000);

	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'small.nex');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });
	});

	test('survives a round trip through the Results tab', async ({ page }) => {
		await selectMethod(page, 'MEME');

		const rates = optionInput(page, 'Rate classes');
		await expect(rates).toHaveValue('2');
		await rates.fill('5');
		await rates.dispatchEvent('input');
		await expect(rates).toHaveValue('5');

		await goToResultsTab(page);
		await goToAnalyzeTab(page);

		// The dropdown's VALUE, not the presence of the word MEME anywhere on the page.
		await expect(page.locator('[data-testid="method-dropdown"]')).toHaveValue('MEME');
		// And the option the user actually changed, not merely the method.
		await expect(optionInput(page, 'Rate classes')).toHaveValue('5');
	});

	test('Re-run brings back the settings that run was configured with', async ({ page }) => {
		// The whole chain: AnalysisCard dispatches the analysisId, AnalysisHistory forwards it,
		// +page.svelte looks the record up and hands it to analysisConfig.restoreFrom, MethodSelector
		// hydrates from the store. Before this, every hop but the last existed and the settings were
		// still dropped: AnalyzeTab took a `selectedMethod` prop and never forwarded it.
		await seedInterruptedMeme(page);
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		// Results tab carries the history, and an interrupted run is the case that offers Re-run.
		await goToResultsTab(page);
		const rerun = page.getByRole('button', { name: /Re-run/i }).first();
		await expect(rerun).toBeVisible({ timeout: 30000 });
		await rerun.click();

		await expect(page.locator('[data-testid="method-dropdown"]')).toHaveValue('MEME', {
			timeout: 30000
		});
		// The settings, not just the method — this is the part "Re-run" never used to do.
		await expect(optionInput(page, 'Rate classes')).toHaveValue('6');
		await expect(page.locator('[data-testid="restored-settings-notice"]')).toContainText(
			/rate classes 6/i
		);
	});

	test('still resets options when the user switches methods', async ({ page }) => {
		// The store keeps one option bag PER METHOD, exactly as the component's own state did, so
		// choosing a different method must still show that method's own defaults.
		await selectMethod(page, 'MEME');
		await optionInput(page, 'Rate classes').fill('7');

		await selectMethod(page, 'FEL');
		await expect(page.locator('label.option-label', { hasText: 'Rate classes' })).toHaveCount(0);

		await selectMethod(page, 'MEME');
		await expect(optionInput(page, 'Rate classes')).toHaveValue('7');
	});
});
