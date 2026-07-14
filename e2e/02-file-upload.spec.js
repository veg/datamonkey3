/**
 * E2E tests for file upload functionality
 */

import { test, expect } from '@playwright/test';
import { freshStart, uploadFile, TEST_FILES } from './fixtures/helpers.js';

test.describe('File Upload', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('upload CD2-slim.fna via file input shows sequence info', async ({ page }) => {
		await uploadFile(page, TEST_FILES['CD2-slim.fna']);

		// Sequence info panel should appear
		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
	});

	test('upload small.nex detects tree', async ({ page }) => {
		await uploadFile(page, TEST_FILES['small.nex']);

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 15000 });
		// small.nex has a tree, should show "Tree Included" badge
		await expect(seqInfo).toContainText('Tree');
	});

	test('Analyze tab becomes enabled after upload', async ({ page }) => {
		const analyzeTab = page.locator('button:has-text("Analyze")').first();
		await expect(analyzeTab).toHaveAttribute('aria-disabled', 'true');

		await uploadFile(page, TEST_FILES['CD2-slim.fna']);

		await expect(analyzeTab).not.toHaveAttribute('aria-disabled', 'true');
	});
});
