/**
 * E2E tests for full WASM analysis execution
 *
 * These tests are tagged @slow and run full HyPhy analyses via WebAssembly.
 * They use CD2-slim.fna which is the smallest demo file.
 */

import { test, expect } from '@playwright/test';
import {
	freshStart,
	loadDemoFile,
	goToAnalyzeTab,
	goToResultsTab,
	selectMethod,
	clickRunAnalysis,
	waitForAnalysisCompletion,
	getRunningCount,
	getCompletedCount
} from './fixtures/helpers.js';

test.setTimeout(180000);

test.describe('WASM Analysis Execution @slow', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('FEL analysis end-to-end', async ({ page }) => {
		// Load file
		await loadDemoFile(page, 'CD2-slim.fna');

		// Go to Analyze tab
		const wentToAnalyze = await goToAnalyzeTab(page);
		expect(wentToAnalyze).toBe(true);

		// Select FEL
		await selectMethod(page, 'FEL');

		// Click Run
		const started = await clickRunAnalysis(page);
		expect(started).toBe(true);

		// Status indicator should show running
		await page.waitForTimeout(2000);
		const runningCount = await getRunningCount(page);
		expect(runningCount).toBeGreaterThanOrEqual(1);

		// Wait for completion
		const completed = await waitForAnalysisCompletion(page, 150000);
		expect(completed).toBe(true);

		// Results tab should be enabled
		const resultsTab = page.locator('button:has-text("Results")').first();
		await expect(resultsTab).not.toHaveAttribute('aria-disabled', 'true');

		// Analysis should be in history
		await goToResultsTab(page);
		await page.waitForTimeout(1000);
		const cards = page.locator('[data-testid="analysis-card"]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });

		// Click on the card to view results
		await cards.first().click();
		await page.waitForTimeout(2000);

		// Viewer should render with visualization content
		const viewer = page.locator('[data-testid="analysis-viewer"]');
		await expect(viewer).toBeVisible();
	});

	test('SLAC analysis completes', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');

		const wentToAnalyze = await goToAnalyzeTab(page);
		expect(wentToAnalyze).toBe(true);

		await selectMethod(page, 'SLAC');

		const started = await clickRunAnalysis(page);
		expect(started).toBe(true);

		const completed = await waitForAnalysisCompletion(page, 150000);
		expect(completed).toBe(true);
	});

	test('run button disabled during running analysis', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);
		await selectMethod(page, 'FEL');

		await clickRunAnalysis(page);
		await page.waitForTimeout(1000);

		// Run button should be disabled or show "Starting Analysis..." state
		const runBtn = page.locator('[data-testid="run-analysis-btn"]');
		const isDisabled = await runBtn.isDisabled();
		const text = await runBtn.textContent();
		expect(isDisabled || text.includes('Starting')).toBe(true);
	});
});
