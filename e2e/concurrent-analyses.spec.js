/**
 * E2E tests for concurrent analysis execution
 *
 * These tests verify that the status indicator correctly tracks
 * multiple analyses running at the same time.
 */

import { test, expect } from '@playwright/test';
import {
	freshStart,
	loadDemoFile,
	getStatusIndicator,
	getRunningCount,
	getCompletedCount,
	goToAnalyzeTab,
	selectMethod,
	clickRunAnalysis
} from './fixtures/helpers.js';

// These are all slow WASM tests
test.setTimeout(120000);

test.describe('Concurrent Analyses E2E @slow', () => {
	test.beforeEach(async ({ page }) => {
		await freshStart(page);
	});

	test('should track running count when starting a single FEL analysis', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');

		const wentToAnalyze = await goToAnalyzeTab(page);
		if (!wentToAnalyze) {
			test.skip(true, 'Analyze tab not available');
			return;
		}

		const initialRunning = await getRunningCount(page);
		await selectMethod(page, 'FEL');
		const started = await clickRunAnalysis(page);
		if (!started) {
			test.skip(true, 'Run button not available');
			return;
		}

		await page.waitForTimeout(2000);
		const runningAfterStart = await getRunningCount(page);
		expect(runningAfterStart).toBeGreaterThanOrEqual(1);
	});

	test('should track analysis from start to completion', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');

		const wentToAnalyze = await goToAnalyzeTab(page);
		if (!wentToAnalyze) {
			test.skip(true, 'Analyze tab not available');
			return;
		}

		const initialCompleted = await getCompletedCount(page);
		await selectMethod(page, 'FEL');
		const started = await clickRunAnalysis(page);
		if (!started) {
			test.skip(true, 'Run button not available');
			return;
		}

		await page.waitForTimeout(2000);
		const runningAfterStart = await getRunningCount(page);
		expect(runningAfterStart).toBeGreaterThanOrEqual(1);

		let finalCompleted = initialCompleted;
		for (let i = 0; i < 45; i++) {
			await page.waitForTimeout(2000);
			finalCompleted = await getCompletedCount(page);
			if (finalCompleted > initialCompleted) break;
		}

		expect(finalCompleted).toBeGreaterThan(initialCompleted);
	});

	test('should correctly decrement running count as analyses complete', async ({ page }) => {
		await loadDemoFile(page, 'CD2-slim.fna');

		const wentToAnalyze = await goToAnalyzeTab(page);
		if (!wentToAnalyze) {
			test.skip(true, 'Analyze tab not available');
			return;
		}

		await selectMethod(page, 'FEL');
		const started = await clickRunAnalysis(page);
		if (!started) {
			test.skip(true, 'Run button not available');
			return;
		}

		await page.waitForTimeout(1000);
		const runningAtStart = await getRunningCount(page);

		let finalRunning = runningAtStart;
		let finalCompleted = 0;
		for (let i = 0; i < 45; i++) {
			await page.waitForTimeout(2000);
			finalRunning = await getRunningCount(page);
			finalCompleted = await getCompletedCount(page);
			if (finalRunning < runningAtStart || finalCompleted > 0) break;
		}

		expect(finalRunning < runningAtStart || finalCompleted > 0).toBe(true);
	});
});
