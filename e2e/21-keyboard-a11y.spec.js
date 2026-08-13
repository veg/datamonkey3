/**
 * E2E tests for keyboard operability of file selection and the Analyze panel.
 *
 * Deliberately NOT in MOBILE_SPECS: keyboard behaviour is width-independent, so this belongs in
 * the fast chromium project.
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, loadDemoFile, goToAnalyzeTab } from './fixtures/helpers.js';

test.describe('Keyboard accessibility', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('the disabled Analyze tab explains itself without hover', async ({ page }) => {
		// Asserting the dedicated testid, not page-body text: the unfixed page already renders
		// "Upload a file in the Data tab to run analyses", so a loose text assertion would pass
		// either way and pin nothing.
		await expect(page.getByTestId('tab-gate-hint')).toHaveText(
			'Load a file on the Data tab to unlock Analyze.'
		);
	});

	test('the tab bar exposes tablist semantics', async ({ page }) => {
		await expect(page.getByRole('tab', { name: /Data/ })).toHaveAttribute('aria-selected', 'true');
	});

	test('a file can be selected with the keyboard alone', async ({ page }) => {
		// Load two files, then target the one that is NOT current: loading small.nex second makes it
		// the active file, so pressing Enter on the CD2-slim card has to actually change something.
		// Targeting an already-active card would let the aria-current assertion pass trivially.
		await loadDemoFile(page, 'CD2-slim.fna');
		await loadDemoFile(page, 'small.nex');

		const card = page.locator('.file-card').filter({ hasText: 'CD2-slim.fna' });
		const select = card.getByTestId('file-select');
		await expect(select).not.toHaveAttribute('aria-current', 'true');

		// locator.press() focuses the element and then types — keyboard only, and atomic, so a
		// re-render of the file list between focus and keypress cannot silently drop the focus.
		await select.press('Enter');

		await expect(select).toHaveAttribute('aria-current', 'true');
		await expect(card.getByTestId('file-selected-chip')).toBeVisible();

		// Selection must come BEFORE the destructive Delete in tab order; it used to come after.
		await select.press('Tab');
		await expect(page.locator(':focus')).toHaveAttribute('aria-label', /details/i);
	});

	test('the Analyze panel collapses and re-expands from the keyboard', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);

		const t = page.getByTestId('analysis-section-toggle');
		await expect(t).toHaveAttribute('aria-expanded', 'true');

		await t.focus();
		await page.keyboard.press('Enter');
		await expect(t).toHaveAttribute('aria-expanded', 'false');
		await expect(page.getByTestId('method-dropdown')).toHaveCount(0);

		// The second Enter is the bug itself: a section collapsed by mouse used to be permanently
		// shut for a keyboard user, because the only toggle was a click handler on a bare div.
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('method-dropdown')).toBeVisible();
	});
});
