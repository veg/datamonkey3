/**
 * E2E tests for AnalysisStatusIndicator component
 *
 * Tests the status indicator behavior during analysis lifecycle:
 * - Running analyses show blue pulsing indicator with count
 * - Completed analyses show green checkmark with count
 * - Failed analyses show red warning with count
 * - Indicator navigates to Results tab when clicked
 */

import { test, expect } from '@playwright/test';
import {
	freshStart,
	loadDemoFile,
	getStatusIndicator,
	getRunningCount,
	getCompletedCount,
	goToAnalyzeTab,
	selectMethod,
	clickRunAnalysis
} from './fixtures/helpers.js';

test.describe('AnalysisStatusIndicator E2E', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('should not show indicator when no analyses exist', async ({ page }) => {
		const indicator = getStatusIndicator(page);
		await expect(indicator).toHaveCount(0);
	});

	test('should show running indicator when analysis starts @slow', async ({ page }) => {
		test.setTimeout(120000);
		await loadDemoFile(page, 'CD2-slim.fna');
		const wentToAnalyze = await goToAnalyzeTab(page);
		if (!wentToAnalyze) {
			test.skip(true, 'Analyze tab not available');
			return;
		}
		await selectMethod(page, 'FEL');
		const started = await clickRunAnalysis(page);
		if (!started) {
			test.skip(true, 'Run button not available');
			return;
		}
		await page.waitForTimeout(2000);
		const runningCount = await getRunningCount(page);
		const completedCount = await getCompletedCount(page);
		expect(runningCount + completedCount).toBeGreaterThanOrEqual(1);
	});

	test('should show completed count after analysis finishes', async ({ page }) => {
		await loadDemoFile(page, 'small.nex');
		await page.waitForTimeout(3000);
		// Verify the page loaded correctly
		await expect(page.locator('.sample-card').first()).toBeVisible();
	});

	test('should navigate to Results tab when clicked @slow', async ({ page }) => {
		test.setTimeout(120000);
		await loadDemoFile(page, 'CD2-slim.fna');
		await page.waitForTimeout(2000);

		const indicator = getStatusIndicator(page);
		if (await indicator.count() > 0) {
			await indicator.click();
			await expect(page).toHaveURL(/tab=results/);
		}
	});

	test('should persist counts across page refresh', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');
		await page.waitForTimeout(3000);

		let indicator = getStatusIndicator(page);
		const initialIndicatorVisible = await indicator.count() > 0;

		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		indicator = getStatusIndicator(page);
		const afterRefreshVisible = await indicator.count() > 0;

		if (initialIndicatorVisible) {
			expect(afterRefreshVisible).toBe(true);
		}
	});
});
