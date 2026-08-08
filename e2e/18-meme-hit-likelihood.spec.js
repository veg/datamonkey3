/**
 * E2E tests for the MEME hit-likelihood row in the "Before you run" panel.
 *
 * Two things can only be checked in a real browser, so they live here rather than in vitest:
 *   1. What the row renders for a real upload (the estimator runs client-side).
 *   2. WHAT IT COSTS. The original version of this feature downloaded 13.5 MB of ML-runtime WASM
 *      for every method, including the ~14 that have no estimate, and then rendered nothing. An
 *      "is the element absent?" assertion passed the whole time, because the element WAS absent —
 *      the bytes were the bug. So these tests count bytes, not just elements. DM3 now ships
 *      onnxruntime-web for AxoMEME, which makes that regression cheap to reintroduce by accident;
 *      see RUNTIME_TOMBSTONE for why these flows must still transfer none of it.
 *
 * WHAT MOVED SINCE THE LAST REVISION. The estimator is no longer a converted coefficient table; it
 * is XGBoost's own `save_model()` JSON, shipped verbatim and walked in ~40 lines of plain JS. That
 * changes both halves of the byte accounting and neither change is cosmetic:
 *   - The payload is now meme_gate.json (735,876 bytes on disk, ~169 KB gzipped over the wire),
 *     not a ~17 KB ensemble. The budgets below had to be re-derived rather than relaxed.
 *   - There is no ML runtime and no converter left to look for, so what these tests hunt for is a
 *     RETURN of one — see RUNTIME_TOMBSTONE.
 */

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { test, expect } from './fixtures/coverage.js';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

/**
 * A synthetic codon alignment with a chosen amount of divergence.
 *
 * Builds the thin-PER-SITE shape — plenty of substitutions in total, too few at any one codon —
 * which no bundled demo file has and which is the shape an earlier version of this feature used to
 * route away to another method. Codons are drawn from four-fold degenerate families and only third
 * positions are mutated, so no mutation can create a stop codon and the alignment always passes
 * DM3's validation.
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

/**
 * A codon alignment with divergence low enough to land in the 'unlikely' band, and with every
 * sequence guaranteed distinct.
 *
 * syntheticAlignment() above cannot do this job. To reach a median branch length near 0.002 it
 * needs a mutation rate around 0.006, at which point a 138-codon sequence has a ~29% chance of
 * carrying no mutation at all — so two sequences come out identical, DM3's validator rejects the
 * upload, and the test fails for a reason that has nothing to do with the estimate. Here each
 * sequence mutates a DISJOINT set of third positions, so no two can ever coincide and the pairwise
 * distance is exactly 2 * mutationsPerSeq nucleotides regardless of the seed.
 *
 * WHY THIS EXISTS AT ALL: the 'unlikely' band is the one whose copy is most constrained — it is the
 * band a user might act on, and its predecessor was wrong for 72% of the alignments it fired on. No
 * bundled demo file reaches it (CD2-slim is 10 taxa x 17 codons and scores 'uncertain'), so the
 * test that checks that copy used to skip on every single run.
 */
function lowDivergenceAlignment(nSeq, nCodons, mutationsPerSeq) {
	const families = ['GC', 'CT', 'CC', 'CG', 'AC', 'GT', 'TC', 'GG'];
	const third = ['A', 'C', 'G', 'T'];
	const base = [];
	for (let i = 0; i < nCodons; i++) base.push(families[i % families.length] + 'T');
	const records = [];
	for (let k = 0; k < nSeq; k++) {
		const codons = base.slice();
		for (let j = 0; j < mutationsPerSeq; j++) {
			// Disjoint across sequences: sequence k only ever touches codons congruent to k mod nSeq.
			const at = k + j * nSeq;
			// 'T' is the reference third position; step to a different base, varied so the mutated
			// sites are not all the same substitution.
			codons[at] = codons[at].slice(0, 2) + third[(k + j) % 3];
		}
		records.push(`>taxon_${k}\n${codons.join('')}`);
	}
	return records.join('\n') + '\n';
}

/**
 * The shipped model, measured from the file itself — see the payload test for why.
 * Resolved from this spec's own location rather than from cwd, so it does not silently start
 * measuring nothing if the runner's working directory ever changes.
 */
const MODEL_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'src/lib/services/prescreen/meme_gate.json'
);

/**
 * WHAT COUNTS AS AN ESTIMATOR TRANSFER — CLASSIFIED BY CONTENT, NOT BY URL.
 *
 * This used to be a set of regexes over source paths (`prescreen`, `hitLikelihood`, `meme_gate`).
 * Those names only exist on the DEV server. A production build replaces every one of them with a
 * content hash — the model lands at `chunks/BqpMVx1d.js`, the estimator at `chunks/B7Ca6LlT.js` —
 * so run against a preview or production server, every pattern below matched nothing, the "MEME
 * downloads the model once" assertion saw zero hits, and the "FEL downloads none of it" assertion
 * was passing over an empty set. The tests were correct only because playwright.config.js happens
 * to start `npm run dev`; `reuseExistingServer: !process.env.CI` means a developer with a preview
 * server already on :5173 gets a red suite for reasons unrelated to their change.
 *
 * So the classifier reads the BYTES. Both markers below are properties of the artifacts themselves
 * and survive minification, hashing and bundling, which makes these assertions mean the same thing
 * in dev and in production.
 */

/**
 * A slice of the model file that is nothing but digits, signs, dots, exponents and commas.
 *
 * Chosen that way on purpose: on the dev server the model arrives as an ES module with the JSON
 * escaped (`export default "{\"learner\":..."`), so any slice containing a quote would not survive;
 * a run of numbers is byte-identical in dev, in the production chunk (where it sits inside a raw
 * single-quoted string literal) and in the file on disk. Derived from the artifact at run time and
 * asserted UNIQUE, so a retrain cannot leave this pointing at a slice that no longer identifies the
 * model or that appears twice.
 */
const MODEL_TEXT = readFileSync(MODEL_PATH, 'utf8');
const MODEL_MARK = (() => {
	for (let off = Math.floor(MODEL_TEXT.length / 2); off < MODEL_TEXT.length - 80; off++) {
		const slice = MODEL_TEXT.slice(off, off + 80);
		if (!/^[-0-9.eE,]+$/.test(slice)) continue;
		if (MODEL_TEXT.indexOf(slice) === MODEL_TEXT.lastIndexOf(slice)) return slice;
	}
	throw new Error('no unique numeric marker found in meme_gate.json — the model detector is blind');
})();

/**
 * Strings that only the estimator's own payload contains, whatever the server calls the file.
 *
 * Both are literals that survive minification and hashing, and neither appears in any module a
 * non-MEME method loads. RunOutlook mentions "hit-likelihood" in a comment, which is why the first
 * marker is the full hyphenated test id rather than a substring of it.
 *
 * TWO marks, not one, and the second is the interesting one: `hit-basis-toggle` is a CSS class, so
 * it identifies the row's STYLESHEET as estimator payload as well as its JS. The regression this
 * defends against emits the stylesheet as a separate hashed asset — no test id in it — and a
 * one-mark classifier would have let that through the hard-zero check below and caught it only in
 * the URL loop further down.
 */
const ESTIMATOR_MARKS = ['meme-hit-likelihood', 'hit-basis-toggle'];

/**
 * The scope leaf, the ONE estimator module a non-MEME method is allowed to touch: it imports
 * nothing and answers "is there an estimate for this method?". It is a separate request only on the
 * dev server; in a production build it is inlined into the main graph and never appears here.
 */
const SCOPE_LEAF = /prescreen\/scope\.js/;

/** Dev-server source paths. Kept as a belt-and-braces net alongside the content markers. */
const ESTIMATOR_ASSET =
	/prescreen|hit_likelihood|hitLikelihood|meme_gate|onnxruntime|ort-wasm|tfjs/i;

/**
 * A TOMBSTONE — and READ THIS BEFORE RELAXING IT, because the sentence that used to justify it is
 * no longer true while the assertions themselves are unchanged and still exactly right.
 *
 * It used to say "nothing else in the repository references these names — that is the state this
 * defends". DM3 now has a legitimate reason to depend on onnxruntime-web: AxoMEME 2.0 is a 3.78 MB
 * transformer whose graph is a real neural network, and it cannot be walked in plain JS the way the
 * gate's 500 three-feature trees can. So the runtime IS in package.json now.
 *
 * That does NOT weaken anything below, because these tests are scoped to two flows — select FEL,
 * and select MEME — and neither one is AxoMEME. The invariant they defend was always per-flow, not
 * per-repository: A METHOD MUST NOT PAY FOR A MODEL IT DOES NOT RENDER. The first version of this
 * feature charged all fifteen methods 13.5 MB for an estimate fourteen of them never showed. Now
 * that a runtime is a real dependency that resolves instead of erroring, an accidental static
 * import would silently pull ~13 MB into the main graph and every one of these flows would pay it.
 * The guard therefore matters MORE than it did when it was written, not less.
 *
 * Checked against EVERY response, and against response BODIES as well as URLs. Previously the byte
 * recorder discarded anything that did not already match ESTIMATOR_ASSET before the tombstone was
 * ever consulted, and ESTIMATOR_ASSET contains neither `\bonnx\b` nor `tensorflow` — so two of the
 * five patterns could not fire at all, and a runtime bundled under a hashed chunk name could not
 * fire under any of them. The body marks are what make this survive minification and hashing.
 */
const RUNTIME_TOMBSTONE = /onnxruntime|ort-wasm|\bonnx\b|tfjs|tensorflow/i;
const RUNTIME_BODY_MARKS = ['onnxruntime', 'ort-wasm', '@tensorflow/tfjs'];

/**
 * BUDGETS ARE AGAINST THE DEV SERVER, which is what playwright.config.js starts. That makes them
 * much larger than what a user downloads, and the gap is not slack — it is measurable:
 *
 *   meme_gate.json on disk                                 735,876 B
 *   …served by Vite as an ES module (`?raw`, JSON escaped)  ~760,000 B
 *   …plus the inline base64 sourcemap Vite appends        ~3,780,000 B
 *   …and the dev server does not gzip at all
 *   -------------------------------------------------------------------
 *   what this test observes for the model module           ~4,540,000 B
 *   what a user actually transfers (production, gzipped)      169,135 B
 *
 * So the ceiling here is ~6 MB, and it would be dishonest to present that as the cost of the
 * feature. The user-facing cost is asserted separately, from the artifact on disk, in the same
 * test. Do NOT "tighten" this to the production number — it will fail, and the fix someone reaches
 * for is deleting the assertion.
 *
 * ONLY THE BUDGETS ARE DEV-SPECIFIC. Everything else in this file is now classified from response
 * bodies (see MODEL_MARK / ESTIMATOR_MARKS), so the zero-bytes assertions, the "exactly one fetch"
 * assertion and the runtime tombstone all mean the same thing against a production build, where
 * these budgets are simply never approached. That was the point of the change: the byte invariant
 * used to be asserted only against a server whose URLs happen to contain the words being matched.
 */
const DEV_TOTAL_BUDGET = 6_000_000;
/**
 * A non-MEME method may load ONE estimator module: prescreen/scope.js, the import-free leaf that
 * answers "is there an estimate for this method?". Measured at 9,874 B on the dev server
 * (unminified, inline sourcemap) across a whole session — boot, demo file, Analyze tab, select FEL.
 * The next smallest thing it could accidentally pull in is hitLikelihood.js at 62 KB, so the
 * headroom here does not admit a real regression; and the test names the offending URL rather than
 * only reporting that a number grew. Against a production build this is 0, because scope.js is
 * inlined into the main graph and the estimator is not fetched at all.
 */
const FEL_TOTAL_BUDGET = 25_000;
/** What the user actually pays. Re-derived from the file, so it cannot drift from the artifact. */
const SHIPPED_RAW_CEILING = 800_000;
const SHIPPED_GZIP_CEILING = 200_000;

/**
 * Record EVERY response — url, decoded size, and the body itself for classification — from now
 * until the returned function is called.
 *
 * It records everything rather than pre-filtering by URL, for two reasons that both bit the
 * previous version. Pre-filtering made the runtime tombstone unable to fire (a response had to
 * match the estimator pattern before the tombstone was consulted), and it made the whole recorder
 * blind to anything whose name is a content hash, which in a production build is everything.
 */
function trackBytes(page) {
	const seen = [];
	page.on('response', async (response) => {
		const url = response.url();
		let body = null;
		let bytes = 0;
		try {
			body = await response.body();
			bytes = body.length;
		} catch {
			bytes = Number(response.headers()['content-length'] || 0);
		}
		seen.push({ url, bytes, body });
	});
	return () => seen;
}

/** Does this response's payload contain `needle`? Buffer.includes, so no MB-scale string copies. */
const carries = (r, needle) => r.body !== null && r.body.includes(needle);

/** The 735 KB model file, however it is named and however it is wrapped. */
const isModel = (r) => carries(r, MODEL_MARK);
/** The estimator's component/walker chunk or its stylesheet, however either one is named. */
const isEstimatorCode = (r) => ESTIMATOR_MARKS.some((m) => carries(r, m));
/** Anything at all belonging to the estimator, including the dev server's source-path modules. */
const isEstimatorTransfer = (r) => isModel(r) || isEstimatorCode(r) || ESTIMATOR_ASSET.test(r.url);
/** An ML runtime, by name or by content. */
const isRuntime = (r) =>
	RUNTIME_TOMBSTONE.test(r.url) || RUNTIME_BODY_MARKS.some((m) => carries(r, m));

/** Compact, greppable summary for a failure message. */
const describeTransfers = (rows) =>
	JSON.stringify(
		rows.map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+/, ''), bytes: r.bytes })),
		null,
		1
	);

test.describe('MEME hit-likelihood', () => {
	// beforeEach alone can spend 60s in freshStart, 30s loading the demo file and 30s waiting for
	// the dropdown, which does not fit the global 60s cap once 4 workers are contending for one dev
	// server. Without this the suite is merely flaky-and-retried rather than failing, which is worse
	// than either — it hides whether the estimator or the harness is the slow one.
	test.setTimeout(180000);

	test.beforeEach(async ({ page }) => {
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		// Retry the navigation rather than assuming one click lands. Two things make a single
		// attempt unreliable: goToAnalyzeTab returns false instead of throwing when the tab is not
		// yet clickable, and the marker loadDemoFile waits on (sequence-info) is the unconditional
		// root of dataReaderResults, so it appears when that component mounts rather than when the
		// file becomes the active selection. In between, clicking Analyze can land back on Data with
		// "Upload or select a file to get started" and no dropdown at all — which then surfaces much
		// later as a missing estimator row and reads as a flaky feature rather than a missed click.
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({
				timeout: 5000
			});
		}).toPass({ timeout: 60000 });
	});

	test('renders a level, a reason and its basis when MEME is selected', async ({ page }) => {
		await selectMethod(page, 'MEME');

		const row = page.locator('[data-testid="meme-hit-likelihood"]');
		// Longer than the other waits: this is the first assertion in the suite that forces the row
		// to mount, so the dev server transforms MemeHitLikelihood and its import graph here —
		// including the 735 KB model. Every later wait hits a warm module graph.
		await expect(row).toBeVisible({ timeout: 60000 });

		// It resolves to one of the resolved statuses — never to blank space. 'not-applicable' is a
		// real state now (MEME selected with no alignment behind it, which a rejected upload can
		// reach), so this regex is an assertion that beforeEach's demo file really did load, not a
		// tautology over every value the attribute can take.
		await expect(row).toHaveAttribute('data-status', /^(ok|cannot-assess|error)$/, {
			timeout: 30000
		});
		const status = await row.getAttribute('data-status');

		if (status === 'ok') {
			expect(['likely', 'uncertain', 'unlikely']).toContain(await row.getAttribute('data-level'));
			// The band name is three words and cannot carry a rate, so the lead that states one is
			// mandatory and above the fold. This is the line that stops a badge reading as a verdict.
			const lead = row.locator('[data-testid="hit-likelihood-lead"]');
			await expect(lead).toBeVisible();
			await expect(lead).toContainText(/p ≤ 0\.1/);
		}
		// Whatever the status, the row explains itself in words rather than showing a bare number.
		expect((await row.innerText()).trim().length).toBeGreaterThan(20);

		// The claim is sourced: opening the basis discloses the caveat and what the model is.
		await row.locator('[data-testid="hit-likelihood-basis-toggle"]').click();
		const basis = row.locator('[data-testid="hit-likelihood-basis"]');
		await expect(basis).toBeVisible();
		await expect(basis).toContainText('not whether this gene is under selection');
		await expect(basis).toContainText('Gradient-boosted trees');

		// The score itself is never rendered. Three bands are what the outcome data establishes; a
		// per-alignment percentage would advertise a resolution this estimate does not have, and it
		// would invite reading a rate over a population as a probability about one alignment.
		await expect(row.locator('[data-testid="hit-likelihood-probability"]')).toHaveCount(0);

		// It lives inside the single "Before you run" panel, alongside the runtime estimate,
		// rather than as a second coloured box stacked above it.
		const panel = page.locator('[data-testid="run-outlook"]');
		await expect(panel).toHaveCount(1);
		await expect(panel.locator('[data-testid="meme-hit-likelihood"]')).toHaveCount(1);
		await expect(panel.locator('.timing-estimate')).toHaveCount(1);
	});
});

/**
 * WHAT IT COSTS. Separate from the rendering suite, and NOT sharing its beforeEach, for one
 * structural reason that took a deliberately-failing run to notice:
 *
 * THE RECORDER HAS TO BE ATTACHED BEFORE THE FIRST BYTE. When these tests hung off the shared
 * beforeEach, tracking started after the app had already booted, so the FEL case measured a total of
 * ZERO and passed a 25 KB budget — and would equally have passed a 1-byte budget, which is how the
 * hole was found. Anything pulled in at page load, including the exact regression these tests exist
 * to catch (someone static-importing the estimator back into the entry graph, so all ~14 estimate-
 * less methods pay for it again), was fetched before the listener existed and was therefore
 * invisible. Each test below owns its whole page lifecycle, with the recorder attached first.
 */
test.describe('MEME hit-likelihood cost', () => {
	test.setTimeout(180000);

	/** Attach the recorder, THEN boot the app and get to a state where a method can be chosen. */
	async function bootTracked(page) {
		const bytes = trackBytes(page);
		await freshStart(page);
		await loadDemoFile(page, 'CD2-slim.fna');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });
		return bytes;
	}

	test('a non-MEME method (FEL) downloads none of the estimator payload', async ({ page }) => {
		const bytes = await bootTracked(page);
		await selectMethod(page, 'FEL');
		// Give it the whole budget the estimator would have needed, then measure.
		await page.waitForTimeout(5000);

		await expect(page.locator('[data-testid="meme-hit-likelihood"]')).toHaveCount(0);
		// The runtime row is still there — the panel is not MEME-only.
		await expect(page.locator('[data-testid="run-outlook"] .timing-estimate')).toHaveCount(1);

		const all = bytes();
		// RECORDER LIVENESS, proven from the session rather than from a module that happens to be
		// split out. An empty `seen` would make every assertion below pass over nothing, and that is
		// not hypothetical: the first version of these tests hung off a shared beforeEach, started
		// recording after the app had booted, measured a total of zero, and would have passed a
		// 1-byte budget. This is the assertion that rules that out, and unlike the old
		// `total > 0` on estimator bytes it does not quietly become false in a production build,
		// where scope.js is inlined and there is no estimator transfer to count.
		expect(all.length, 'the response recorder captured nothing at all').toBeGreaterThan(20);

		// NOT ONE BYTE of the model, across the whole session. This is the assertion the entire
		// lazy-import arrangement exists to satisfy, and it got 40x more valuable when the payload
		// went from a ~17 KB coefficient table to a 735 KB model file. Matched on the model's own
		// bytes, so it holds against a hashed production chunk as well as the dev module.
		// Asserted on the URLs rather than on the rows: a row carries its whole response body, and a
		// failure dump of a 4.5 MB model buffer is unreadable in a CI log.
		const payload = all.filter(isModel);
		expect(
			payload.map((r) => r.url),
			`unexpected model payload: ${describeTransfers(payload)}`
		).toHaveLength(0);

		// And not one byte of its CODE either — component, walker or stylesheet. This is the half
		// that was not true in production: SvelteKit lists a dynamically-imported component's CSS in
		// the ROUTE's stylesheet array, so MemeHitLikelihood's <style> block came down as an
		// unconditional <link> on every page load, for every method. It now travels as a string
		// inside the lazily-imported chunk (see MemeHitLikelihood.css), which is why this can be a
		// hard zero rather than a budget.
		const code = all.filter(isEstimatorCode);
		expect(
			code.map((r) => r.url),
			`unexpected estimator code: ${describeTransfers(code)}`
		).toHaveLength(0);

		// No ML runtime, by name or by content, anywhere in the session.
		const runtime = all.filter(isRuntime);
		expect(
			runtime.map((r) => r.url),
			`an ML runtime was fetched: ${describeTransfers(runtime)}`
		).toHaveLength(0);

		// The only estimator module a non-MEME method may touch is the import-free scope leaf that
		// answers "is there an estimate for this method?" — RunOutlook asks it before deciding
		// whether to load any of the rest. Named rather than inferred from a byte count: a small
		// module sneaking in under the budget is exactly the drift this is here to stop.
		const estimator = all.filter(isEstimatorTransfer);
		for (const r of estimator) {
			expect(r.url, `FEL loaded an estimator module it does not need`).toMatch(SCOPE_LEAF);
		}
		// The budget is against the DEV server (unminified, inline sourcemaps) and covers two full
		// page loads, since freshStart navigates and then reloads. Against a production build the
		// same sum is 0.
		const total = estimator.reduce((n, r) => n + r.bytes, 0);
		expect(total, `estimator transfer for FEL: ${describeTransfers(estimator)}`).toBeLessThan(
			FEL_TOTAL_BUDGET
		);
	});

	test('MEME downloads the model once, and it is the artifact on disk', async ({ page }) => {
		const bytes = await bootTracked(page);
		await selectMethod(page, 'MEME');
		await expect(page.locator('[data-testid="meme-hit-likelihood"]')).toBeVisible({
			timeout: 60000
		});
		await page.waitForTimeout(3000);

		const all = bytes();
		const estimator = all.filter(isEstimatorTransfer);
		const total = estimator.reduce((n, r) => n + r.bytes, 0);

		// The model IS fetched — that is the point of the lazy import, and its absence would mean the
		// row above rendered something other than a real score. Exactly once: not per render, and not
		// once per method switch. Identified by the model's own bytes, so this counts the same thing
		// whether the server names it `meme_gate.json?import&raw` or `chunks/<hash>.js`.
		const modelHits = all.filter(isModel);
		expect(
			modelHits.length,
			`expected exactly one fetch of the model; saw ${describeTransfers(estimator)}`
		).toBe(1);

		// And the row really is driven by the estimator chunk, not by something inlined into the
		// main bundle — otherwise "the model is fetched lazily" would be true and irrelevant.
		expect(
			all.filter(isEstimatorCode).length,
			'the estimator chunk was never fetched'
		).toBeGreaterThan(0);

		// No ML runtime, now or ever again — checked over every response in the session, by URL and
		// by content.
		const runtime = all.filter(isRuntime);
		expect(
			runtime.map((r) => r.url),
			`an ML runtime was fetched: ${describeTransfers(runtime)}`
		).toHaveLength(0);

		// WHAT THE USER ACTUALLY PAYS, measured from the artifact rather than from this transfer.
		// The browser cannot observe it here: the dev server serves the model as an escaped ES module
		// with a ~3.8 MB inline sourcemap and applies no compression, so the wire number in this test
		// is roughly 27x the production one. Measuring the file keeps the honest number in the suite
		// instead of leaving "~169 KB gzipped" as a claim that nothing anywhere checks.
		const raw = statSync(MODEL_PATH).size;
		const gzipped = gzipSync(readFileSync(MODEL_PATH)).length;
		expect(raw, `${MODEL_PATH} is ${raw} B raw`).toBeLessThan(SHIPPED_RAW_CEILING);
		expect(gzipped, `${MODEL_PATH} is ${gzipped} B gzipped`).toBeLessThan(SHIPPED_GZIP_CEILING);

		// The dev-server ceiling. See DEV_TOTAL_BUDGET — deliberately loose against a measured
		// ~5.03 MB, and the assertion that fails if a second model, a runtime, or a duplicated import
		// shows up.
		expect(total, `estimator transfer: ${describeTransfers(all)}`).toBeLessThan(DEV_TOTAL_BUDGET);
	});
});

test.describe('MEME hit-likelihood routing', () => {
	// Same reasoning as above, and this one is heavier: it uploads real alignments and waits on
	// datareader plus NJ inference before it can even select a method.
	test.setTimeout(180000);

	/** freshStart + upload + land on the Analyze tab with the dropdown available. */
	async function uploadAndAnalyze(page, name, contents) {
		await freshStart(page);
		await page.locator('input[type="file"]').setInputFiles({
			name,
			mimeType: 'text/plain',
			buffer: Buffer.from(contents)
		});
		await expect(page.locator('[data-testid="sequence-info"]')).toBeVisible({ timeout: 60000 });
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });
	}

	test('a discouraging estimate says what about the data would change it', async ({ page }) => {
		// 4 taxa x 200 codons, two substitutions each on disjoint sites: the thin-and-shallow shape
		// that the low band is made of (its real population medians 4 sequences and ~140 codons).
		await uploadAndAnalyze(page, 'synthetic-thin.fna', lowDivergenceAlignment(4, 200, 2));
		await selectMethod(page, 'MEME');

		const row = page.locator('[data-testid="meme-hit-likelihood"]');
		await expect(row).toHaveAttribute('data-status', 'ok', { timeout: 60000 });
		// Asserted, not skipped past. This shape landing in the low band is the premise of every
		// sentence checked below; if a retrain moves it, this copy needs re-deriving rather than the
		// test needing relaxing.
		await expect(row).toHaveAttribute('data-level', 'unlikely');

		// Guidance is about the alignment, not about swapping methods. The model was trained on one
		// label — did MEME report a site — so it has nothing to say about any other method.
		const guidance = row.locator('[data-testid="hit-likelihood-guidance"]');
		await expect(guidance).toBeVisible();
		await expect(guidance).toContainText(/more divergent|more sequences/i);

		// The band states a FREQUENCY and states the other side of it, so no reader has to invert a
		// fraction to know what "rarely" cost them.
		const lead = row.locator('[data-testid="hit-likelihood-lead"]');
		await expect(lead).toContainText(/1 in 20/);
		await expect(lead).toContainText(/the other 19/);
		await expect(row.locator('[data-testid="hit-likelihood-rarity"]')).toContainText(
			/Fewer than 3 in 100/
		);
		// And it says outright that it is not a stop. 1 in 20 is small, not zero, and MEME runs are
		// cheap; the estimate is advisory and never blocks anything.
		await expect(lead).toContainText(/not a reason to skip the run/);

		// The forbidden phrasings are matched NARROWLY on purpose. A looser pattern (say, a bare
		// /skip/) fires on the sentence directly above — "It is a caution, not a reason to skip the
		// run" — and would fail the copy for saying exactly the right thing. These are assertions,
		// not verdicts a negation can flip.
		const text = await row.innerText();
		expect(text).not.toMatch(/will (not|never) find|not worth running|do not bother|is futile/i);
		// No bare per-alignment percentage: the row shows the band, never the score behind it.
		await expect(row.locator('[data-testid="hit-likelihood-probability"]')).toHaveCount(0);

		// The regression guard for that scope decision, asserted on what a user can actually read.
		expect(text).not.toMatch(/\b(BUSTED|aBSREL|FUBAR|FEL|SLAC|PRIME|RELAX|GARD|BGM|FADE)\b/i);
		await expect(row.locator('[data-testid="hit-likelihood-action"]')).toHaveCount(0);
	});

	test('thin-per-site data still gets MEME-only guidance', async ({ page }) => {
		// 20 taxa x 800 codons at low divergence: plenty of substitutions in total, not enough at any
		// one site for MEME. This is the shape that used to be routed to another method.
		await uploadAndAnalyze(
			page,
			'synthetic-low-divergence.fna',
			syntheticAlignment(20, 800, 0.015)
		);
		await selectMethod(page, 'MEME');

		const row = page.locator('[data-testid="meme-hit-likelihood"]');
		await expect(row).toHaveAttribute('data-status', 'ok', { timeout: 60000 });

		const text = await row.innerText();
		expect(text).toMatch(/MEME/);
		expect(text).not.toMatch(/\b(BUSTED|aBSREL|FUBAR|FEL|SLAC|PRIME|RELAX|GARD|BGM|FADE)\b/i);
		await expect(row.locator('[data-testid="hit-likelihood-action"]')).toHaveCount(0);

		// The disclosure is where the estimate is most tempted to compare itself to other methods,
		// and it is the one part a curious user opens on purpose. Check it too, not just the summary.
		await row.locator('[data-testid="hit-likelihood-basis-toggle"]').click();
		const basis = row.locator('[data-testid="hit-likelihood-basis"]');
		await expect(basis).toBeVisible();
		expect(await basis.innerText()).not.toMatch(
			/\b(BUSTED|aBSREL|FUBAR|FEL|SLAC|PRIME|RELAX|GARD|BGM|FADE)\b/i
		);

		// The estimate still applies only to MEME: switching away removes it entirely.
		await selectMethod(page, 'FEL');
		await expect(page.locator('[data-testid="meme-hit-likelihood"]')).toHaveCount(0);
	});
});
