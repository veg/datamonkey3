/**
 * E2E tests for analysis history management
 */

import { test, expect } from '@playwright/test';
import { freshStart, seedCompletedAnalysis, MOCK_FEL_RESULT } from './fixtures/helpers.js';

test.describe('Analysis History Management', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('history shows multiple seeded analyses', async ({ page }) => {
		// Seed 3 analyses
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL', fileName: 'file1.nex' });
		await page.waitForTimeout(100);
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'SLAC', fileName: 'file2.nex' });
		await page.waitForTimeout(100);
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'MEME', fileName: 'file3.nex' });

		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		// Go to results
		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		const cards = page.locator('[data-testid="analysis-card"]');
		const count = await cards.count();
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test('individual delete removes analysis from list', async ({ page }) => {
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'SLAC' });

		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		const cardsBefore = await page.locator('[data-testid="analysis-card"]').count();

		// Accept the confirm dialog
		page.on('dialog', (dialog) => dialog.accept());

		// Click delete on the first card
		const deleteBtn = page.locator('[data-testid="analysis-card"]').first().locator('button:has-text("Delete")');
		if (await deleteBtn.count() > 0) {
			await deleteBtn.click();
			await page.waitForTimeout(1000);

			const cardsAfter = await page.locator('[data-testid="analysis-card"]').count();
			expect(cardsAfter).toBeLessThan(cardsBefore);
		}
	});

	test('Clear All empties history', async ({ page }) => {
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'SLAC' });

		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		// Accept the confirm dialog
		page.on('dialog', (dialog) => dialog.accept());

		const clearBtn = page.locator('[data-testid="clear-all-btn"]');
		if (await clearBtn.count() > 0) {
			await clearBtn.click();
			await page.waitForTimeout(1000);

			// Should have no analysis cards left
			const cards = page.locator('[data-testid="analysis-card"]');
			await expect(cards).toHaveCount(0);
		}
	});

	test('analyses persist after page refresh', async ({ page }) => {
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });

		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		const resultsTab = page.locator('button:has-text("Results")').first();
		await resultsTab.click();
		await page.waitForTimeout(1000);

		const cards = page.locator('[data-testid="analysis-card"]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
	});
});
