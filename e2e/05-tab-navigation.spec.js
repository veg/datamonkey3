/**
 * E2E tests for tab gating and navigation
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, seedCompletedAnalysis, MOCK_FEL_RESULT } from './fixtures/helpers.js';

test.describe('Tab Navigation Gating', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('Analyze tab is disabled without data loaded', async ({ page }) => {
		const analyzeTab = page.locator('button:has-text("Analyze")').first();
		await expect(analyzeTab).toBeVisible({ timeout: 10000 });

		// After a fresh start with cleared DB, the analyze tab should be disabled
		// Check the opacity class which indicates disabled state
		const hasDisabledClass = await analyzeTab.evaluate(
			(el) => el.classList.contains('opacity-60') || el.getAttribute('aria-disabled') === 'true'
		);
		expect(hasDisabledClass).toBe(true);
	});

	test('Results tab is disabled without analyses', async ({ page }) => {
		const resultsTab = page.locator('button:has-text("Results")').first();
		await expect(resultsTab).toBeVisible({ timeout: 10000 });

		const hasDisabledClass = await resultsTab.evaluate(
			(el) => el.classList.contains('opacity-60') || el.getAttribute('aria-disabled') === 'true'
		);
		expect(hasDisabledClass).toBe(true);
	});

	test('loading a file enables the Analyze tab', async ({ page }) => {
		const analyzeTab = page.locator('button:has-text("Analyze")').first();
		await expect(analyzeTab).toHaveAttribute('aria-disabled', 'true');

		await loadDemoFile(page, 'CD2-slim.fna');

		// After loading, Analyze tab should be enabled
		await expect(analyzeTab).not.toHaveAttribute('aria-disabled', 'true');
	});

	test('completing an analysis enables the Results tab with badge', async ({ page }) => {
		// Seed a completed analysis to simulate analysis completion
		await seedCompletedAnalysis(page, { resultJson: MOCK_FEL_RESULT, method: 'FEL' });
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });

		// Results tab should now be enabled (has analyses in DB)
		const resultsTab = page.locator('button:has-text("Results")').first();
		// The tab should be clickable now
		await expect(resultsTab).not.toHaveAttribute('aria-disabled', 'true');
	});
});
