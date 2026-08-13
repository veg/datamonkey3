/**
 * E2E: what the execution-mode panel says before a long run.
 *
 * SCOPE, stated because it is a real limitation of this environment: there is no socket.io server in
 * the e2e run, so the app is always disconnected here and only the DISCONNECTED branch of the advice
 * is reachable. The connected branch — pre-selecting Backend Server and naming both durations — is
 * covered by src/test/execution-mode-default.test.js, which mounts the component with
 * backendConnectivity forced to connected.
 *
 * TRAP THIS FILE AVOIDS: asserting a bare duration regex like /1h 39m/ against the page body. The
 * "Before you run" panel already prints exactly that string on unfixed main, so a body-text
 * assertion passes either way. Everything below hangs off the advice element's own testid, off the
 * radios' checked/disabled state, and off the advice agreeing with the panel.
 */

import { test, expect } from './fixtures/coverage.js';
import { freshStart, loadDemoFile, goToAnalyzeTab, selectMethod } from './fixtures/helpers.js';

/** The shapes formatTimeDescription() can produce, longest first so '~1h 39m' wins over '~1h'. */
const DURATION = /~\d+d \d+h|~\d+ days?|~\d+h \d+m|~\d+ hours?|~\d+ min|< 1 minute/;

test.describe('Execution mode advice', () => {
	test('warns that a slow browser run needs the tab, and agrees with the outlook panel', async ({
		page
	}) => {
		await freshStart(page);
		// 20 taxa x 85 codons. BGM at that size is 'Slow' in the browser — the app has always known
		// this and always defaulted to running it here anyway.
		await loadDemoFile(page, 'large.nex');
		await expect(async () => {
			await goToAnalyzeTab(page);
			await expect(page.locator('[data-testid="method-dropdown"]')).toBeVisible({ timeout: 5000 });
		}).toPass({ timeout: 60000 });

		await selectMethod(page, 'BGM');

		const advice = page.locator('[data-testid="execution-mode-advice"]');
		await expect(advice).toBeVisible();
		const adviceText = await advice.innerText();
		expect(adviceText).toMatch(/tab must stay open/);
		// With no server reachable, nothing may point at one.
		expect(adviceText).not.toMatch(/on the server/);

		// The duration in the advice is the SAME duration the "Before you run" row prints, because
		// both read one estimate. Two independently-worded numbers on one screen is the failure this
		// couples away.
		const shown = adviceText.match(DURATION);
		expect(shown, `no duration in advice: ${adviceText}`).not.toBeNull();
		await expect(page.locator('[data-testid="run-outlook"]')).toContainText(shown[0]);

		// Disconnected: local stays selected and the server radio stays unavailable.
		await expect(page.locator('input[type="radio"][value="local"]')).toBeChecked();
		await expect(page.locator('input[type="radio"][value="backend"]')).toBeDisabled();

		// FEL on the same file finishes in under a minute either way, so there is nothing to say.
		await selectMethod(page, 'FEL');
		await expect(page.locator('[data-testid="execution-mode-advice"]')).toHaveCount(0);
		await expect(page.locator('input[type="radio"][value="local"]')).toBeChecked();
	});
});
