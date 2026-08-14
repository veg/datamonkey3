/**
 * E2E test for the branch-selection LIST view.
 *
 * This pins the actual complaint behind item 6.5 rather than the geometry: RELAX refuses to run
 * until TEST and REFERENCE branches are tagged, and until now the only way to tag them was to click
 * a phylotree SVG — mouse-only, and unusable below ~700px. The list is a second rendering of the
 * same phylotree state, so it must be able to make the Run button live.
 *
 * Width-independent, so it belongs in the fast chromium project, not MOBILE_SPECS.
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

test.describe('Branch selection list view', () => {
	test('RELAX becomes runnable using only the list view', async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'small.nex');
		await goToAnalyzeTab(page);
		await selectMethod(page, 'RELAX');

		const runBtn = page.locator('[data-testid="run-analysis-btn"]');
		await expect(runBtn).toBeDisabled();
		await expect(
			page.locator('text=Please select TEST and REFERENCE branches on the tree before running RELAX.')
		).toBeVisible();

		await page.locator('[data-testid="branch-view-list"]').click();
		const rows = page.locator('[data-testid="branch-row-select"]');
		await expect(rows.first()).toBeVisible({ timeout: 10000 });
		expect(await rows.count()).toBeGreaterThan(1);

		await rows.nth(0).selectOption('TEST');
		await rows.nth(1).selectOption('REFERENCE');

		await expect(runBtn).toBeEnabled({ timeout: 10000 });
		await expect(
			page.locator('text=Please select TEST and REFERENCE branches on the tree before running RELAX.')
		).toHaveCount(0);
	});

	test('reassigning a branch in the list moves its tag rather than adding one', async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'small.nex');
		await goToAnalyzeTab(page);
		await selectMethod(page, 'RELAX');

		await page.locator('[data-testid="branch-view-list"]').click();
		const rows = page.locator('[data-testid="branch-row-select"]');
		await expect(rows.first()).toBeVisible({ timeout: 10000 });

		await rows.nth(0).selectOption('TEST');
		await expect(rows.nth(0)).toHaveValue('TEST');

		// Sets are mutually exclusive: the second assignment has to replace the first, not stack.
		await rows.nth(0).selectOption('REFERENCE');
		await expect(rows.nth(0)).toHaveValue('REFERENCE');

		// With every tagged branch in REFERENCE there is no TEST set, so RELAX stays blocked.
		await expect(page.locator('[data-testid="run-analysis-btn"]')).toBeDisabled();
	});
});
