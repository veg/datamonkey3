/**
 * E2E for the run strip (issue #200).
 *
 * AxoMEME is the vehicle purely because it is the fastest run in the product — a few seconds rather
 * than minutes — so this exercises the generic strip without a slow model fit. Nothing here is
 * AxoMEME-specific.
 *
 * The "View results" assertion exists because that link shipped broken in review: it called
 * setCurrentAnalysis and never switched tabs, so clicking it did nothing visible. A test that only
 * checked the button rendered would have passed.
 */
import { test, expect } from './fixtures/coverage.js';
import {
	freshStart,
	loadDemoFile,
	goToAnalyzeTab,
	selectMethod,
	clickRunAnalysis
} from './fixtures/helpers.js';

test.describe('Run strip', () => {
	test.setTimeout(180000);

	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'small.nex');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });
		await selectMethod(page, 'AxoMEME');
	});

	test('a row appears under the Run button and survives the run finishing', async ({ page }) => {
		expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);

		// The row is the point: status where the run was started, without navigating anywhere.
		const row = page.locator('[data-testid="run-row"]').first();
		await expect(row).toBeVisible({ timeout: 60000 });

		await expect(page.getByText(/AXOMEME analysis complete/i)).toBeVisible({ timeout: 120000 });

		// It does NOT self-hide. This is the whole reason it is not AnalysisProgress, which disappears
		// five seconds after completion — exactly wrong for someone who was on another tab.
		await page.waitForTimeout(8000);
		await expect(row, 'the row vanished on a timer').toBeVisible();
		await expect(row).toContainText(/finished in/i);
	});

	test('View results opens that analysis, not whatever was selected before', async ({ page }) => {
		expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);
		await expect(page.getByText(/AXOMEME analysis complete/i)).toBeVisible({ timeout: 120000 });

		const view = page.locator('[data-testid="run-row-view-results"]').first();
		await expect(view).toBeVisible({ timeout: 30000 });
		await view.click();

		// Assert on something that exists ONLY on the Results tab. An earlier version of this test
		// checked the page body for /AXOMEME/, which is trivially satisfied on the Analyze tab by the
		// method selector and the run row itself -- it passed with the navigation removed, which makes
		// it worse than no test. The viewer is the tab's own element.
		const viewer = page.locator('[data-testid="analysis-viewer"]');
		await expect(viewer, 'View results did not open the Results tab').toBeVisible({
			timeout: 30000
		});

		// And it must be THIS analysis. On a fresh upload the prior selection is the invisible
		// datareader job, so landing there would render "DATAREADER Analysis".
		await expect(viewer).toContainText(/AXOMEME/i, { timeout: 30000 });
		await expect(viewer, 'landed on the file-reader job').not.toContainText(/DATAREADER/i);
	});

	test('the Run button is blocked while a local run is in flight', async ({ page }) => {
		expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);

		// Local runs share one Aioli instance and a fixed user.nex, so a second concurrent local run
		// corrupts both. The button used to re-enable on a bare 2s timer regardless of state.
		const runBtn = page.locator('[data-testid="run-analysis-btn"]');
		await expect(runBtn).toBeDisabled({ timeout: 10000 });
	});
});
