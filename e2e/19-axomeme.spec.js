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
		await expect(page.getByText(/AxoMEME prediction complete/i)).toBeVisible({ timeout: 120000 });
	});
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
