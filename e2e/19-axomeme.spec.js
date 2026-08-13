/**
 * E2E tests for AxoMEME, the in-browser neural surrogate for MEME.
 *
 * These exist because AxoMEME's failure modes are ones no unit test can see. The model and the
 * runtime are fetched at run time from static assets, and every bug found while wiring this up was
 * in that fetch rather than in any computation:
 *
 *   1. onnxruntime-web does not bundle its WASM binary. With no `wasmPaths` it resolves to a jsDelivr
 *      CDN — which violates this project's core constraint that the site be servable with no other
 *      domains involved, and which simply fails offline. The runtime reports "no available backend
 *      found", which reads like a broken model rather than a missing asset.
 *   2. The DEFAULT package entry wants the JSEP (WebGPU) binary, a different 26.8 MB file from the
 *      CPU one. Importing `onnxruntime-web` instead of `onnxruntime-web/wasm` fails with the same
 *      opaque message even when the CPU binary is present and served correctly.
 *
 * Both were found by hand and neither would have failed a unit test. So what these tests assert is
 * WHICH URLS THE PAGE ACTUALLY REQUESTS, not just that a number came out.
 */

import { test, expect } from './fixtures/coverage.js';
import {
	freshStart,
	loadDemoFile,
	goToAnalyzeTab,
	selectMethod,
	clickRunAnalysis
} from './fixtures/helpers.js';

/** Anything served from another origin. The project must never need one. */
const isThirdParty = (url) => !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url);

/** The CPU runtime this feature is built against. */
const CPU_WASM = /ort-wasm-simd-threaded\.(wasm|mjs)$/;
/** The WebGPU / asyncify / JSPI variants, none of which should ever be requested. */
const OTHER_VARIANTS = /ort-wasm-simd-threaded\.(jsep|asyncify|jspi)\./;

function trackRequests(page) {
	const urls = [];
	page.on('request', (r) => urls.push(r.url()));
	return () => urls;
}

test.describe('AxoMEME', () => {
	test.setTimeout(180000);

	test('appears in the method list and describes itself as a prediction', async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });

		await selectMethod(page, 'AxoMEME');

		// The copy has to say PREDICT. AxoMEME estimates what MEME would report; presenting it as a
		// completed selection analysis is the one framing error that matters here, and the method
		// description is where a user forms that expectation.
		const body = await page.locator('body').innerText();
		expect(body).toMatch(/predict/i);
	});

	test('fetches its runtime and model from THIS origin, never a CDN', async ({ page }) => {
		// The project constraint, asserted rather than trusted: "The website needs to be entirely
		// self-contained so that it can be served locally. No pulling down from other domains."
		const requests = trackRequests(page);
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });
		await selectMethod(page, 'AxoMEME');

		expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);

		// Give the runtime time to fetch its binary and score 17 sites.
		await page.waitForTimeout(45000);

		const all = requests();
		// SCOPED TO AXOMEME'S OWN ASSETS, deliberately. A broader filter here fails, and not because of
		// anything in this feature: the app already fetches katex from cdn.jsdelivr.net and aioli from
		// biowasm.com, which are real violations of the same project constraint and predate this work.
		// Widening this assertion would make an AxoMEME test fail for someone else's reason, which is
		// how a guard gets deleted. They are logged separately instead.
		const offOrigin = all.filter(isThirdParty).filter((u) => /onnx|ort-wasm/i.test(u));
		expect(offOrigin, `AxoMEME assets fetched off-origin: ${offOrigin.join(', ')}`).toEqual([]);

		// And it must have asked for the CPU binary specifically.
		const wasmRequests = all.filter((u) => CPU_WASM.test(u));
		expect(wasmRequests.length, 'the CPU WASM runtime was never requested').toBeGreaterThan(0);
		for (const u of wasmRequests) expect(u).toMatch(/\/ort\//);

		// The JSEP / asyncify / JSPI builds are 15-27 MB each and this feature uses none of them.
		// Requesting one means the default package entry crept back in.
		const wrongVariant = all.filter((u) => OTHER_VARIANTS.test(u));
		expect(
			wrongVariant,
			`requested a runtime variant we do not ship: ${wrongVariant.join(', ')}`
		).toEqual([]);
	});

	test('produces a per-site result table', async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });
		await selectMethod(page, 'AxoMEME');

		expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);

		// The analysis must reach a terminal state, and it must be success. An error toast here is the
		// signal that the runtime or the model failed to load.
		//
		// This waits for the toast BaseAnalysisRunner.completeAnalysis fires, which is the only one.
		// AnalyzeTab used to fire a second, AxoMEME-specific "AxoMEME prediction complete" on top of
		// it; removing that duplicate left these assertions waiting on a string nothing emits any more,
		// and all five tests that run an analysis timed out at 180s while the feature itself was fine.
		await expect(page.getByText(/AXOMEME analysis complete/i)).toBeVisible({ timeout: 120000 });

		// And the results must actually render. A completed analysis with nothing to show is the
		// failure mode this test exists to catch.
		await page
			.getByRole('button', { name: /results/i })
			.first()
			.click();
		// The Results tab lists every analysis and defaults the detail pane to the FIRST one, which is
		// the datareader job every upload creates. Selecting the AxoMEME run explicitly is required;
		// without it this test passes or fails on whatever happens to be first.
		await page
			.locator('.analysis-card')
			.filter({ hasText: /AXOMEME Analysis/i })
			.getByRole('button', { name: 'View' })
			.first()
			.click();
		await expect(page.getByText(/AxoMEME predictions/i)).toBeVisible({ timeout: 30000 });

		// The framing is not decoration. A researcher reading a per-site table is one step from
		// writing it up, so the page must say MEME was not run AND that the number is not a p-value.
		const body = await page.locator('body').innerText();
		expect(body).toMatch(/MEME was not run/i);
		expect(body).toMatch(/not calibrated/i);

		// The table and plots come from hyphy-scope's AxomemeVisualization; DataMonkey contributes only
		// the caveats about what it did to the data first. These assertions are on the library's
		// output, so they also catch a stale `npm link` or a package build that did not include it.
		await expect(page.locator('.axomeme-visualization')).toBeVisible();
		await expect(page.locator('.axomeme-plot svg').first()).toBeVisible({ timeout: 20000 });

		// Rank is a first-class column and the score is NOT labelled LRT. Measured across 12 real
		// submissions, the model's predicted LRT clears the chi-square gates once in 662 sites, so
		// presenting it as an LRT invites a comparison it cannot support.
		await expect(page.getByRole('columnheader', { name: 'Percentile' })).toBeVisible();
		// exact: log(1+score) also matches a loose "Score".
		await expect(page.getByRole('columnheader', { name: 'Score', exact: true })).toBeVisible();
		await expect(page.getByRole('columnheader', { name: 'LRT' })).toHaveCount(0);
		await expect(page.getByRole('columnheader', { name: /dN/ })).toBeVisible();
	});

	test('is marked Beta wherever a user meets it', async ({ page }) => {
		// The MODEL is under active development, not the integration. The badge has to appear both
		// where the method is chosen and where the numbers are read — someone landing on a shared
		// results view never sees the selector.
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });

		await selectMethod(page, 'AxoMEME');
		await expect(page.locator('.beta-badge')).toBeVisible({ timeout: 10000 });

		// And it must be specific to AxoMEME rather than decorating every method.
		await selectMethod(page, 'FEL');
		await expect(page.locator('.beta-badge')).toHaveCount(0);

		await selectMethod(page, 'AxoMEME');
		expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);
		await expect(page.getByText(/AXOMEME analysis complete/i)).toBeVisible({ timeout: 120000 });
		await page
			.getByRole('button', { name: /results/i })
			.first()
			.click();
		await page
			.locator('.analysis-card')
			.filter({ hasText: /AXOMEME Analysis/i })
			.getByRole('button', { name: 'View' })
			.first()
			.click();
		await expect(page.locator('.axomeme-beta')).toBeVisible({ timeout: 30000 });
	});

	test('suppresses the genetic code, which neither surface can honour', async ({ page }) => {
		// This used to assert that the EXECUTION MODE toggle was suppressed too. That is no longer
		// true and should not be: there is a server-side AxoMEME now (axomeme.sh runs a Node CLI
		// through the standard job lifecycle), so the toggle is a real choice.
		//
		// The genetic code is different, and the distinction is the point of this test. Neither
		// surface can honour one: the model's tokenizer bakes in the universal table, and the server
		// descriptor hardcodes genetic_code "Universal" and warns if one is supplied. A control that
		// reaches nothing implies a capability that does not exist.
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });

		await selectMethod(page, 'AxoMEME');
		const body = await page.locator('body').innerText();
		// The mode toggle is now OFFERED for AxoMEME -- that is the capability the server added.
		expect(body, 'the execution-mode toggle should be available now').toMatch(/Backend Server/i);
		// The genetic code still is not, on either surface.
		expect(body).toMatch(/cannot be changed for this method/i);
		expect(body).not.toMatch(/Genetic Code:/i);

		// While a demo is loaded and AxoMEME is selected: the pre-run copy has to state that the
		// default calling mode ALWAYS flags a share of the variable sites, whether or not any of them
		// is under selection. The results table says "Top 2%" afterwards; before the run, nothing did.
		// Asserted on the testid rather than on body text — "percentile ... rank sites" is already on
		// the page and would pass with this line removed.
		const consequence = page.locator('[data-testid="axomeme-call-consequence"]');
		await expect(consequence).toBeVisible();
		await expect(consequence).toContainText(/top 2%/i);

		// And the controls must come back for a method that does have them.
		await selectMethod(page, 'FEL');
		const felBody = await page.locator('body').innerText();
		expect(felBody).toMatch(/Backend Server/i);
		expect(felBody).toMatch(/Genetic Code/i);
		// The consequence line belongs to AxoMEME only.
		await expect(page.locator('[data-testid="axomeme-call-consequence"]')).toHaveCount(0);
	});
});

test.describe('AxoMEME on the bundled demos', () => {
	test.setTimeout(300000);

	// large.nex is the regression that prompted this block. Its tree carries negative branch lengths
	// from DM3's own NJ inference — a patristic sum of -1.04e-5, which is zero with rounding error on
	// it — and the input check rejected the whole run for it. Every bundled demo now runs, so a
	// tightened validator cannot quietly break the ones a user is most likely to click.
	for (const demo of ['small.nex', 'medium.nex', 'large.nex']) {
		test(`runs on ${demo}`, async ({ page }) => {
			await freshStart(page);
			await loadDemoFile(page, demo);
			await expect(async () => {
				await goToAnalyzeTab(page);
				await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({
					timeout: 5000
				});
			}).toPass({ timeout: 60000 });
			await selectMethod(page, 'AxoMEME');
			expect(await clickRunAnalysis(page), 'run button was not clickable').toBe(true);
			await expect(page.getByText(/AXOMEME analysis complete/i)).toBeVisible({ timeout: 180000 });
		});
	}
});

test.describe('AxoMEME cost', () => {
	test.setTimeout(180000);

	test('a non-AxoMEME method downloads none of the runtime or the model', async ({ page }) => {
		// The invariant the whole session.js design exists for: AxoMEME is one method of fifteen, and
		// the other fourteen must not pay 17 MB for it. This is the same guard the MEME hit-likelihood
		// suite applies to its own model, and it matters more here because the payload is larger.
		const requests = trackRequests(page);
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });

		await selectMethod(page, 'FEL');
		await page.waitForTimeout(3000);

		const offending = requests().filter((u) => /ort-wasm|onnxruntime|axomeme.*\.onnx/i.test(u));
		expect(offending, `FEL pulled AxoMEME assets: ${offending.join(', ')}`).toEqual([]);
	});
});
