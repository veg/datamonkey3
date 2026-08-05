/**
 * E2E tests for the MEME hit-likelihood row in the "Before you run" panel.
 *
 * Two things can only be checked in a real browser, so they live here rather than in vitest:
 *   1. What the row renders for a real upload (the estimator runs client-side).
 *   2. WHAT IT COSTS. The original version of this feature downloaded 13.5 MB of ONNX Runtime WASM
 *      for every method, including the ~14 that have no estimate, and then rendered nothing. An
 *      "is the element absent?" assertion passed the whole time, because the element WAS absent —
 *      the bytes were the bug. So these tests count bytes, not just elements.
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

/**
 * A synthetic codon alignment with a chosen amount of divergence.
 *
 * Every bundled demo file is a small fixture that lands on "no method swap will help", so none of
 * them exercises the branch where the estimate names an alternative. This builds one that does.
 * Codons are drawn from four-fold degenerate families and only third positions are mutated, so no
 * mutation can create a stop codon and the alignment always passes DM3's validation.
 */
function syntheticAlignment(nSeq, nCodons, thirdPositionRate) {
	const families = ['GC', 'CT', 'CC', 'CG', 'AC', 'GT', 'TC', 'GG'];
	const third = ['A', 'C', 'G', 'T'];
	let state = 1234567; // fixed seed: the same alignment every run
	const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	const base = [];
	for (let i = 0; i < nCodons; i++) base.push(families[i % families.length] + 'T');
	const records = [];
	for (let k = 0; k < nSeq; k++) {
		const codons = base.slice();
		for (let i = 0; i < nCodons; i++) {
			if (rnd() < thirdPositionRate)
				codons[i] = codons[i].slice(0, 2) + third[Math.floor(rnd() * 4)];
		}
		records.push(`>taxon_${k}\n${codons.join('')}`);
	}
	return records.join('\n') + '\n';
}

/** Anything belonging to the estimator: its modules, its coefficients, any ML runtime. */
const ESTIMATOR_ASSET = /prescreen|hit_likelihood|hitLikelihood|ensemble|onnx|ort-wasm/i;
/** The heavy part specifically — coefficients and any runtime, as opposed to a few KB of glue. */
const ESTIMATOR_PAYLOAD = /ensemble|onnx|ort-wasm/i;

/**
 * Record the transfer size of every response whose URL matches, from now until the returned
 * function is called.
 */
function trackBytes(page) {
	const seen = [];
	page.on('response', async (response) => {
		const url = response.url();
		if (!ESTIMATOR_ASSET.test(url)) return;
		let bytes = 0;
		try {
			bytes = (await response.body()).length;
		} catch {
			bytes = Number(response.headers()['content-length'] || 0);
		}
		seen.push({ url, bytes });
	});
	return () => seen;
}

test.describe('MEME hit-likelihood', () => {
	// beforeEach alone can spend 60s in freshStart, 30s loading the demo file and 30s waiting for
	// the dropdown, which does not fit the global 60s cap once 4 workers are contending for one dev
	// server. Without this the suite is merely flaky-and-retried rather than failing, which is worse
	// than either — it hides whether the estimator or the harness is the slow one.
	test.setTimeout(180000);

	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await goToAnalyzeTab(page);
		// Ensure the method dropdown is present before any selectOption (avoids a
		// race under load where the WASM-heavy page hasn't rendered the selector yet).
		await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 30000 });
	});

	test('renders a level, a reason and its basis when MEME is selected', async ({ page }) => {
		await selectMethod(page, 'MEME');

		const row = page.locator('[data-testid="meme-hit-likelihood"]');
		await expect(row).toBeVisible({ timeout: 30000 });

		// It resolves to one of the four statuses — never to blank space.
		await expect(row).toHaveAttribute('data-status', /^(ok|cannot-assess|error)$/, {
			timeout: 30000
		});
		const status = await row.getAttribute('data-status');

		if (status === 'ok') {
			expect(['likely', 'uncertain', 'unlikely']).toContain(await row.getAttribute('data-level'));
		}
		// Whatever the status, the row explains itself in words rather than showing a bare number.
		expect((await row.innerText()).trim().length).toBeGreaterThan(20);

		// The claim is sourced: opening the basis discloses the caveat and what the model is.
		await row.locator('[data-testid="hit-likelihood-basis-toggle"]').click();
		const basis = row.locator('[data-testid="hit-likelihood-basis"]');
		await expect(basis).toBeVisible();
		await expect(basis).toContainText('not whether this gene is under selection');
		await expect(basis).toContainText('Gradient-boosted trees');

		// It lives inside the single "Before you run" panel, alongside the runtime estimate,
		// rather than as a second coloured box stacked above it.
		const panel = page.locator('[data-testid="run-outlook"]');
		await expect(panel).toHaveCount(1);
		await expect(panel.locator('[data-testid="meme-hit-likelihood"]')).toHaveCount(1);
		await expect(panel.locator('.timing-estimate')).toHaveCount(1);
	});

	test('a discouraging estimate offers a way forward, not just a grade', async ({ page }) => {
		await selectMethod(page, 'MEME');
		const row = page.locator('[data-testid="meme-hit-likelihood"]');
		await expect(row).toHaveAttribute('data-status', /^(ok|cannot-assess|error)$/, {
			timeout: 30000
		});

		const level = await row.getAttribute('data-level');
		test.skip(level !== 'unlikely', `demo file scored "${level}"; routing copy is for 'unlikely'`);

		// Either a concrete alternative method, or an explicit statement that no method swap helps.
		const action = row.locator('[data-testid="hit-likelihood-action"]');
		if (await action.count()) {
			await expect(action).toContainText(/Switch to/);
		} else {
			await expect(row).toContainText(/a different method will not/);
		}
	});

	test('a non-MEME method (FEL) downloads none of the estimator payload', async ({ page }) => {
		const bytes = trackBytes(page);
		await selectMethod(page, 'FEL');
		// Give it the whole budget the estimator would have needed, then measure.
		await page.waitForTimeout(5000);

		await expect(page.locator('[data-testid="meme-hit-likelihood"]')).toHaveCount(0);
		// The runtime row is still there — the panel is not MEME-only.
		await expect(page.locator('[data-testid="run-outlook"] .timing-estimate')).toHaveCount(1);

		// Not one byte of the model, its coefficients, or any ML runtime.
		const payload = bytes().filter((r) => ESTIMATOR_PAYLOAD.test(r.url));
		expect(payload, `unexpected estimator payload: ${JSON.stringify(payload)}`).toHaveLength(0);

		// And barely any of its code either: the only thing a non-MEME method may touch is the
		// import-free scope module that answers "is there an estimate for this method?". This budget
		// is against the DEV server (unminified, inline sourcemaps), so it is generous — it exists to
		// fail loudly if someone static-imports the estimator back into the main graph.
		const all = bytes();
		const total = all.reduce((n, r) => n + r.bytes, 0);
		expect(total, `estimator transfer for FEL: ${JSON.stringify(all)}`).toBeLessThan(25_000);
	});

	test('MEME does download the coefficients — and they are kilobytes, not megabytes', async ({
		page
	}) => {
		const bytes = trackBytes(page);
		await selectMethod(page, 'MEME');
		await expect(page.locator('[data-testid="meme-hit-likelihood"]')).toBeVisible({
			timeout: 30000
		});
		await page.waitForTimeout(2000);

		const all = bytes();
		const total = all.reduce((n, r) => n + r.bytes, 0);
		// The coefficients are fetched — that is the point of the lazy import.
		expect(all.some((r) => /ensemble/i.test(r.url))).toBe(true);
		// The whole estimator, coefficients included, is well under a megabyte even unminified on
		// the dev server. The version this replaced cost 13.5 MB, on every method.
		expect(total, `estimator transfer: ${JSON.stringify(all)}`).toBeLessThan(1_000_000);
		expect(all.some((r) => /ort-wasm|onnxruntime/i.test(r.url))).toBe(false);
	});
});

test.describe('MEME hit-likelihood routing', () => {
	// Same reasoning as above, and this one is heavier: it uploads 20 taxa x 800 codons and waits
	// on datareader plus NJ inference before it can even select a method.
	test.setTimeout(180000);

	test('the suggested method is a control, not a sentence', async ({ page }) => {
		await freshStart(page);
		// 20 taxa x 800 codons at low divergence: enough substitutions in total for a gene-wide
		// test, not enough at any one site for MEME. That is the case the routing exists for.
		await page.locator('input[type="file"]').setInputFiles({
			name: 'synthetic-low-divergence.fna',
			mimeType: 'text/plain',
			buffer: Buffer.from(syntheticAlignment(20, 800, 0.015))
		});
		await page.waitForTimeout(8000); // datareader + NJ inference
		await goToAnalyzeTab(page);
		await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 30000 });
		await selectMethod(page, 'MEME');

		const row = page.locator('[data-testid="meme-hit-likelihood"]');
		await expect(row).toHaveAttribute('data-status', 'ok', { timeout: 30000 });

		const action = row.locator('[data-testid="hit-likelihood-action"]').first();
		await expect(action).toBeVisible();
		const label = await action.innerText();
		expect(label).toMatch(/^Switch to (BUSTED|aBSREL|FUBAR)$/);

		// Clicking it actually moves the method selector — the recommendation was previously
		// computed and thrown away, and a suggestion nobody can act on is just a grade.
		await action.click();
		await expect(page.locator('[data-testid="method-dropdown"]')).toHaveValue(
			new RegExp(`^${label.replace('Switch to ', '')}$`, 'i')
		);
		// And the estimate stops applying to the new method, rather than following it there.
		await expect(page.locator('[data-testid="meme-hit-likelihood"]')).toHaveCount(0);
	});
});
