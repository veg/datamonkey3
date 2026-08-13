/**
 * E2E tests for BranchSelector UI
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

/**
 * Turn on Interactive branch selection and make sure the TREE view is showing.
 *
 * Below ~700px the component now opens in list view, because the tree is not a usable control at
 * that size. These specs are about the tree itself, so they ask for it explicitly rather than
 * depending on a width-derived default — at desktop width the button is already active and the
 * click is a no-op.
 */
async function showInteractiveTree(page) {
	const branchSelect = page.locator('select').filter({
		has: page.locator('option:text("Interactive")')
	});
	await branchSelect.first().selectOption('Interactive');

	// Tolerate the toggle being absent on purpose: if this helper hard-required it, every assertion
	// below would fail with "no such element" instead of failing on the geometry it is meant to pin.
	const treeBtn = page.locator('[data-testid="branch-view-tree"]');
	if (await treeBtn.count()) {
		await treeBtn.click();
	}
}

test.describe('Branch Selector UI', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'small.nex');
		await goToAnalyzeTab(page);
	});

	test('selecting Interactive branches renders SVG tree', async ({ page }) => {
		await selectMethod(page, 'FEL');
		await showInteractiveTree(page);

		// SVG tree should render (web-first; no fixed wait needed).
		const svg = page.locator('.interactive-tree-section svg, .tree-selector-wrapper svg');
		await expect(svg.first()).toBeVisible({ timeout: 10000 });
	});

	test('tree has clickable nodes', async ({ page }) => {
		await selectMethod(page, 'FEL');
		await showInteractiveTree(page);

		// Web-first: wait for the SVG tree to render at least one node.
		const nodes = page.locator('.tree-selector-wrapper svg circle, .tree-selector-wrapper svg .node');
		await expect(nodes.first()).toBeVisible({ timeout: 10000 });
		expect(await nodes.count()).toBeGreaterThan(0);
	});

	test('clicking a node toggles selection', async ({ page }) => {
		await selectMethod(page, 'FEL');
		await showInteractiveTree(page);

		// Web-first: wait for a node to render before clicking.
		const node = page.locator('.tree-selector-wrapper svg circle, .tree-selector-wrapper svg .node').first();
		await expect(node).toBeVisible({ timeout: 10000 });
		await node.scrollIntoViewIfNeeded();
		// No force:true. This used to bypass the actionability check because the r=3 node was too
		// small to be hit reliably at mobile width; the node is now r>=6 and the tree no longer
		// overflows, so a plain click has to pass. Reverting the radius/pan-box work makes this
		// time out, which is the point of removing the escape hatch.
		await node.click();

		// Should show selection info (either count or branch names).
		const selectionInfo = page.locator('.selection-summary, .no-selection-message');
		await expect(selectionInfo.first()).toBeVisible({ timeout: 10000 });
	});

	test('the tree does not push the page sideways', async ({ page }) => {
		await selectMethod(page, 'FEL');

		// Compare the document width WITHOUT the tree to the width WITH it, rather than asserting an
		// absolute zero: the page already has unrelated horizontal overflow at Pixel 5 width (the
		// method dropdown and the toast container both exceed 393px), which is a separate defect and
		// would make an absolute assertion fail for reasons this item does not own. What must hold is
		// that RENDERING THE TREE WIDENS NOTHING. Measured on unmodified main: 512px before, 1086px
		// after — the BranchSelector was mounted at a hard 1000px inside containers that never clip.
		const widthBefore = await page.evaluate(() => document.documentElement.scrollWidth);

		await showInteractiveTree(page);
		await expect(page.locator('.tree-selector-wrapper svg').first()).toBeVisible({
			timeout: 10000
		});

		const widthAfter = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(widthAfter).toBeLessThanOrEqual(widthBefore);

		// ...and it must be contained by PANNING, not by squashing the tree down to phone width,
		// which would make it unreadable instead of unreachable.
		const pan = await page.evaluate(() => {
			const el = document.querySelector('.tree-pan');
			if (!el) return null;
			return {
				clientWidth: el.clientWidth,
				scrollWidth: el.scrollWidth,
				viewport: document.documentElement.clientWidth
			};
		});
		expect(pan).not.toBeNull();
		expect(pan.clientWidth).toBeLessThanOrEqual(pan.viewport);

		// This spec runs in both projects. Only below BranchSelector's minWidth (640) is the tree
		// drawn wider than its box; at desktop width it fits, and scrollWidth === clientWidth is the
		// correct result rather than a regression.
		if (pan.clientWidth < 640) {
			expect(pan.scrollWidth).toBeGreaterThan(pan.clientWidth);
		}
	});

	test('tree nodes are large enough to tap', async ({ page }) => {
		await selectMethod(page, 'FEL');
		await showInteractiveTree(page);

		const node = page.locator('.tree-selector-wrapper svg circle').first();
		await expect(node).toBeVisible({ timeout: 10000 });

		// Web-first: the radius pass runs in a requestAnimationFrame after phylotree draws, so poll
		// rather than sampling once and racing the frame.
		await expect
			.poll(async () => Number(await node.getAttribute('r')), { timeout: 10000 })
			.toBeGreaterThanOrEqual(6);
	});

	test('narrow viewports open in list view, which is keyboard operable', async ({ page }) => {
		await selectMethod(page, 'FEL');

		const branchSelect = page.locator('select').filter({
			has: page.locator('option:text("Interactive")')
		});
		await branchSelect.first().selectOption('Interactive');

		const listBtn = page.locator('[data-testid="branch-view-list"]');
		await expect(listBtn).toBeVisible({ timeout: 10000 });

		// The default depends on width, and only the narrow case is a behaviour claim: a phone must
		// not land on a control it cannot operate.
		const viewport = page.viewportSize()?.width ?? 0;
		if (viewport < 700) {
			await expect(listBtn).toHaveAttribute('aria-pressed', 'true');
			await expect(page.locator('[data-testid="branch-list"]')).toBeVisible();
		}
	});
});
