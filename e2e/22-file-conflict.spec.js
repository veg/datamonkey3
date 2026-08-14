/**
 * Re-uploading a file whose name is already taken.
 *
 * The store finds the existing record by FILENAME and replaces its bytes in place, keeping the id.
 * For a corrected version of the same alignment that is exactly right — the analysis history stays
 * attached. For a genuinely different file that happens to share a name it is not: every earlier
 * FEL/MEME run silently ends up filed under contents it never saw, with nothing on screen saying
 * so. The user was never asked which of the two they meant.
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, uploadFile, TEST_FILES } from './fixtures/helpers.js';

const PROMPT = '[data-testid="file-conflict-prompt"]';

test.describe('Same-name upload', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('asks which file the user meant, and can keep both', async ({ page }) => {
		await uploadFile(page, TEST_FILES['CD2-slim.fna']);
		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });
		await expect(page.locator('.file-card')).toHaveCount(1);

		// Same name again. No prompt existed before: this silently overwrote.
		await page.locator('input[type="file"]').setInputFiles(TEST_FILES['CD2-slim.fna']);

		await expect(page.locator(PROMPT)).toBeVisible({ timeout: 15000 });
		await expect(page.getByRole('button', { name: 'Replace it' })).toBeVisible();
		const keepBoth = page.getByRole('button', { name: /Keep both/ });
		await expect(keepBoth).toContainText('CD2-slim (2).fna');

		await keepBoth.click();
		await expect(page.locator(PROMPT)).toHaveCount(0);

		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });
		await expect(page.locator('.file-card')).toHaveCount(2);
		await expect(page.locator('.file-card').filter({ hasText: 'CD2-slim.fna' })).toHaveCount(1);
		await expect(page.locator('.file-card').filter({ hasText: 'CD2-slim (2).fna' })).toHaveCount(1);
	});

	test('replacing keeps a single record, as before', async ({ page }) => {
		await uploadFile(page, TEST_FILES['CD2-slim.fna']);
		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });

		await page.locator('input[type="file"]').setInputFiles(TEST_FILES['CD2-slim.fna']);
		await expect(page.locator(PROMPT)).toBeVisible({ timeout: 15000 });
		await page.getByRole('button', { name: 'Replace it' }).click();

		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });
		await expect(page.locator('.file-card')).toHaveCount(1);
	});

	test('a demo file replaces silently — the prompt is for uploads only', async ({ page }) => {
		// Demo, repair and alignment-edit saves are deliberate in-place replacements of a file the
		// user just acted on. Prompting there would be noise.
		const card = page.locator('.sample-card').filter({ hasText: 'CD2-slim.fna' });
		await card.click();
		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });

		await card.click();
		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });
		await expect(page.locator(PROMPT)).toHaveCount(0);
		await expect(page.locator('.file-card')).toHaveCount(1);
	});
});
