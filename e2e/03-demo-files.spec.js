/**
 * E2E tests for demo file loading
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile } from './fixtures/helpers.js';

test.describe('Demo File Loading', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('CD2-slim.fna demo loads successfully', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
	});

	test('small.nex demo loads successfully', async ({ page }) => {
		await loadDemoFile(page, 'small.nex');

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
	});

	test('medium.nex demo loads successfully', async ({ page }) => {
		await loadDemoFile(page, 'medium.nex');

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
	});

	test('large.nex demo loads successfully', async ({ page }) => {
		test.setTimeout(90000);
		await loadDemoFile(page, 'large.nex');

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 30000 });
	});

	test('loading a demo file enables the Analyze tab', async ({ page }) => {
		const analyzeTab = page.locator('button:has-text("Analyze")').first();
		await expect(analyzeTab).toHaveAttribute('aria-disabled', 'true');

		await loadDemoFile(page, 'CD2-slim.fna');

		await expect(analyzeTab).not.toHaveAttribute('aria-disabled', 'true');
	});

	test('sequence info shows correct data after load', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
		// The component should at least show "Alignment File Metrics" header
		await expect(seqInfo).toContainText('Alignment File Metrics');
		// It should show a status badge (Tree Included or No Tree Detected)
		const showDetailsBtn = seqInfo.locator('text=Show details');
		if (await showDetailsBtn.count() > 0) {
			await showDetailsBtn.click();
			// After expanding, should show "Sequences" label
			await expect(seqInfo).toContainText('Sequences');
		}
	});
});
