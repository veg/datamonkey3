/**
 * Shared E2E test helpers
 *
 * Consolidated from duplicated helpers in existing specs.
 */

import { expect } from '@playwright/test';
import path from 'path';

// The app uses a single database named 'datamonkey-db' with version 2
// containing stores: 'files' and 'analyses'
const DB_NAME = 'datamonkey-db';
const DB_VERSION = 2;

// Test file paths
export const TEST_FILES = {
	'CD2-slim.fna': path.resolve('static/test-data/CD2-slim.fna'),
	'small.nex': path.resolve('static/test-data/small.nex'),
	'medium.nex': path.resolve('static/test-data/medium.nex'),
	'large.nex': path.resolve('static/test-data/large.nex'),
	'broken-not-an-alignment.txt': path.resolve('src/test-data/broken-not-an-alignment.txt'),
	'stop-codons.fna': path.resolve('static/test-data/validation-tests/stop-codons.fna'),
	'duplicates.fna': path.resolve('static/test-data/validation-tests/duplicates.fna')
};

/**
 * Minimal mock FEL result JSON for seeding tests.
 * Tests only check that UI elements render (cards, viewer, export panel),
 * not the actual analysis data, so a minimal structure suffices.
 */
export const MOCK_FEL_RESULT = JSON.stringify({
	MLE: {
		content: {
			"0": [[1.0, 0.1, 0.3, 5.0, 0.03, 2.0]],
		},
		headers: [
			["alpha", "Mean posterior synonymous substitution rate at a site"],
			["beta", "Mean posterior non-synonymous substitution rate at a site"],
			["alpha=beta", "Mean posterior rate under the neutral model"],
			["LRT", "Likelihood ratio test statistic"],
			["p-value", "Asymptotic p-value from the LRT"],
			["Total branch length", "Total length of branches contributing to inference"]
		]
	},
	input: { "file name": "bglobin.nex", "number of sequences": 10, "number of sites": 25 },
	fits: { "Global MG94xREV": { "Log Likelihood": -1000, "AIC-c": 2100 } },
	tested: { "0": { "FEL": 25 } },
	"data partitions": { "0": { "name": "default", "coverage": [[0, 24]] } }
});

/**
 * Wait for the app to be ready (HyPhy WASM loaded, demo cards visible)
 */
export async function waitForAppReady(page) {
	await page.waitForSelector('.sample-card', { timeout: 60000 });
}

/**
 * Clear all IndexedDB state
 */
export async function clearAllState(page) {
	await page.evaluate((dbName) => {
		return new Promise((resolve, reject) => {
			const req = indexedDB.deleteDatabase(dbName);
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});
	}, DB_NAME);
}

/**
 * Full fresh start: navigate, clear state, reload, wait for ready
 */
export async function freshStart(page) {
	await page.goto('/');
	await clearAllState(page);
	await page.reload();
	await waitForAppReady(page);
}

/**
 * Load a demo file by clicking its sample card
 */
export async function loadDemoFile(page, fileName = 'CD2-slim.fna', { timeout = 30000 } = {}) {
	const fileCard = page.locator('.sample-card').filter({ hasText: fileName });
	await fileCard.click();
	// Wait (web-first) for the datareader to finish: sequence-info is the
	// deterministic post-parse marker (dataReaderResults.svelte).
	await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout });
}

/**
 * Upload a file via the hidden file input
 */
export async function uploadFile(page, filePath) {
	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles(filePath);
	// Wait for datareader processing
	await page.waitForTimeout(3000);
}

/**
 * Navigate to the Analyze tab
 */
export async function goToAnalyzeTab(page) {
	const analyzeTab = page.locator('button:has-text("Analyze")').first();
	if (await analyzeTab.isVisible() && !(await analyzeTab.getAttribute('aria-disabled') === 'true')) {
		await analyzeTab.click();
		await page.waitForTimeout(500);
		return true;
	}
	return false;
}

/**
 * Navigate to the Results tab
 */
export async function goToResultsTab(page) {
	const resultsTab = page.locator('button:has-text("Results")').first();
	if (await resultsTab.isVisible() && !(await resultsTab.getAttribute('aria-disabled') === 'true')) {
		await resultsTab.click();
		await page.waitForTimeout(500);
		return true;
	}
	return false;
}

/**
 * Select a method from the dropdown
 */
export async function selectMethod(page, methodKey) {
	const methodSelect = page.locator('[data-testid="method-dropdown"]');
	await methodSelect.selectOption(methodKey);
	// Web-first: confirm the value committed AND the method panel reconciled
	// (.method-description renders whenever a method is selected).
	await expect(methodSelect).toHaveValue(methodKey);
	await expect(page.locator('.method-description')).toBeVisible({ timeout: 15000 });
}

/**
 * Click the Run Analysis button
 */
export async function clickRunAnalysis(page) {
	const runButton = page.locator('[data-testid="run-analysis-btn"]');
	if (await runButton.isVisible() && await runButton.isEnabled()) {
		await runButton.click();
		return true;
	}
	return false;
}

/**
 * Wait for an analysis to complete by polling the status indicator
 */
export async function waitForAnalysisCompletion(page, maxWaitMs = 150000) {
	// Web-first: retry on Playwright's backoff until the Results tab is enabled
	// AND the status indicator shows a completed (green) analysis. Preserves the
	// boolean contract used by callers.
	try {
		await expect(async () => {
			const resultsTab = page.locator('button:has-text("Results")').first();
			expect(await resultsTab.getAttribute('aria-disabled')).not.toBe('true');
			await expect(
				page.locator('button[aria-label="View all analyses"] .text-green-600')
			).toHaveCount(1);
		}).toPass({ timeout: maxWaitMs });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the status indicator button
 */
export function getStatusIndicator(page) {
	return page.locator('button[aria-label="View all analyses"]');
}

/**
 * Get running count from the status indicator
 */
export async function getRunningCount(page) {
	const indicator = getStatusIndicator(page);
	// Give the indicator a chance to mount before reading (never throw).
	await indicator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
	if (await indicator.count() === 0) return 0;
	const blueText = indicator.locator('.text-blue-600');
	if (await blueText.count() === 0) return 0;
	const text = await blueText.textContent();
	return parseInt(text, 10) || 0;
}

/**
 * Get completed count from the status indicator
 */
export async function getCompletedCount(page) {
	const indicator = getStatusIndicator(page);
	// Give the indicator a chance to mount before reading (never throw).
	await indicator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
	if (await indicator.count() === 0) return 0;
	const greenText = indicator.locator('.text-green-600');
	if (await greenText.count() === 0) return 0;
	const text = await greenText.textContent();
	return parseInt(text, 10) || 0;
}

/**
 * Seed a completed analysis into IndexedDB for fast Results tab testing.
 * Uses the same DB schema as the app: 'datamonkey-db' version 2 with 'files' and 'analyses' stores.
 * Returns the analysis ID.
 *
 * `storedMethod` overrides the exact string written to the `method` column. It exists because the
 * default lowercases, and NO runner does: WasmAnalysisRunner writes method.toUpperCase(),
 * BackendAnalysisRunner writes method.toUpperCase(), AxomemeAnalysisRunner writes 'AXOMEME'. Any
 * assertion about markup gated on the method string therefore has to opt into the production casing
 * or it exercises a branch users never reach. Defaults to null so existing callers are unaffected.
 */
export async function seedCompletedAnalysis(
	page,
	{ resultJson, method = 'FEL', storedMethod = null, fileName = 'bglobin.nex' } = {}
) {
	return await page.evaluate(async ({ resultJson, method, storedMethod, fileName, dbName, dbVersion }) => {
		function openDB() {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open(dbName, dbVersion);
				req.onupgradeneeded = (e) => {
					const db = e.target.result;
					if (!db.objectStoreNames.contains('files')) {
						db.createObjectStore('files', { keyPath: 'id' });
					}
					if (!db.objectStoreNames.contains('analyses')) {
						db.createObjectStore('analyses', { keyPath: 'id' });
					}
				};
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
		}

		const now = Date.now();
		const analysisId = `seeded-${method.toLowerCase()}-${now}`;
		const fileId = `seeded-file-${now}`;

		const db = await openDB();

		// Seed the file record
		const fileTx = db.transaction('files', 'readwrite');
		fileTx.objectStore('files').put({
			id: fileId,
			filename: fileName,
			size: 1024,
			type: 'application/octet-stream',
			uploadedAt: now,
			content: 'seeded-content'
		});
		await new Promise((resolve) => { fileTx.oncomplete = resolve; });

		// Seed the analysis record
		const analysisTx = db.transaction('analyses', 'readwrite');
		analysisTx.objectStore('analyses').put({
			id: analysisId,
			fileId: fileId,
			method: storedMethod ?? method.toLowerCase(),
			status: 'completed',
			result: resultJson,
			createdAt: now - 60000,
			completedAt: now,
			options: {}
		});
		await new Promise((resolve) => { analysisTx.oncomplete = resolve; });

		db.close();
		return analysisId;
	}, { resultJson, method, storedMethod, fileName, dbName: DB_NAME, dbVersion: DB_VERSION });
}
