/**
 * UX item 1.2 — how the browser path hands arguments to HyPhy.
 *
 * The runner used to build one command STRING and let Aioli's worker split it on spaces
 * (`r == null && (r = e.split(" "), i = r.shift())`). Two things follow from that, and this file
 * pins both fixes:
 *
 *   1. Any argument value containing a space was silently torn into separate argv tokens. With the
 *      old genetic code table that was fatal — `--code Vertebrate mitochondrial` reached HyPhy as
 *      three tokens. The names now sent are hyphenated (see geneticCodes.js), so no CURRENT value
 *      has a space; what the argv array guarantees is that a value which does have one arrives
 *      whole, so HyPhy's complaint names the value the user chose instead of its first word.
 *
 *   2. `geneticCodeId` was not in the skip list, so the generic fall-through emitted a bogus
 *      `--genetic-code-id 0` on every single local run.
 *
 * This drives the REAL runner rather than a re-implementation of its argument builder, because the
 * defect was never in the mapping — it was in how the mapped tokens reached exec().
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The analysis store persists through IndexedDB; stub it so this exercises the runner.
vi.mock('../lib/utils/indexedDBStorage', () => {
	const records = new Map();
	return {
		analysisStorage: {
			getAnalysis: vi.fn(async (id) => records.get(id) ?? null),
			saveAnalysis: vi.fn(async (a) => {
				records.set(a.id, a);
				return a;
			}),
			getAllAnalyses: vi.fn(async () => [...records.values()]),
			deleteAnalysis: vi.fn(async (id) => records.delete(id)),
			clearAllAnalyses: vi.fn(async () => records.clear()),
			__records: records
		}
	};
});

vi.mock('$app/environment', () => ({ browser: true }));

const { aioliStore } = await import('../stores/aioli.js');
const { wasmAnalysisRunner } = await import('../lib/services/WasmAnalysisRunner.js');

const FASTA = `>Human
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT
>Chimp
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT
>Baboon
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCAACTTGGACATTCCT`;

const TREE = `((Human:0.01,Chimp:0.01):0.02,Baboon:0.03);`;

/** Install a fake Aioli CLI and return its exec spy. */
function installFakeCli() {
	const exec = vi.fn(async () => ({ stdout: '' }));
	aioliStore.set({
		mount: async (files) => files.map((f) => `/shared/data/${f.name}`),
		exec,
		download: async () => 'blob:x'
	});
	// executeWasmAnalysis fetches the result file through the blob URL it just downloaded.
	global.fetch = vi.fn(async () => ({
		blob: async () => ({ text: async () => '{"MLE":{}}' })
	}));
	return exec;
}

describe('WASM exec receives an argv array, not a command string', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('passes the program name and argv separately, one token per element', async () => {
		const exec = installFakeCli();

		// Called directly: this bypasses runAnalysis's cache and validation, which are not
		// what is under test here.
		await wasmAnalysisRunner.executeWasmAnalysis(
			'a1',
			'fel',
			{ geneticCode: 'Vertebrate-mtDNA', branchesToTest: 'All', geneticCodeId: 1 },
			FASTA,
			TREE
		);

		expect(exec).toHaveBeenCalledTimes(1);
		const [program, argv] = exec.mock.calls[0];

		// Aioli looks the tool up by `program == 'hyphy'`; anything else throws "Program not found".
		expect(program).toBe('hyphy');
		expect(Array.isArray(argv)).toBe(true);

		// Flags are their own tokens, with the value in the very next element.
		const codeIndex = argv.indexOf('--code');
		expect(codeIndex).toBeGreaterThan(-1);
		expect(argv[codeIndex + 1]).toBe('Vertebrate-mtDNA');
		expect(argv).toContain('--alignment');
		expect(argv).toContain('--tree');
		expect(argv).toContain('--branches');

		// The program name must NOT be repeated inside argv — the worker shifts nothing off an
		// array, so a leading 'hyphy' would reach HyPhy as a positional argument.
		expect(argv).not.toContain('hyphy');

		// Emscripten's callMain wants strings; numeric config values must be stringified.
		expect(argv.every((token) => typeof token === 'string')).toBe(true);

		// geneticCodeId is UI state, not a CLI flag. Before this change the generic fall-through
		// turned it into a bogus '--genetic-code-id 0' on every local run.
		expect(argv).not.toContain('--genetic-code-id');
	});

	it('keeps a value containing a space in a single argv element', async () => {
		const exec = installFakeCli();

		// An unrecognised code name is passed through deliberately (see geneticCodes.js) so HyPhy
		// rejects it loudly. Under the old string form the split made HyPhy report only
		// 'Vertebrate' — naming a value the user never typed. It must arrive whole.
		await wasmAnalysisRunner.executeWasmAnalysis(
			'a2',
			'fel',
			{ geneticCode: 'Vertebrate mitochondrial DNA', branchesToTest: 'All' },
			FASTA,
			TREE
		);

		const argv = exec.mock.calls[0][1];
		expect(argv[argv.indexOf('--code') + 1]).toBe('Vertebrate mitochondrial DNA');
	});

	it('normalises a legacy genetic code name to the identifier the engine declares', async () => {
		const exec = installFakeCli();

		// 'Vertebrate mitochondrial' is what older builds of the selector stored. It is not a
		// HyPhy identifier and never was, so a saved config carrying it must be translated
		// rather than passed through to be rejected.
		await wasmAnalysisRunner.executeWasmAnalysis(
			'a3',
			'fel',
			{ geneticCode: 'Vertebrate mitochondrial', branchesToTest: 'All' },
			FASTA,
			TREE
		);

		const argv = exec.mock.calls[0][1];
		expect(argv[argv.indexOf('--code') + 1]).toBe('Vertebrate-mtDNA');
	});

	it('builds the stored arguments preview from the same tokens', async () => {
		const preview = wasmAnalysisRunner.buildArgumentsPreview(
			'fel',
			{ geneticCode: 'Vertebrate-mtDNA', branchesToTest: 'All', geneticCodeId: 1 },
			TREE
		);

		expect(Array.isArray(preview.argv)).toBe(true);
		expect(preview.argv[preview.argv.indexOf('--code') + 1]).toBe('Vertebrate-mtDNA');
		expect(preview.argv).not.toContain('--genetic-code-id');
		// The joined form is for reading only; argv is stored beside it because the join is
		// ambiguous for any value containing a space.
		expect(preview.command).toContain('--code Vertebrate-mtDNA');
	});
});
