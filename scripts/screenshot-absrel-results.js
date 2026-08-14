#!/usr/bin/env node
/**
 * Capture aBSREL results panels for Figure 5.
 *
 * Seeds a known aBSREL result JSON (from hyphy-eye's test-data set,
 * a bat PIGQ alignment with 9 positively-selected branches) directly
 * into the app's IndexedDB and then captures element screenshots of
 * the rendered Results view: phylogenetic tree, branch-by-branch
 * results table, and the summary tiles.
 *
 * Why seed instead of running WASM end-to-end:
 *  - aBSREL via WASM on any non-trivial alignment takes well over 10
 *    minutes; we instead use a pre-computed result that has the
 *    branches-under-selection signal a reader expects to see.
 *  - The visualization code path is identical for seeded vs. WASM
 *    results — what's rendered is exactly what a real run shows.
 *
 * Usage:
 *   node scripts/screenshot-absrel-results.js
 */

import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'Datamonkey_2_0', 'images');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const FIXTURE_PATH =
	process.env.ABSREL_FIXTURE ||
	'/Users/sweaver/Programming/_bioinformatics/hyphy-eye/src/data/absrel_test_data.json';
const DEVICE_SCALE = 3;

if (!fs.existsSync(FIXTURE_PATH)) {
	console.error(`Fixture not found at ${FIXTURE_PATH}`);
	process.exit(1);
}
const FIXTURE = fs.readFileSync(FIXTURE_PATH, 'utf8');

async function clearAllState(page) {
	await page.evaluate(() => {
		return new Promise((resolve) => {
			const req = indexedDB.deleteDatabase('datamonkey-db');
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});
}

async function seedAnalysis(page, resultJson, fileName) {
	return await page.evaluate(
		async ({ resultJson, fileName }) => {
			function openDB() {
				return new Promise((resolve, reject) => {
					const req = indexedDB.open('datamonkey-db', 2);
					req.onupgradeneeded = (e) => {
						const db = e.target.result;
						if (!db.objectStoreNames.contains('files'))
							db.createObjectStore('files', { keyPath: 'id' });
						if (!db.objectStoreNames.contains('analyses'))
							db.createObjectStore('analyses', { keyPath: 'id' });
					};
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				});
			}

			const now = Date.now();
			const fileId = `seeded-file-${now}`;
			const analysisId = `seeded-absrel-${now}`;

			const db = await openDB();

			const fileTx = db.transaction('files', 'readwrite');
			fileTx.objectStore('files').put({
				id: fileId,
				filename: fileName,
				size: 1024,
				type: 'application/octet-stream',
				uploadedAt: now,
				content: 'seeded-content'
			});
			await new Promise((resolve) => {
				fileTx.oncomplete = resolve;
			});

			const analysisTx = db.transaction('analyses', 'readwrite');
			analysisTx.objectStore('analyses').put({
				id: analysisId,
				fileId,
				method: 'absrel',
				status: 'completed',
				result: resultJson,
				createdAt: now - 60000,
				completedAt: now,
				options: {},
				metadata: { executionMode: 'wasm' }
			});
			await new Promise((resolve) => {
				analysisTx.oncomplete = resolve;
			});

			db.close();
			return analysisId;
		},
		{ resultJson, fileName }
	);
}

async function captureElement(page, selector, outPath, { padding = 0 } = {}) {
	const el = page.locator(selector).first();
	await el.waitFor({ state: 'visible', timeout: 30000 });
	await el.scrollIntoViewIfNeeded();
	await page.waitForTimeout(400);
	const box = await el.boundingBox();
	if (!box) throw new Error(`No bounding box for ${selector}`);
	const clip = {
		x: Math.max(0, box.x - padding),
		y: Math.max(0, box.y - padding),
		width: box.width + padding * 2,
		height: box.height + padding * 2
	};
	await page.screenshot({ path: outPath, clip, omitBackground: false });
	console.log(`  ✓ ${path.basename(outPath)}  ${Math.round(clip.width)}x${Math.round(clip.height)}`);
}

async function main() {
	console.log(`Launching chromium @ ${DEVICE_SCALE}x...`);
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1600, height: 1100 },
		deviceScaleFactor: DEVICE_SCALE
	});
	const page = await context.newPage();

	page.on('console', (msg) => {
		if (msg.type() === 'error') console.log('[browser error]', msg.text());
	});

	console.log('Open + clear state...');
	await page.goto(BASE_URL + '/');
	await clearAllState(page);

	console.log('Seed pre-computed aBSREL result...');
	const id = await seedAnalysis(page, FIXTURE, 'PIGQ_bats.fa');
	console.log(`  seeded analysis id: ${id}`);

	await page.reload();
	await page.waitForSelector('.sample-card', { timeout: 60000 });

	console.log('→ Results tab');
	const resultsTab = page.locator('button:has-text("Results")').first();
	await resultsTab.click();
	await page.waitForTimeout(800);

	const cards = page.locator('[data-testid="analysis-card"]');
	await cards.first().waitFor({ state: 'visible', timeout: 15000 });
	await cards.first().click();

	console.log('Wait for aBSREL viz to mount...');
	await page.locator('.absrel-visualization').first().waitFor({ state: 'visible', timeout: 60000 });
	await page.locator('.tree-container svg').first().waitFor({ state: 'visible', timeout: 60000 });
	await page.waitForTimeout(3500);

	// Sort table by p-value ascending so significant rows are at the top.
	const pCol = page.locator('th.sortable', { hasText: 'p-value' }).first();
	if (await pCol.isVisible().catch(() => false)) {
		await pCol.click();
		await page.waitForTimeout(400);
		// Click again if needed to switch to ascending — header shows ↑ when asc.
		const arrow = await pCol.locator('.sort-indicator').textContent();
		if (arrow && arrow.trim() === '↓') {
			await pCol.click();
			await page.waitForTimeout(400);
		}
	}

	console.log('Capture panels...');

	await captureElement(
		page,
		'.plot-section:has(.tree-container)',
		path.join(OUT_DIR, 'figure5-panelA-tree.png')
	);

	// Panel B: capture only the top portion of the rate table (header + ~8 rows)
	// so it sits at a reasonable aspect ratio in the composite.
	{
		const sec = page.locator('.rate-table-section:has(.rate-table)').first();
		await sec.scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);
		const sectionBox = await sec.boundingBox();
		if (!sectionBox) throw new Error('No box for rate-table-section');
		const headerEl = sec.locator('.rate-table thead').first();
		const headerBox = await headerEl.boundingBox();
		const rows = sec.locator('.rate-table tbody tr');
		const visibleRows = 8;
		const lastRow = rows.nth(visibleRows - 1);
		const lastRowBox = await lastRow.boundingBox();
		const titleAreaTop = sectionBox.y;
		const tableBottom = lastRowBox.y + lastRowBox.height;
		const clip = {
			x: sectionBox.x,
			y: titleAreaTop,
			width: sectionBox.width,
			height: tableBottom - titleAreaTop + 4
		};
		await page.screenshot({
			path: path.join(OUT_DIR, 'figure5-panelB-table.png'),
			clip
		});
		console.log(
			`  ✓ figure5-panelB-table.png  ${Math.round(clip.width)}x${Math.round(clip.height)} (top ${visibleRows} rows)`
		);
	}

	// Panel C: detail view of the top-significant branch, captured by
	// cropping a single row from the rate table. This is the per-branch
	// ω-class rate distribution preferred in the figure spec — shown
	// enlarged enough that the numeric rate values and the inline mini
	// ω plot are both readable.
	{
		const sec = page.locator('.rate-table-section:has(.rate-table)').first();
		await sec.scrollIntoViewIfNeeded();
		await page.waitForTimeout(300);
		const headerEl = sec.locator('.rate-table thead').first();
		const headerBox = await headerEl.boundingBox();
		const firstRow = sec.locator('.rate-table tbody tr').first();
		const rowBox = await firstRow.boundingBox();
		const sectionBox = await sec.boundingBox();
		if (!headerBox || !rowBox || !sectionBox)
			throw new Error('No box for rate-table header/row');
		const clip = {
			x: sectionBox.x,
			y: headerBox.y,
			width: sectionBox.width,
			height: rowBox.y + rowBox.height - headerBox.y + 2
		};
		await page.screenshot({
			path: path.join(OUT_DIR, 'figure5-panelC-detail.png'),
			clip
		});
		console.log(
			`  ✓ figure5-panelC-detail.png  ${Math.round(clip.width)}x${Math.round(clip.height)} (top-significant branch detail)`
		);
	}

	await browser.close();
	console.log('Done.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
