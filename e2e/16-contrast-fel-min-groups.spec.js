/**
 * E2E test for issue #144: Contrast-FEL must require >= 2 branch groups before
 * submission. With fewer than two groups the downstream HyPhy job core-dumps, so
 * the UI blocks submission (disabled Run button + a clear warning message).
 *
 * This test exercises the actual component wiring (not just the pure validation
 * helper), so it guards against key-casing / reactivity mistakes in the guard.
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

test.describe('Contrast-FEL requires two branch groups (#144)', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);
	});

	test('Run is blocked and a warning shows when no branch groups are tagged', async ({ page }) => {
		await selectMethod(page, 'Contrast-FEL');

		// With no groups tagged, submission must be blocked.
		const runButton = page.locator('[data-testid="run-analysis-btn"]');
		await expect(runButton).toBeDisabled();

		// And a clear, actionable warning must be visible (not just a console log).
		const warning = page.locator('[data-testid="contrast-fel-groups-warning"]');
		await expect(warning).toBeVisible();
		await expect(warning).toContainText(/two or more groups/i);
	});

	test('other methods (FEL) are not affected by the contrast-FEL guard', async ({ page }) => {
		await selectMethod(page, 'FEL');

		// FEL has no such requirement — its Run button should be enabled and no
		// contrast-FEL warning should appear.
		const runButton = page.locator('[data-testid="run-analysis-btn"]');
		await expect(runButton).toBeEnabled();
		await expect(page.locator('[data-testid="contrast-fel-groups-warning"]')).toHaveCount(0);
	});
});
