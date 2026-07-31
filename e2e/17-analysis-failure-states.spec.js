/**
 * E2E tests for failure-state rendering in the analysis history / cards.
 *
 * The existing history spec (09) only seeds `completed` analyses, so the
 * error / connection_lost / interrupted / cancelled status branches in
 * AnalysisCard.svelte (badge class + label + icon) and the empty-history
 * branch in AnalysisHistory.svelte were never exercised in the browser.
 * These seed each failure status and assert the card renders the right label.
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, seedAnalysisWithStatus } from './fixtures/helpers.js';

test.describe('Analysis failure-state rendering', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	async function openResults(page) {
		await page.reload();
		await page.waitForSelector('.sample-card', { timeout: 60000 });
		await page.locator('button:has-text("Results")').first().click();
	}

	// status seeded -> [card badge label, detail-view "Status: <raw>" text].
	// The detail view is deterministic (the single seeded analysis is auto-
	// selected); the card badge is the label branch in AnalysisCard.svelte.
	const CASES = [
		{ status: 'error', method: 'FEL', label: 'error', raw: 'error' },
		{ status: 'connection_lost', method: 'SLAC', label: 'Connection Lost', raw: 'connection_lost' },
		{ status: 'interrupted', method: 'MEME', label: 'Interrupted', raw: 'interrupted' },
		{ status: 'cancelled', method: 'FUBAR', label: 'Cancelled', raw: 'cancelled' }
	];

	for (const { status, method, label, raw } of CASES) {
		test(`${status} analysis renders its status in card + detail view`, async ({ page }) => {
			await seedAnalysisWithStatus(page, { status, method, error: `seeded ${status}` });
			await openResults(page);

			// Deterministic: the selected analysis' detail view echoes the raw status.
			await expect(page.getByText(`Status: ${raw}`)).toBeVisible({ timeout: 15000 });

			// The card badge renders the human label for this status branch.
			const card = page.locator('[data-testid="analysis-card"]').first();
			await expect(card).toBeVisible({ timeout: 15000 });
			await expect(card.getByText(label, { exact: true })).toBeVisible({ timeout: 15000 });
		});
	}
});
