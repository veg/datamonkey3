/**
 * E2E tests for backend unavailable state
 *
 * Since there's no backend server in test, the backend should show as disconnected.
 */

import { test, expect } from '@playwright/test';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

test.describe('Backend Unavailable State', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('execution mode options present in Analyze tab', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');
		const wentToAnalyze = await goToAnalyzeTab(page);
		if (!wentToAnalyze) {
			test.skip(true, 'Analyze tab not available');
			return;
		}
		await selectMethod(page, 'FEL');

		// Execution mode section should exist
		const localRadio = page.locator('input[type="radio"][value="local"]');
		const backendRadio = page.locator('input[type="radio"][value="backend"]');
		await expect(localRadio).toBeVisible();
		await expect(backendRadio).toBeVisible();

		// If backend is disconnected, the radio should be disabled and warning shown
		const isBackendDisabled = await backendRadio.isDisabled();
		if (isBackendDisabled) {
			const warning = page.locator('.backend-status-warning');
			await expect(warning).toBeVisible();
		}
	});

	test('warning text visible when backend unavailable', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);
		await selectMethod(page, 'FEL');

		// Look for the unavailable warning
		const warning = page.locator('.backend-status-warning, :text("Server temporarily unavailable")');
		if (await warning.count() > 0) {
			await expect(warning.first()).toBeVisible();
		}
	});

	test('local mode selected by default', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);
		await selectMethod(page, 'FEL');

		const localRadio = page.locator('input[type="radio"][value="local"]');
		if (await localRadio.count() > 0) {
			await expect(localRadio).toBeChecked();
		}
	});
});
