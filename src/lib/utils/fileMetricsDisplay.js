/**
 * Display formatters for datareader's FILE_INFO record.
 *
 * These exist because two of the Data tab's numbers were unreadable rather than wrong:
 *
 *  - `rawsites` and `sites` are the SAME alignment measured in two units. datareader.bf:608 takes
 *    `sites` from the codon filter (unit 3) and :617 takes `rawsites` from a nucleotide filter
 *    (unit 1) built from the same data, so `rawsites` is exactly 3 x `sites` for codon data. The
 *    old "561 raw -> 187 processed" row read as if 374 sites had been thrown away.
 *  - `gencodeid` was printed as a bare integer.
 *
 * Both are LABEL changes. The underlying `sites` value is consumed as the alignment-length term by
 * BaseAnalysisRunner.js:41-46 and SequenceWarnings, so nothing here may alter it.
 */
import { GENETIC_CODES } from '../config/geneticCodes.js';

const groupDigits = (n) => Number(n).toLocaleString('en-US');

/**
 * "561 nucleotides (187 codons)" for codon data, "561 sites" for anything else.
 *
 * Cached datareader records predating `rawsites` fall back to the codon count alone rather than
 * rendering `NaN` — descriptorSync.js replays whatever IndexedDB holds, with no migration step.
 *
 * @param {Record<string, any>} FILE_INFO
 * @returns {string}
 */
export function formatAlignmentLength(FILE_INFO = {}) {
	const sites = Number(FILE_INFO?.sites);
	if (!Number.isFinite(sites)) return 'Unknown';

	// datareader hardcodes genCodeID = 0 today; treat a missing gencodeid as codon data, which is
	// what every record it has ever written actually is.
	const isCodon = Number(FILE_INFO?.gencodeid ?? 0) >= 0;
	const rawsites = Number(FILE_INFO?.rawsites);

	if (isCodon && Number.isFinite(rawsites) && rawsites !== sites) {
		return `${groupDigits(rawsites)} nucleotides (${groupDigits(sites)} codons)`;
	}

	return `${groupDigits(sites)} ${isCodon ? 'codons' : 'sites'}`;
}

/**
 * Turn a gencodeid into the name of the code. -1 and -2 are datareader's sentinels for
 * non-codon data (datareader.bf:457-471) and are not rows in the table.
 *
 * @param {number|string} gencodeid
 * @returns {string}
 */
export function formatGeneticCode(gencodeid) {
	const id = Number(gencodeid);
	if (!Number.isFinite(id)) return 'Unknown';
	if (id === -1) return 'Nucleotide';
	if (id < 0) return 'Amino acid';

	const entry = GENETIC_CODES.find((c) => c.id === id);
	return entry ? entry.label : `Code ${id}`;
}
