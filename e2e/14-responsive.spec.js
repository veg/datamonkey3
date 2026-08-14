/**
 * E2E tests for mobile responsiveness (Pixel 5 viewport)
 *
 * These tests only run in the mobile-chrome project.
 */

import { test, expect } from './fixtures/coverage.js';
import {
	freshStart,
	loadDemoFile,
	goToAnalyzeTab,
	selectMethod,
	seedCompletedAnalysis,
	getStatusIndicator,
	MOCK_FEL_RESULT
} from './fixtures/helpers.js';

test.describe('Mobile Responsiveness', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('demo cards display at mobile width', async ({ page }) => {
		const cards = page.locator('.sample-card');
		await expect(cards.first()).toBeVisible();
		const count = await cards.count();
		expect(count).toBe(4);
	});

	test('tab navigation usable at mobile width', async ({ page }) => {
		// All three tab buttons should be visible
		const dataTab = page.locator('button:has-text("Data")').first();
		const analyzeTab = page.locator('button:has-text("Analyze")').first();
		const resultsTab = page.locator('button:has-text("Results")').first();

		await expect(dataTab).toBeVisible();
		await expect(analyzeTab).toBeVisible();
		await expect(resultsTab).toBeVisible();
	});

	test('file upload works at mobile width', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
	});

	test('method dropdown usable at mobile width', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);

		const dropdown = page.locator('[data-testid="method-dropdown"]');
		await expect(dropdown).toBeVisible();

		await selectMethod(page, 'FEL');

		const runBtn = page.locator('[data-testid="run-analysis-btn"]');
		await expect(runBtn).toBeVisible({ timeout: 10000 });
	});

	test('status indicator is visible without opening the menu', async ({ page }) => {
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });
		await page.reload();
		await page.waitForSelector('.sample-card');

		// The element exists either way — it used to live inside the `hidden … sm:flex` group, so
		// only visibility distinguishes the fixed state. Do not weaken this to toHaveCount.
		await expect(getStatusIndicator(page)).toHaveCount(1);
		await expect(getStatusIndicator(page)).toBeVisible();
	});

	test('activating the indicator closes the mobile menu', async ({ page }) => {
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });
		await page.reload();
		await page.waitForSelector('.sample-card');

		await page.locator('button[aria-controls="mobile-menu"]').click();
		await expect(page.locator('#mobile-menu')).toBeVisible();

		// Plain click, no force: the indicator has to be genuinely actionable with the menu open.
		await getStatusIndicator(page).click();

		await expect(page).toHaveURL(/tab=results/);
		// The URL alone is not a valid pin — the old in-menu copy navigated too. What was broken is
		// that the menu stayed open on top of the destination.
		await expect(page.locator('#mobile-menu')).toHaveCount(0);
	});
});
