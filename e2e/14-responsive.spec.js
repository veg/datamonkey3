/**
 * E2E tests for mobile responsiveness (Pixel 5 viewport)
 *
 * These tests only run in the mobile-chrome project.
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

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
		await expect(runBtn).toBeVisible();
	});
});
