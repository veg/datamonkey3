/**
 * E2E test for the AxoMEME MEME pre-screen gate badge.
 *
 * The gate runs client-side (onnxruntime-web) and renders a GREEN/YELLOW/RED advisory
 * above the runtime estimate — but ONLY for MEME, and only when a branch-length tree
 * exists (DM3 infers an NJ tree with lengths at upload). This can only be verified in a
 * real browser (the vitest toolchain here doesn't mount Svelte components), so it lives
 * in the e2e layer.
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

test.describe('MEME pre-screen gate', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);
		// Ensure the method dropdown is present before any selectOption (avoids a
		// race under load where the WASM-heavy page hasn't rendered the selector yet).
		await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 30000 });
	});

	test('shows a tier badge above the timing estimate when MEME is selected', async ({ page }) => {
		await selectMethod(page, 'MEME');

		// The gate loads onnxruntime-web + the model, then renders. Give it generous time.
		const badge = page.locator('[data-testid="prescreen-gate"]');
		await expect(badge).toBeVisible({ timeout: 30000 });

		// It carries a valid tier and the pre-screen label.
		const tier = await badge.getAttribute('data-tier');
		expect(['GREEN', 'YELLOW', 'RED']).toContain(tier);
		await expect(badge).toContainText('MEME pre-screen');

		// It sits ABOVE the timing estimate in the DOM (advisory-first ordering).
		const timing = page.locator('.timing-estimate').first();
		if (await timing.count()) {
			const order = await page.evaluate(() => {
				const g = document.querySelector('[data-testid="prescreen-gate"]');
				const t = document.querySelector('.timing-estimate');
				if (!g || !t) return null;
				// Node.DOCUMENT_POSITION_FOLLOWING (4) means t comes after g.
				return g.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING ? 'gate-first' : 'timing-first';
			});
			expect(order).toBe('gate-first');
		}
	});

	test('does NOT show the badge for a non-MEME method (FEL)', async ({ page }) => {
		await selectMethod(page, 'FEL');
		// Give the same time budget the gate would need, then assert it never appears.
		await page.waitForTimeout(3000);
		await expect(page.locator('[data-testid="prescreen-gate"]')).toHaveCount(0);
	});
});
