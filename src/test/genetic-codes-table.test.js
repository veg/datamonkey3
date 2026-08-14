/**
 * UX item 1.2 — the genetic code table must be the SHIPPED ENGINE's table, not one we invented.
 *
 * Three tables disagreed. The selector offered names of its own ('Vertebrate mitochondrial');
 * methodOptions.toml and the vendored chooseGeneticCode.def offered spaced ones ('Vertebrate
 * mtDNA'); and hyphy.wasm 2.5.98 — the thing that actually runs — accepts neither. It declares
 * hyphenated identifiers ('Vertebrate-mtDNA') and rejects everything else:
 *
 *     'mtDNA' is not a valid choice passed to 'Choose Genetic Code' ChoiceList
 *
 * So the authority here is static/wasm/hyphy/2.5.98/hyphy.data, the packed filesystem image
 * shipped with the engine. This test reads `_geneticCodeOptionMatrix` straight out of it. Pinning
 * to src/data/shared/chooseGeneticCode.def instead would pin the exact stale spellings that caused
 * the bug — that file is an older vendored copy, mounted only for the upload-time datareader,
 * which never selects a code and so never noticed the drift.
 *
 * Two properties are checked, and the second is the one that matters most:
 *   - SPELLING, because a name the engine does not recognise fails the run outright;
 *   - ORDER, because the server path sends the numeric id and HyPhy resolves it BY POSITION in
 *     this same matrix. A table in the wrong order runs a different code than the UI displays and
 *     reports no error at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import toml from 'toml';
import {
	GENETIC_CODES,
	geneticCodeId,
	canonicalGeneticCodeName
} from '../lib/config/geneticCodes.js';
import tomlSrc from '../lib/config/methodOptions.toml?raw';

const OUR_NAMES = GENETIC_CODES.map((code) => code.hyphy);

/**
 * The identifiers the shipped engine declares, in declaration order.
 *
 * hyphy.data is Emscripten's packed filesystem blob: batch files are stored as plain text inside
 * it, so the declaration can be read directly. Latin-1 keeps byte offsets honest across the
 * binary regions surrounding it.
 */
function namesFromShippedEngine() {
	const blob = readFileSync('static/wasm/hyphy/2.5.98/hyphy.data', 'latin1');
	const start = blob.indexOf('_geneticCodeOptionMatrix = {');
	expect(start, 'genetic code matrix not found in the packed engine').toBeGreaterThan(-1);
	const end = blob.indexOf('};', start);
	const block = blob.slice(start, end);
	return [...block.matchAll(/"([^"]+)",\s*"[^"]*transl_table/g)].map((m) => m[1]);
}

describe('genetic code table matches the shipped HyPhy engine', () => {
	it('ids are a dense 0..11 range in declaration order', () => {
		expect(GENETIC_CODES.map((code) => code.id)).toEqual([...Array(12).keys()]);
	});

	it('names AND order match the engine, which indexes this matrix by position', () => {
		const engineNames = namesFromShippedEngine();
		// The engine offers more codes than we expose; ours must be its first twelve, in order.
		// (See geneticCodes.js for why 12-21 are deliberately withheld.)
		expect(engineNames.length).toBeGreaterThanOrEqual(12);
		expect(OUR_NAMES).toEqual(engineNames.slice(0, 12));
	});

	it('the documented CLI choices in methodOptions.toml say the same thing', () => {
		const codeOption = toml.parse(tomlSrc).fel.options.find((option) => option.name === 'code');
		expect(codeOption).toBeTruthy();
		expect(OUR_NAMES).toEqual(codeOption.choices.map((choice) => choice.value));
	});

	it('every exposed id has a stop-codon set, so validation cannot silently use the wrong one', async () => {
		// fastaValidation keys STOP_CODONS_BY_GENETIC_CODE by id and falls back to Universal for
		// anything missing. Exposing a code it does not know would validate against the wrong
		// stop set without erroring — which is why the table stops at 11.
		const { findStopCodons } = await import('../lib/utils/fastaValidation.js');
		const alignment = '>a\nATGTAAATG\n>b\nATGAGAATG\n';
		const universalStops = findStopCodons(alignment, 0).affected.length;
		// Vertebrate mtDNA reads AGA as a stop where the universal code does not; if id 1 fell
		// back to the universal set these two would agree.
		const vertebrateStops = findStopCodons(alignment, 1).affected.length;
		expect(vertebrateStops).not.toBe(universalStops);
	});

	it('resolves canonical and both legacy spellings to the same id', () => {
		expect(geneticCodeId('Vertebrate-mtDNA')).toBe(1);
		// What older builds of the selector stored...
		expect(geneticCodeId('Vertebrate mitochondrial')).toBe(1);
		// ...and what the vendored .def / methodOptions.toml used to say.
		expect(geneticCodeId('Vertebrate mtDNA')).toBe(1);
		expect(geneticCodeId('Blepharisma nuclear')).toBe(11);
		expect(geneticCodeId('Universal')).toBe(0);
		expect(geneticCodeId(undefined)).toBe(0);
	});

	it('leaves an unrecognised name alone rather than pretending it is Universal', () => {
		// On the WASM path this value goes to `--code`; a loud HyPhy rejection beats quietly
		// analysing the data under a code the user did not choose.
		expect(canonicalGeneticCodeName('Klingon mtDNA')).toBe('Klingon mtDNA');
		expect(canonicalGeneticCodeName('Vertebrate mitochondrial')).toBe('Vertebrate-mtDNA');
	});
});
