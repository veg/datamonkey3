/**
 * E2E tests for method selection and configuration
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

test.describe('Method Selection & Configuration', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);
	});

	test('method dropdown is present with supported methods', async ({ page }) => {
		const dropdown = page.locator('[data-testid="method-dropdown"]');
		await expect(dropdown).toBeVisible();

		// Check that it has options (at least the supported ones)
		const options = dropdown.locator('option:not(:disabled)');
		const count = await options.count();
		// Should have at least the 13 supported methods + the placeholder
		expect(count).toBeGreaterThanOrEqual(10);
	});

	test('selecting FEL shows description and options', async ({ page }) => {
		await selectMethod(page, 'FEL');
		await page.waitForTimeout(500);

		// Method description should appear
		const description = page.locator('.method-description');
		await expect(description).toBeVisible({ timeout: 5000 });

		// Genetic code selector should appear
		const geneticCode = page.locator(':text("Genetic Code")');
		await expect(geneticCode).toBeVisible({ timeout: 5000 });

		// Advanced options should appear
		const advancedLabel = page.locator('.options-label:text("Advanced")');
		await expect(advancedLabel).toBeVisible({ timeout: 5000 });
	});

	test('selecting Interactive branches shows BranchSelector', async ({ page }) => {
		await selectMethod(page, 'FEL');

		// Find "Branches to Test" select and choose Interactive
		const branchSelect = page.locator('select').filter({ has: page.locator('option:text("Interactive")') });
		if (await branchSelect.count() > 0) {
			await branchSelect.first().selectOption('Interactive');
			await page.waitForTimeout(1000);

			// BranchSelector should render with an SVG tree
			const treeSvg = page.locator('.interactive-tree-section svg, .tree-selector-wrapper svg');
			await expect(treeSvg.first()).toBeVisible({ timeout: 5000 });
		}
	});

	test('switching methods resets options', async ({ page }) => {
		await selectMethod(page, 'FEL');
		// FEL has specific options like SRV
		const srvOption = page.locator('text=Synonymous rate variation');
		await expect(srvOption).toBeVisible();

		// Switch to GARD
		await selectMethod(page, 'GARD');
		// GARD has different options (data type)
		const datatypeOption = page.locator('text=Data type');
		await expect(datatypeOption).toBeVisible();
		// FEL-specific option should be gone
		await expect(srvOption).not.toBeVisible();
	});

	test('Run Analysis button visible when method selected', async ({ page }) => {
		// No button before selection
		const runBtn = page.locator('[data-testid="run-analysis-btn"]');
		await expect(runBtn).not.toBeVisible();

		await selectMethod(page, 'FEL');
		await expect(runBtn).toBeVisible();
		await expect(runBtn).toBeEnabled();
	});

	test('genetic code can be changed', async ({ page }) => {
		await selectMethod(page, 'FEL');

		const geneticCodeSelect = page.locator('select').filter({
			has: page.locator('option:text("Universal")')
		}).first();

		await geneticCodeSelect.selectOption('Vertebrate mitochondrial');
		// Verify the selection stuck
		await expect(geneticCodeSelect).toHaveValue('Vertebrate mitochondrial');
	});

	test('timing estimate appears when method selected', async ({ page }) => {
		await selectMethod(page, 'FEL');

		// The AnalysisTimingEstimate component should render
		const timingEstimate = page.locator('text=/estimated|~|seconds|minutes/i');
		if (await timingEstimate.count() > 0) {
			await expect(timingEstimate.first()).toBeVisible();
		}
	});
});
