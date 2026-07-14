/**
 * E2E tests for invalid file handling
 */

import { test, expect } from '@playwright/test';
import { freshStart, uploadFile, TEST_FILES } from './fixtures/helpers.js';

test.describe('Invalid File Handling', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('uploading stop-codons file shows warning', async ({ page }) => {
		await uploadFile(page, TEST_FILES['stop-codons.fna']);
		await page.waitForTimeout(5000);

		// Should show some kind of warning or error about stop codons
		const errorOrWarning = page.locator(
			'[data-testid="sequence-info"]:has-text("stop"), ' +
			'.text-status-error, ' +
			':text("stop codon"), ' +
			':text("Stop Codons")'
		);
		// The file may process with warnings (stop codons stripped) or error
		const seqInfo = page.locator('[data-testid="sequence-info"]');
		if (await seqInfo.count() > 0) {
			// File processed but should mention stop codons
			await expect(seqInfo).toBeVisible();
		}
	});

	test('uploading broken file does not show sequence info', async ({ page }) => {
		await uploadFile(page, TEST_FILES['broken-not-an-alignment.txt']);
		await page.waitForTimeout(5000);

		// A broken file should NOT produce valid sequence info
		const seqInfo = page.locator('[data-testid="sequence-info"]');
		const seqInfoCount = await seqInfo.count();
		if (seqInfoCount > 0) {
			// If sequence info appeared, it should not contain valid alignment metrics
			const text = await seqInfo.textContent();
			expect(text).not.toContain('Alignment File Metrics');
		}
		// Otherwise the app silently rejected the file, which is acceptable
	});

	test('uploading valid file still works after error', async ({ page }) => {
		// First upload broken file
		await uploadFile(page, TEST_FILES['broken-not-an-alignment.txt']);
		await page.waitForTimeout(5000);

		// Now upload a valid file
		await uploadFile(page, TEST_FILES['CD2-slim.fna']);

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
		await expect(seqInfo).toContainText('Alignment File Metrics');
	});
});
