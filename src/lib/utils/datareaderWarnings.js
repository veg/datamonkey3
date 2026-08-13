/**
 * Turn datareader's FILE_INFO record into the warnings shown on the Data tab.
 *
 * TWO RULES GOVERN THE COPY HERE, and both are easy to undo by accident:
 *
 * 1. DESCRIBE, DO NOT RECOMMEND, AND NEVER OFFER TO MODIFY. Several of these conditions have more
 *    than one cause - a padded sequence can mean an unaligned file, a non-standard gap character,
 *    or a genuinely ragged region - and choosing between them is a question about the data, not
 *    something the software should answer. There is a test asserting no warning text says
 *    remove/fix/trim/repair. That assertion is the rule, not a lint.
 *
 * 2. THE KEYS ARE HISTORY. `ambiguous_sites` has never been a count of ambiguous characters: it is
 *    datareader's boolean padWarning, set when a sequence had to be padded with '?'. It was
 *    rendered as "Found 1 ambiguous character in your alignment", which is three kinds of wrong -
 *    wrong count, wrong cause, wrong advice. `padded_sequences` is the honest replacement, and the
 *    old key is still read because records cached in IndexedDB are replayed as-is
 *    (descriptorSync.js) with no migration step.
 *
 * `stop_codons` is deliberately NOT read. datareader has never emitted it - the key it writes is
 * `stop_codons_stripped`, which is a different thing (a boolean: every sequence ended in a stop and
 * that final column was dropped). The old branch keyed on `stop_codons` could not fire, and
 * reviving it would make an unfireable branch fire on a key that means something else.
 */

/** HyPhy serialises its lists as numerically-keyed objects, not JSON arrays. Accept both. */
function toList(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
	if (typeof value === 'object') {
		return Object.keys(value)
			.sort((a, b) => Number(a) - Number(b))
			.map((k) => value[k])
			.filter((v) => typeof v === 'string');
	}
	return [];
}

function count(value) {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * @param {Record<string, any>} FILE_INFO - datareader's FILE_INFO block
 * @returns {Array<{type: string, title: string, message: string, details?: string, items?: string[], truncated?: number}>}
 */
export function buildWarnings(FILE_INFO) {
	const info = FILE_INFO || {};
	const warnings = [];

	// Ordered so that "we changed your data" comes before "your data is small": SequenceWarnings
	// shows only the first two until the user expands, and the changes are the ones nobody could
	// find before (they went to datareader.log, which nothing reads).

	const duplicateNames = toList(info.duplicate_names);
	const duplicates = count(info.duplicate_sequences) || duplicateNames.length;
	if (duplicates > 0) {
		warnings.push({
			type: 'warning',
			title: 'Identical sequences collapsed',
			message: `${plural(duplicates, 'sequence')} in your file were identical to another sequence, and each set was collapsed to a single copy before analysis.`,
			details:
				'Analyses ran on the collapsed alignment, so identical sequences are represented once. This is how the site has always handled exact duplicates; it is recorded here so the sequence count you see matches what you uploaded.',
			items: duplicateNames,
			truncated: count(info.duplicate_names_truncated)
		});
	}

	const renamedNames = toList(info.renamed_names);
	const renamed = count(info.sequences_renamed) || renamedNames.length;
	if (renamed > 0) {
		warnings.push({
			type: 'warning',
			title: 'Sequences renamed',
			message: `${plural(renamed, 'sequence')} were renamed, because HyPhy sequence names may only contain letters, digits and underscores.`,
			details:
				'Every other character was replaced with an underscore. Results and trees use the new names, so a name you search for may not be the one in your original file.',
			items: renamedNames,
			truncated: count(info.renamed_names_truncated)
		});
	}

	// `padded_sequences` is the count; `ambiguous_sites` is the legacy boolean carrying the same
	// signal, and is all a cached record has.
	const padded = count(info.padded_sequences);
	if (padded > 0 || info.ambiguous_sites) {
		const subject = padded > 0 ? plural(padded, 'sequence') : 'Some sequences';
		warnings.push({
			type: 'warning',
			title: 'Sequences padded to equal length',
			message: `${subject} ${padded === 1 ? 'was' : 'were'} shorter than the alignment and ${padded === 1 ? 'was' : 'were'} padded with '?' characters at the end.`,
			details:
				"This usually means the file is not aligned, or that a non-standard gap character was used: only '-' and '?' are recognised as gaps. '~' (BioEdit) and '_' are not, and are read as missing data.",
			items: []
		});
	}

	if (info.stop_codons_stripped) {
		warnings.push({
			type: 'warning',
			title: 'Trailing stop codons stripped',
			message:
				'Every sequence ended in a stop codon, and that final codon column was excluded from the alignment.',
			details:
				'This happens only when the stop is terminal in every sequence and appears nowhere else. Codon models have no state for a stop codon, so the column cannot be scored.',
			items: []
		});
	}

	const sites = count(info.sites);
	if (sites > 0 && sites < 30) {
		warnings.push({
			type: 'info',
			title: 'Short alignment',
			message: `Your alignment has ${plural(sites, 'site')}, which is short.`,
			details:
				'Short alignments carry limited statistical power for detecting selection, so a null result says less than it would on a longer alignment.',
			items: []
		});
	}

	const sequences = count(info.sequences);
	if (sequences > 0 && sequences < 8) {
		warnings.push({
			type: 'info',
			title: 'Small sample size',
			message: `Your alignment has ${plural(sequences, 'sequence')}, which is a small sample.`,
			details:
				'Selection analyses generally have more power with larger samples; with this few sequences, only strong signals are detectable.',
			items: []
		});
	}

	return warnings;
}
