import { defineConfig, devices } from '@playwright/test';

/**
 * Specs that genuinely depend on the Pixel 5 viewport.
 *
 * Before this, neither project set a filter, so every spec ran twice — measured at 46.4m of 89.3m
 * total CPU-time for mobile-chrome, i.e. half the suite, to re-run desktop tests at a narrower
 * width. Only these two exercise anything viewport-dependent:
 *
 *   14-responsive       — explicitly a mobile spec; its own header says so.
 *   10-branch-selector  — carries a mobile-only workaround (force:true, because the advanced-options
 *                         panel overlaps the r=3 SVG node and intercepts pointer events at narrow
 *                         width), so it tests something desktop cannot reach.
 *
 * 14-responsive is additionally excluded from chromium: at desktop width its assertions are
 * trivially satisfied and prove nothing.
 */
const MOBILE_SPECS = /(10-branch-selector|14-responsive)\.spec\.js$/;
const DESKTOP_ONLY_EXCLUDE = /14-responsive\.spec\.js$/;

export default defineConfig({
	testDir: './e2e',

	// File-level parallelism only was the binding constraint: measured speedup was 2.4x on 4 workers,
	// because a 10-test spec ran as one serial chain. No spec uses describe.serial or shares state
	// through beforeAll — every heavy one has its own beforeEach — so per-test distribution is safe.
	fullyParallel: true,

	forbidOnly: !!process.env.CI,

	// Locally you want the fast red: a retry doubles the cost of a genuine failure, and a suite that
	// hides flakes behind a retry is worse than one that shows them. CI keeps its retries.
	retries: process.env.CI ? 2 : 0,

	// 50% of logical cores. Deliberately not higher: several specs run WASM/ONNX inference under
	// wall-clock timeouts, and oversubscribing turns those into timeout flakes rather than speed.
	// Lowered from 50% when the suite grew from 109 to 129 tests. The new specs are WASM- and
	// ONNX-heavy, and at 7 workers the AxoMEME spec failed seven ways under contention while passing
	// 9/9 in isolation — a resource limit reported as test failures. 3 workers is the measured point
	// where that stops.
	workers: process.env.CI ? 1 : 3,

	reporter:
		process.env.E2E_COVERAGE === '1'
			? [
					[
						'monocart-reporter',
						{
							name: 'datamonkey3 e2e coverage',
							outputFile: './coverage-e2e/report.html',
							coverage: {
								entryFilter: (entry) => entry.url.includes('localhost:5173'),
								sourceFilter: (sourcePath) => sourcePath.startsWith('src/'),
								reports: [['v8'], ['console-summary'], ['lcovonly'], ['json-summary']]
							}
						}
					]
				]
			: 'html',
	timeout: 60000,
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
			testIgnore: DESKTOP_ONLY_EXCLUDE
		},
		{
			name: 'mobile-chrome',
			use: { ...devices['Pixel 5'] },
			testMatch: MOBILE_SPECS
		}
	],
	// A built app served statically, rather than `vite dev` transforming modules on demand. Nearly
	// every test calls freshStart(), so the dev server re-pays module-graph cost on each navigation.
	// Verified that `vite preview` serves the adapter-cloudflare build correctly (200 + app HTML).
	//
	// E2E_DEV=1 opts back into `vite dev` when you want HMR while debugging a spec. Note that
	// reuseExistingServer means an already-running dev server on 5173 is used either way, so this
	// only changes what happens on a clean run.
	webServer: process.env.E2E_NO_WEBSERVER
		? undefined
		: {
				command: process.env.E2E_DEV
					? 'npm run dev'
					: 'npm run build && npm run preview -- --port 5173 --strictPort',
				url: 'http://localhost:5173',
				reuseExistingServer: !process.env.CI,
				// Raised from 120s: the default path now builds before it serves.
				timeout: 240000
			}
});
