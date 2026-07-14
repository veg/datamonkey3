/**
 * E2E test for NRM (Non-Reversibility Model) WASM execution (#93).
 *
 * NRM is a hyphy-analyses custom analysis whose batch file is NOT packed into the
 * HyPhy WASM /res/ image. It is vendored under static/hyphy-analyses/ and mounted
 * into the WASM filesystem at runtime by WasmAnalysisRunner (all of its
 * LoadFunctionLibrary dependencies are already present in the packed image).
 *
 * This test drives the same primitives WasmAnalysisRunner uses — fetch the vendored
 * .bf, mount it alongside a nucleotide alignment + tree via the Aioli CLI (exposed
 * as window.wasmCli by /debug/wasm), run HyPhy, and confirm a parseable NRM result
 * JSON is produced. It is tagged @slow because it runs a full analysis.
 */

import { test, expect } from '@playwright/test';

test.setTimeout(180000);

test.describe('NRM WASM execution @slow', () => {
	test('vendored NRM.bf is served as a static asset', async ({ page }) => {
		const res = await page.request.get('/hyphy-analyses/NucleotideNonREV/NRM.bf');
		expect(res.ok()).toBe(true);
		const body = await res.text();
		expect(body.length).toBeGreaterThan(1000);
		// Sanity: it is the NRM analysis, not an HTML 404.
		expect(body).toContain('NRM');
		expect(body.trim().startsWith('<')).toBe(false);
	});

	test('NRM runs in WASM and produces result JSON', async ({ page }) => {
		// Boot the debug console — initializes Aioli and exposes window.wasmCli.
		await page.goto('/debug/wasm');
		await page.waitForFunction(() => !!window.wasmCli, null, { timeout: 120000 });

		// Load the fixture alignment + tree (small real nucleotide data with signal).
		const alignment = await (await page.request.get('/test-data/nrm-fixture.fasta')).text();
		const tree = await (await page.request.get('/test-data/nrm-fixture.nwk')).text();
		expect(alignment).toContain('>');
		expect(tree).toContain('(');

		const result = await page.evaluate(
			async ({ alignment, tree }) => {
				const cli = window.wasmCli;
				const bfText = await (
					await fetch('/hyphy-analyses/NucleotideNonREV/NRM.bf')
				).text();

				const mounted = await cli.mount([
					{ name: 'user.nex', data: alignment },
					{ name: 'user.tree', data: tree },
					{ name: 'NRM.bf', data: bfText }
				]);
				const [alignmentPath, treePath, bfPath] = mounted;
				const outputPath = `${alignmentPath}.NRM.json`;

				const cmd = `hyphy LIBPATH=/res/ ${bfPath} --alignment ${alignmentPath} --tree ${treePath} --output ${outputPath}`;
				let stdout = '';
				try {
					const r = await cli.exec(cmd);
					stdout = await r.stdout;
				} catch (e) {
					return { error: String(e), stdout };
				}

				let jsonText = null;
				try {
					const blob = await cli.download(outputPath);
					jsonText = await (await fetch(blob)).text();
				} catch (e) {
					return { error: String(e), stdout };
				}
				return { stdout, jsonText };
			},
			{ alignment, tree }
		);

		// The batch file must have loaded and resolved its /res/ dependencies.
		expect(result.stdout || '').not.toMatch(/is not a valid|could not (find|open|read)/i);

		// A parseable NRM result JSON must be produced.
		expect(result.jsonText, `NRM produced no JSON. stdout:\n${result.stdout}`).toBeTruthy();
		expect(result.jsonText.trim().startsWith('<')).toBe(false);
		const parsed = JSON.parse(result.jsonText);
		expect(parsed).toHaveProperty('fits');
		expect(parsed).toHaveProperty('test results');
	});
});
