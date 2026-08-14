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

	// A visualisation REPLACES the raw JSON, it does not sit on top of one. Both halves of that
	// sentence are asserted here on purpose; an earlier version of this file only checked that the
	// viewer was visible, which the buggy page satisfied too.
	test('a method with a visualisation renders no raw JSON dump', async ({ page }) => {
		await openFirstResult(page);

		await expect(page.locator('[data-testid="analysis-viewer"] .hyphy-scope-container')).toBeVisible(
			{ timeout: 10000 }
		);
		await expect(page.locator('[data-testid="analysis-viewer"] .json-display')).toHaveCount(0);
	});

	// The other direction, so the fix above cannot be "simplified" into deleting the dump outright.
	// NRM has no hyphy-scope visualiser (getHyphyScopeVisualization returns null for it), so the raw
	// document IS its result view.
	//
	// This was written as a guard but turns out to be a pin: on the unfixed page 'NRM' IS in the
	// hardcoded whitelist, so it entered a branch whose every child is gated on a HyPhy result shape
	// HyPhy does not emit (`input.file`, an array `fits`, `tested.sites`) and rendered NOTHING —
	// a completed NRM run showed a heading, an export panel and no results at all.
	test('a method with no visualisation keeps the raw JSON dump', async ({ page }) => {
		await freshStart(page);
		await seedCompletedAnalysis(page, {
			resultJson: MOCK_FEL_RESULT,
			method: 'NRM',
			storedMethod: 'NRM',
			fileName: 'nrm-fixture.fasta'
		});
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });
		await openFirstResult(page);

		await expect(page.locator('[data-testid="analysis-viewer"] .json-display')).toBeVisible({
			timeout: 10000
		});
	});

	// The leftover developer panel. Seeded without `test results` so AbsrelVisualizationWrapper takes
	// its own error branch and hyphy-scope's AbsrelVisualization is never handed a mock it would
	// choke on — the panel under test rendered above the visualisation either way.
	test('no aBSREL debug panel above the visualisation', async ({ page }) => {
		await freshStart(page);
		await seedCompletedAnalysis(page, {
			resultJson: JSON.stringify({ input: { 'file name': 'bglobin.nex' } }),
			method: 'ABSREL',
			storedMethod: 'ABSREL',
			fileName: 'bglobin.nex'
		});
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });
		await openFirstResult(page);

		// A closed <details> still renders its <summary>, so count-0 is the right assertion.
		await expect(page.getByText('Debug: aBSREL Data Structure')).toHaveCount(0);
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
