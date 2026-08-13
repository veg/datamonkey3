/**
 * E2E for UX item 1.2 — a non-universal genetic code must actually reach HyPhy in the browser.
 *
 * This is the only test in the repo that proves it, because it is the only one that runs real
 * hyphy.wasm. The unit tests pin the table and the shape of the exec() call; this pins the
 * consequence: the engine accepts the identifier the UI would send, and produces a result under it.
 *
 * It imports GENETIC_CODES rather than hardcoding a name, so putting any of the old spellings back
 * in the table fails HERE too — against the real engine, not against another copy of our own list.
 *
 * The rejected-spelling case is run as a control. Without it, a spec that only asserts success
 * could pass while the app sent something the engine happens to tolerate; with it, the exact
 * failure mode the fix removes is documented and stays reproducible.
 *
 * ORDER MATTERS: the accepted run goes FIRST. HyPhy runs via Emscripten's callMain, which keeps
 * global state between invocations in the same worker, and a run that aborts during argument
 * parsing is not guaranteed to leave a clean slate behind it.
 *
 * Tagged @slow — it runs a full FEL fit. Runs under `npm run test:e2e:slow`.
 */

import { test, expect } from './fixtures/coverage.js';
import { GENETIC_CODES } from '../src/lib/config/geneticCodes.js';

test.setTimeout(180000);

// The 10-taxon tree from src/test/contrast-fel-wasm.test.js, with its {Set_x} tags stripped —
// this spec is about --code, not branch sets.
const TREE =
	'(((Human:0,Chimp:0):0.02166017600706549,(Baboon:0,RhMonkey:0):0.08454871222214284):0.1898804322701872,((Cow:0.08802139862787406,Horse:0.1770186752804336):0.0450013916056009,(Mouse:0.1219119664814597,Rat:0.03550454062015435):0.1244133402668078):0.01795217374765563,(Pig:0.1592109185107414,Cat:0.07671186476683911):0.01307003277251646):0;';

// Vertebrate mitochondrial: the code a user is most likely to reach for, and the one whose old
// spelling ('Vertebrate mitochondrial' / 'Vertebrate mtDNA') the engine rejects.
const VERTEBRATE_MT = GENETIC_CODES.find((code) => code.id === 1).hyphy;

test.describe('genetic code reaches HyPhy in WASM @slow', () => {
	test('the selector value is accepted by the engine and produces a result', async ({ page }) => {
		// Boot the debug console — initializes Aioli and exposes window.wasmCli.
		await page.goto('/debug/wasm');
		await page.waitForFunction(() => !!window.wasmCli, null, { timeout: 120000 });

		const alignment = await (await page.request.get('/test-data/CD2-slim.fna')).text();
		expect(alignment).toContain('>Human');

		const result = await page.evaluate(
			async ({ alignment, tree, codeName }) => {
				const cli = window.wasmCli;
				const mounted = await cli.mount([
					{ name: 'user.nex', data: alignment },
					{ name: 'user.tree', data: tree }
				]);
				const [alignmentPath, treePath] = mounted;
				const bf = '/res/TemplateBatchFiles/SelectionAnalyses/FEL.bf';

				const tokens = (code) => [
					'LIBPATH=/res/',
					bf,
					'--alignment',
					alignmentPath,
					'--tree',
					treePath,
					'--code',
					code,
					'--branches',
					'All'
				];

				const out = {};

				// The real thing: argv array, program name separate, value exactly as the UI sends it.
				try {
					out.acceptedStdout = await (await cli.exec('hyphy', tokens(codeName))).stdout;
				} catch (e) {
					out.acceptedError = String(e);
				}

				try {
					const blob = await cli.download('/shared/data/user.nex.FEL.json');
					out.jsonText = await (await fetch(blob)).text();
				} catch (e) {
					out.downloadError = String(e);
				}

				// CONTROL: the spelling this app used to send. It is not an identifier the engine
				// declares, so it must still be refused.
				try {
					out.rejectedStdout = await (
						await cli.exec('hyphy', tokens('Vertebrate mitochondrial'))
					).stdout;
				} catch (e) {
					out.rejectedError = String(e);
				}

				return out;
			},
			{ alignment, tree: TREE, codeName: VERTEBRATE_MT }
		);

		// The engine consumed the value, rather than falling back or complaining.
		expect(result.acceptedError, `exec threw: ${result.acceptedError}`).toBeUndefined();
		expect(
			result.acceptedStdout || '',
			`engine rejected '${VERTEBRATE_MT}':\n${result.acceptedStdout}`
		).not.toContain('is not a valid choice passed to');
		// FEL echoes each keyword argument it accepted; this is the engine confirming the code.
		expect(result.acceptedStdout || '').toContain(`>code => ${VERTEBRATE_MT}`);

		// And it ran to completion under that code.
		expect(result.jsonText, `no FEL result JSON. stdout:\n${result.acceptedStdout}`).toBeTruthy();
		expect(result.jsonText.trim().startsWith('<')).toBe(false);
		expect(JSON.parse(result.jsonText)).toHaveProperty('MLE');

		// The control. If this ever stops failing, the spec is no longer proving anything and the
		// alias handling in geneticCodes.js can be revisited.
		expect(
			result.rejectedStdout || '',
			'the old spelling is no longer refused — this control is stale'
		).toMatch(/is not a valid choice passed to 'Choose Genetic Code'/);
	});
});
