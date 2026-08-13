/**
 * geneticCodes.js — the single source of truth for genetic code identity in this app.
 *
 * There are three consumers and they had three different tables, which is how a UI that said
 * "Vertebrate mitochondrial DNA code" ended up analysing data under the universal code:
 *
 *   - the browser (WASM) path passes a NAME to HyPhy on the command line (`--code <name>`), and
 *     HyPhy only accepts the identifiers it declares itself;
 *   - the server path passes a numeric ID (`gencodeid`), which HyPhy resolves BY POSITION in that
 *     same table;
 *   - the stop-codon validator (fastaValidation.js) keys its per-code stop sets by that same ID.
 *
 * WHERE `hyphy` COMES FROM, and why it looks nothing like what this repo used to send:
 * the authority is the engine we actually ship — static/wasm/hyphy/2.5.98/hyphy.data, whose packed
 * `_geneticCodeOptionMatrix` declares hyphenated, space-free identifiers ('Vertebrate-mtDNA').
 * It is NOT src/data/shared/chooseGeneticCode.def, which is an older vendored copy carrying spaced
 * spellings ('Vertebrate mtDNA'); that file is mounted only for the upload-time datareader, which
 * never selects a code, so its drift went unnoticed. Passing any spaced name to the shipped engine
 * gets it rejected outright:
 *
 *     'mtDNA' is not a valid choice passed to 'Choose Genetic Code' ChoiceList
 *
 * src/test/genetic-codes-table.test.js reads hyphy.data and fails if this table drifts from it.
 * `label` is ours and may be reworded freely; it is display only.
 *
 * WHY ONLY TWELVE. The shipped engine offers twenty-two codes; ids 12-21 (Chlorophycean-mtDNA and
 * later) are deliberately not exposed. They are unverified against the analysis server, which
 * receives the numeric id, and they are absent from STOP_CODONS_BY_GENETIC_CODE in
 * fastaValidation.js, where an unknown id falls back to the universal stop set — a stop-codon
 * check that quietly validates against the wrong code is worse than a code we do not offer.
 * Exposing them means extending both, and verifying the server, first.
 *
 * LEGACY_CODE_ALIASES exists because two older spellings are still in circulation: the names the
 * MethodSelector invented ('Vertebrate mitochondrial'), which sit in saved analysis configs and in
 * Storybook fixtures, and the spaced names from the vendored .def and methodOptions.toml
 * ('Vertebrate mtDNA'). Resolving them keeps an old config running the code it names instead of
 * silently falling back to Universal.
 */

/** @typedef {{ id: number, hyphy: string, label: string }} GeneticCode */

/** Ordered exactly as the shipped engine declares them; `id` is the row index HyPhy indexes by. */
export const GENETIC_CODES = [
	{ id: 0, hyphy: 'Universal', label: 'Universal code' },
	{ id: 1, hyphy: 'Vertebrate-mtDNA', label: 'Vertebrate mitochondrial DNA code' },
	{ id: 2, hyphy: 'Yeast-mtDNA', label: 'Yeast mitochondrial DNA code' },
	{
		id: 3,
		hyphy: 'Mold-Protozoan-mtDNA',
		label: 'Mold, Protozoan and Coelenterate mt; Mycloplasma/Spiroplasma'
	},
	{ id: 4, hyphy: 'Invertebrate-mtDNA', label: 'Invertebrate mitochondrial DNA code' },
	{ id: 5, hyphy: 'Ciliate-Nuclear', label: 'Ciliate, Dasycladacean and Hexamita Nuclear code' },
	{ id: 6, hyphy: 'Echinoderm-mtDNA', label: 'Echinoderm mitochondrial DNA code' },
	{ id: 7, hyphy: 'Euplotid-Nuclear', label: 'Euplotid Nuclear code' },
	{ id: 8, hyphy: 'Alt-Yeast-Nuclear', label: 'Alternative Yeast Nuclear code' },
	{ id: 9, hyphy: 'Ascidian-mtDNA', label: 'Ascidian mitochondrial DNA code' },
	{ id: 10, hyphy: 'Flatworm-mtDNA', label: 'Flatworm mitochondrial DNA code' },
	{ id: 11, hyphy: 'Blepharisma-Nuclear', label: 'Blepharisma Nuclear code' }
];

/**
 * Older spellings, mapped to the identifier the shipped engine declares.
 *
 * Two generations of them:
 *   - the MethodSelector's invented names ('Vertebrate mitochondrial'), stored in saved configs;
 *   - the spaced names from the vendored chooseGeneticCode.def and methodOptions.toml
 *     ('Vertebrate mtDNA').
 *
 * Neither is a HyPhy identifier for the engine we ship. Do not add new entries — new code should
 * use the canonical names above.
 */
export const LEGACY_CODE_ALIASES = {
	Universal: 'Universal',
	'Vertebrate mitochondrial': 'Vertebrate-mtDNA',
	'Yeast mitochondrial': 'Yeast-mtDNA',
	'Mold mitochondrial': 'Mold-Protozoan-mtDNA',
	'Invertebrate mitochondrial': 'Invertebrate-mtDNA',
	'Ciliate nuclear': 'Ciliate-Nuclear',
	'Echinoderm mitochondrial': 'Echinoderm-mtDNA',
	'Euplotid nuclear': 'Euplotid-Nuclear',
	'Alternative yeast nuclear': 'Alt-Yeast-Nuclear',
	'Ascidian mitochondrial': 'Ascidian-mtDNA',
	'Flatworm mitochondrial': 'Flatworm-mtDNA',
	'Blepharisma nuclear': 'Blepharisma-Nuclear',
	'Vertebrate mtDNA': 'Vertebrate-mtDNA',
	'Yeast mtDNA': 'Yeast-mtDNA',
	'Mold/Protozoan mtDNA': 'Mold-Protozoan-mtDNA',
	'Invertebrate mtDNA': 'Invertebrate-mtDNA',
	'Ciliate Nuclear': 'Ciliate-Nuclear',
	'Echinoderm mtDNA': 'Echinoderm-mtDNA',
	'Euplotid Nuclear': 'Euplotid-Nuclear',
	'Alt. Yeast Nuclear': 'Alt-Yeast-Nuclear',
	'Ascidian mtDNA': 'Ascidian-mtDNA',
	'Flatworm mtDNA': 'Flatworm-mtDNA',
	'Blepharisma Nuclear': 'Blepharisma-Nuclear'
};

/**
 * Resolve a canonical-or-legacy genetic code name to the identifier HyPhy accepts.
 *
 * Unknown names are returned UNCHANGED rather than coerced to 'Universal': on the WASM path this
 * value goes straight to `--code`, and HyPhy rejecting an unrecognised name loudly is far better
 * than this app quietly analysing the data under a different code than the one displayed.
 *
 * @param {string} name
 * @returns {string}
 */
export function canonicalGeneticCodeName(name) {
	if (!name) return 'Universal';
	if (GENETIC_CODES.some((code) => code.hyphy === name)) return name;
	return LEGACY_CODE_ALIASES[name] ?? name;
}

/**
 * Resolve a canonical-or-legacy genetic code name to the numeric id HyPhy indexes by.
 *
 * Falls back to 0 (Universal) for unknown names, matching the server path's long-standing
 * behaviour — the backend requires *some* numeric id and has no way to express "unknown".
 *
 * @param {string} name
 * @returns {number}
 */
export function geneticCodeId(name) {
	const canonical = canonicalGeneticCodeName(name);
	const entry = GENETIC_CODES.find((code) => code.hyphy === canonical);
	return entry ? entry.id : 0;
}
