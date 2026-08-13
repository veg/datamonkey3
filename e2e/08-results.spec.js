/**
 * E2E tests for Results tab (using seeded data)
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, seedCompletedAnalysis, MOCK_FEL_RESULT } from './fixtures/helpers.js';

/** Open the Results tab and select the first analysis card. */
async function openFirstResult(page) {
	await page.locator('button:has-text("Results")').first().click();
	const card = page.locator('[data-testid="analysis-card"]').first();
	await expect(card).toBeVisible({ timeout: 10000 });
	await card.click();
	await expect(page.locator('[data-testid="analysis-viewer"]')).toBeVisible({ timeout: 10000 });
}

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

	// Replaces 'View in HyPhy-eye button present', which asserted the button if it was there and the
	// viewer if it was not — it could not fail. It could not even have detected the button: the seed
	// helper lowercases, and the markup was gated on a case-sensitive list of uppercase method names.
	//
	// storedMethod is UPPERCASE deliberately, because that is what every runner persists
	// (WasmAnalysisRunner/BackendAnalysisRunner call method.toUpperCase()). Lowercasing it back to the
	// helper default would make all three assertions pass on the unfixed page and quietly neuter this.
	test('completed results carry no hyphy-eye link', async ({ page }) => {
		await freshStart(page);
		await seedCompletedAnalysis(page, {
			resultJson: MOCK_FEL_RESULT,
			method: 'FEL',
			storedMethod: 'FEL',
			fileName: 'bglobin.nex'
		});
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });
		await openFirstResult(page);

		await expect(page.getByRole('button', { name: /View in HyPhy-eye/i })).toHaveCount(0);
		await expect(page.getByText(/automatically shared via localStorage/i)).toHaveCount(0);
		// The other arm: a manual-upload link, shown for exactly the methods hyphy-eye has no page for.
		await expect(page.locator('[data-testid="analysis-viewer"] a[href*="hyphy"]')).toHaveCount(0);
	});
});
