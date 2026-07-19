/**
 * Playwright test fixture that collects V8 JS coverage per test via the
 * Chromium DevTools Protocol and hands it to monocart-reporter.
 *
 * Specs import { test, expect } from this file instead of '@playwright/test'.
 * Coverage is only collected on Chromium (CDP-only API); other projects run
 * unchanged. Set E2E_COVERAGE=0 to disable collection entirely.
 */
import { test as base, expect } from '@playwright/test';
import { addCoverageReport } from 'monocart-reporter';

const COVERAGE_ENABLED =
	process.env.E2E_COVERAGE !== '0';

export const test = base.extend({
	autoCoverage: [
		async ({ browser, page }, use) => {
			const isChromium = browser.browserType().name() === 'chromium';
			const collect = COVERAGE_ENABLED && isChromium;

			if (collect) {
				await Promise.all([
					page.coverage.startJSCoverage({ resetOnNavigation: false }),
					page.coverage.startCSSCoverage({ resetOnNavigation: false })
				]);
			}

			await use();

			if (collect) {
				const [jsCoverage, cssCoverage] = await Promise.all([
					page.coverage.stopJSCoverage(),
					page.coverage.stopCSSCoverage()
				]);
				await addCoverageReport([...jsCoverage, ...cssCoverage], test.info());
			}
		},
		{ scope: 'test', auto: true }
	]
});

export { expect };
