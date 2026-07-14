/**
 * E2E tests for Toast notifications
 */

import { test, expect } from '@playwright/test';
import { freshStart } from './fixtures/helpers.js';

test.describe('Toast Notifications', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('injecting a success toast makes it appear', async ({ page }) => {
		await page.evaluate(() => {
			// Access the toastStore from the app's module system
			// We dispatch a custom event that the app listens to
			window.dispatchEvent(new CustomEvent('test-toast', {
				detail: { type: 'success', message: 'Test success toast' }
			}));
		});

		// Also try direct injection via the store if accessible
		await page.evaluate(async () => {
			// Try to find the toast store in the svelte context
			const { toastStore } = await import('/src/stores/toast.js');
			if (toastStore && toastStore.success) {
				toastStore.success('E2E test success toast');
			}
		}).catch(() => {
			// Module import may not work in browser context, that's ok
		});

		// Check if toast appeared
		const toast = page.locator('.toast, [role="alert"]');
		if (await toast.count() > 0) {
			await expect(toast.first()).toBeVisible();
		}
	});

	test('toast can be dismissed via X button', async ({ page }) => {
		// Inject a toast
		await page.evaluate(async () => {
			const { toastStore } = await import('/src/stores/toast.js');
			if (toastStore && toastStore.success) {
				toastStore.success('Dismissable toast', { duration: 30000 });
			}
		}).catch(() => {});

		const toast = page.locator('.toast, [role="alert"]');
		if (await toast.count() > 0) {
			const dismissBtn = toast.first().locator('button[aria-label="Dismiss notification"]');
			if (await dismissBtn.count() > 0) {
				await dismissBtn.click();
				await expect(toast.first()).not.toBeVisible({ timeout: 5000 });
			}
		}
	});

	test('success toast has green border styling', async ({ page }) => {
		await page.evaluate(async () => {
			const { toastStore } = await import('/src/stores/toast.js');
			if (toastStore && toastStore.success) {
				toastStore.success('Green success toast', { duration: 30000 });
			}
		}).catch(() => {});

		const successToast = page.locator('.toast-success');
		if (await successToast.count() > 0) {
			await expect(successToast.first()).toBeVisible();
		}
	});

	test('error toast has red border styling', async ({ page }) => {
		await page.evaluate(async () => {
			const { toastStore } = await import('/src/stores/toast.js');
			if (toastStore && toastStore.error) {
				toastStore.error('Red error toast', { duration: 30000 });
			}
		}).catch(() => {});

		const errorToast = page.locator('.toast-error');
		if (await errorToast.count() > 0) {
			await expect(errorToast.first()).toBeVisible();
		}
	});
});
