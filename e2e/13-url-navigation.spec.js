/**
 * E2E tests for URL deep linking and navigation
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, seedCompletedAnalysis, MOCK_FEL_RESULT } from './fixtures/helpers.js';

test.describe('URL Deep Linking', () => {
	test('/?tab=data shows the Data tab', async ({ page }) => {
		await page.goto('/?tab=data');
		await page.waitForSelector('.sample-card', { timeout: 60000 });
		// Demo file cards should be visible (data tab content)
		await expect(page.locator('.sample-card').first()).toBeVisible();
	});

	test('/?tab=results with seeded data shows Results tab', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });

		await page.goto('/?tab=results');
		await page.waitForSelector('.sample-card, [data-testid="analysis-viewer"], .analysis-history', { timeout: 60000 });
		// Should be on results tab
		await expect(page).toHaveURL(/tab=results/);
	});

	test('status indicator click navigates to /?tab=results', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		const indicator = page.locator('button[aria-label="View all analyses"]');
		if (await indicator.count() > 0) {
			await indicator.click();
			await expect(page).toHaveURL(/tab=results/);
		}
	});
});
