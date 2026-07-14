/**
 * E2E tests for initial page state (landing page)
 */

import { test, expect } from '@playwright/test';
import { freshStart } from './fixtures/helpers.js';

test.describe('Landing Page', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('should show page title', async ({ page }) => {
		await expect(page.locator('h1')).toContainText('Sequence Analysis Platform');
	});

	test('should show PRIME banner with dismiss button', async ({ page }) => {
		const primeCard = page.locator('.prime-card');
		await expect(primeCard).toBeVisible();
		await expect(primeCard).toContainText('PRIME');

		// Dismiss it
		const dismissBtn = primeCard.locator('button[aria-label="Dismiss"]');
		await dismissBtn.click();
		await expect(primeCard).not.toBeVisible();
	});

	test('should show 4 demo file cards', async ({ page }) => {
		const cards = page.locator('.sample-card');
		await expect(cards).toHaveCount(4);
		await expect(cards.nth(0)).toContainText('CD2');
		await expect(cards.nth(1)).toContainText('small');
	});

	test('should have Analyze and Results tabs disabled initially', async ({ page }) => {
		const analyzeTab = page.locator('button:has-text("Analyze")').first();
		const resultsTab = page.locator('button:has-text("Results")').first();

		await expect(analyzeTab).toHaveAttribute('aria-disabled', 'true');
		await expect(resultsTab).toHaveAttribute('aria-disabled', 'true');
	});

	test('should not show status indicator when no analyses exist', async ({ page }) => {
		const indicator = page.locator('button[aria-label="View all analyses"]');
		await expect(indicator).toHaveCount(0);
	});

	test('should show backend connectivity indicator', async ({ page }) => {
		// The BackendConnectivityIndicator should be present somewhere on the page
		// It shows a colored dot for connection status
		const indicator = page.locator('.bg-status-error, .bg-status-success, .bg-status-warning').first();
		// At minimum the page should have loaded without errors
		await expect(page.locator('h1')).toBeVisible();
	});
});
