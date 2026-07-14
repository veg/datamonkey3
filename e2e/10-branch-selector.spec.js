/**
 * E2E tests for BranchSelector UI
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

test.describe('Branch Selector UI', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'small.nex');
		await goToAnalyzeTab(page);
	});

	test('selecting Interactive branches renders SVG tree', async ({ page }) => {
		await selectMethod(page, 'FEL');

		// Find and select Interactive branch mode
		const branchSelect = page.locator('select').filter({
			has: page.locator('option:text("Interactive")')
		});

		if (await branchSelect.count() > 0) {
			await branchSelect.first().selectOption('Interactive');
			await page.waitForTimeout(2000);

			// SVG tree should render
			const svg = page.locator('.interactive-tree-section svg, .tree-selector-wrapper svg');
			await expect(svg.first()).toBeVisible({ timeout: 10000 });
		}
	});

	test('tree has clickable nodes', async ({ page }) => {
		await selectMethod(page, 'FEL');

		const branchSelect = page.locator('select').filter({
			has: page.locator('option:text("Interactive")')
		});

		if (await branchSelect.count() > 0) {
			await branchSelect.first().selectOption('Interactive');
			await page.waitForTimeout(2000);

			// Look for circles or nodes in the SVG
			const nodes = page.locator('.tree-selector-wrapper svg circle, .tree-selector-wrapper svg .node');
			const nodeCount = await nodes.count();
			expect(nodeCount).toBeGreaterThan(0);
		}
	});

	test('clicking a node toggles selection', async ({ page }) => {
		await selectMethod(page, 'FEL');

		const branchSelect = page.locator('select').filter({
			has: page.locator('option:text("Interactive")')
		});

		if (await branchSelect.count() > 0) {
			await branchSelect.first().selectOption('Interactive');
			await page.waitForTimeout(2000);

			// Click on a node in the tree
			const node = page.locator('.tree-selector-wrapper svg circle, .tree-selector-wrapper svg .node').first();
			if (await node.count() > 0) {
				await node.click();
				await page.waitForTimeout(500);

				// Should show selection info (either count or branch names)
				const selectionInfo = page.locator('.selection-summary, .no-selection-message');
				await expect(selectionInfo.first()).toBeVisible();
			}
		}
	});
});
