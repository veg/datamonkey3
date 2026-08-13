/**
 * The Data tab's claims about a file, end to end.
 *
 * Each assertion below pins a statement that was WRONG on the page before this spec existed:
 *
 *  - the upload limits ("Max 5,000 sequences ... >500 sequences require an embedded tree" against
 *    real gates of 25,000 and 10,000),
 *  - the "N raw -> M processed" sites row, which is one alignment measured in two units,
 *  - the bare integer where the genetic code's name belongs,
 *  - and the fact that datareader renamed or collapsed sequences, which only ever went to
 *    ./datareader.log — a file nothing in the app reads.
 *
 * The last two need the real WASM datareader to run, so they upload a fixture and read what came
 * back rather than a fixture-shaped mock.
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, uploadFile, TEST_FILES } from './fixtures/helpers.js';
import path from 'path';

const SPECIAL_CHARS = path.resolve('static/test-data/validation-tests/special-chars.fna');
const DUPLICATES = path.resolve('static/test-data/validation-tests/duplicates.fna');

test.describe('Data tab facts', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('the upload limits are the ones datareader enforces', async ({ page }) => {
		await expect(page.getByText(/25,000 sequences/)).toBeVisible();
		await expect(page.getByText(/Above 10,000 sequences/)).toBeVisible();

		// The exact strings the old copy used. '25,000 sequences' CONTAINS '5,000 sequences', so a
		// bare /5,000 sequences/ here would match the fixed page — hence the full old phrases.
		await expect(page.getByText(/Max 5,000 sequences/)).toHaveCount(0);
		await expect(page.getByText(/>500 sequences require an embedded tree/)).toHaveCount(0);
	});

	test('the sites row states one length in two units, and the code has a name', async ({
		page
	}) => {
		await uploadFile(page, TEST_FILES['CD2-slim.fna']);

		const seqInfo = page.locator('[data-testid="sequence-info"]');
		await expect(seqInfo).toBeVisible({ timeout: 30000 });
		await seqInfo.getByRole('button', { name: /Show details/ }).click();

		await expect(seqInfo).toContainText(/\d+ nucleotides \(\d+ codons\)/);
		await expect(seqInfo).not.toContainText('processed');
		await expect(seqInfo).toContainText('Universal code');

		// datareader computes dType and never emitted it; the row was permanently dark.
		await expect(seqInfo).toContainText('Data Type');
		await expect(seqInfo).toContainText('codon');
	});

	test('renamed sequences are named, not just counted', async ({ page }) => {
		await uploadFile(page, SPECIAL_CHARS);
		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });

		// special-chars.fna has 'Seq:1|sample'. normalizeSequenceID maps every character outside
		// [a-zA-Z0-9_] to '_' AND upper-cases the result (the `&& 1` operator in
		// ReadDelimitedFiles.bf:219), so the new name is SEQ_1_SAMPLE. Before this change nothing in
		// the app could tell you WHICH name had changed, or to what.
		await expect(page.getByText(/Seq:1\|sample -> SEQ_1_SAMPLE/)).toBeVisible({ timeout: 15000 });
	});

	test('collapsed duplicates are named, and nothing offers to edit the alignment', async ({
		page
	}) => {
		await uploadFile(page, DUPLICATES);
		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 30000 });

		// duplicates.fna: Seq2 and Seq4 are byte-identical to Seq1.
		await expect(page.getByText(/Seq2 = Seq1/)).toBeVisible({ timeout: 15000 });

		// The maintainer's rule, checked where the user actually reads it: describe, never offer to
		// modify the user's data.
		const warningsText = await page.locator('body').innerText();
		const warningsSection = warningsText.slice(warningsText.indexOf('Sequence Warnings'));
		expect(warningsSection).not.toMatch(/\brepair\b/i);
		expect(warningsSection).not.toMatch(/\bwe can\b/i);
	});
});
