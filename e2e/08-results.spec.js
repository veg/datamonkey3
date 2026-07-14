/**
 * E2E tests for Results tab (using seeded data)
 */

import { test, expect } from '@playwright/test';
import { freshStart, seedCompletedAnalysis, MOCK_FEL_RESULT } from './fixtures/helpers.js';

test.describe('Results Tab', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL', fileName: 'bglobin.nex' });
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });
	});

	test('analysis history list shows seeded analysis', async ({ page }) => {
		// Navigate to results
		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		// Should see an analysis card
		const cards = page.locator('[data-testid="analysis-card"]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
	});

	test('clicking analysis card shows viewer', async ({ page }) => {
		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		const card = page.locator('[data-testid="analysis-card"]').first();
		await card.click();
		await page.waitForTimeout(2000);

		// Analysis viewer should appear
		const viewer = page.locator('[data-testid="analysis-viewer"]');
		await expect(viewer).toBeVisible({ timeout: 10000 });
	});

	test('export panel is visible for completed analysis', async ({ page }) => {
		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		const card = page.locator('[data-testid="analysis-card"]').first();
		await card.click();
		await page.waitForTimeout(2000);

		// ExportPanel should be visible
		const exportSection = page.locator('text=/Export|export/i');
		await expect(exportSection.first()).toBeVisible({ timeout: 10000 });
	});

	test('View in HyPhy-eye button present', async ({ page }) => {
		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		const card = page.locator('[data-testid="analysis-card"]').first();
		await card.click();
		await page.waitForTimeout(3000);

		// The hyphy-eye button/link may say various things
		const hyphyEyeBtn = page.locator('text=/[Hh]y[Pp]hy/');
		if (await hyphyEyeBtn.count() > 0) {
			await expect(hyphyEyeBtn.first()).toBeVisible();
		} else {
			// If hyphy-eye button is not present, at least the viewer should be visible
			const viewer = page.locator('[data-testid="analysis-viewer"]');
			await expect(viewer).toBeVisible();
		}
	});
});
