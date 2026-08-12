/**
 * Simple FASTA Validation Utilities
 * Simplified version focusing on essential validation functionality
 */

// Legacy ERROR_TYPES for backward compatibility
export const ERROR_TYPES = {
	EMPTY_FILE: { code: 'FASTA-001', message: 'File is empty' },
	NO_HEADER: { code: 'FASTA-002', message: 'FASTA header line not found' },
	INVALID_HEADER: { code: 'FASTA-003', message: 'Invalid FASTA header format' },
	EMPTY_SEQUENCE: { code: 'FASTA-004', message: 'Sequence is empty' },
	INCONSISTENT_LENGTH: { code: 'FASTA-005', message: 'Inconsistent sequence lengths' },
	INVALID_CHARACTERS: { code: 'FASTA-006', message: 'Invalid characters in sequence' },
	DUPLICATE_HEADERS: { code: 'FASTA-007', message: 'Duplicate sequence headers' }
};

// Valid character sets
const VALID_NUCLEOTIDES = new Set('ACGTUNRYSWKMBDHVacgtunryswkmbdhv-.');
const VALID_AMINO_ACIDS = new Set('ACDEFGHIKLMNPQRSTVWYacdefghiklmnpqrstvwy-.*X');

/**
 * Parse FASTA format string into sequences
 * @param {string} fastaContent - Raw FASTA content
 * @returns {Object} Parsed sequences and validation info
 */
export function parseFasta(fastaContent) {
	if (!fastaContent?.trim()) {
		throw new Error('File is empty');
	}

	const lines = fastaContent.split(/\r?\n/);
	const sequences = [];
	let currentSequence = null;
	const headers = new Set();
	const warnings = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		if (line.startsWith('>')) {
			// Save previous sequence
			if (currentSequence) {
				sequences.push(currentSequence);
			}

			// Start new sequence
			const header = line.substring(1).trim();
			if (!header) {
				warnings.push(`Empty header at line ${i + 1}`);
			}

			if (headers.has(header)) {
				warnings.push(`Duplicate header: ${header}`);
			}
			headers.add(header);

			currentSequence = {
				header,
				sequence: ''
			};
		} else if (currentSequence) {
			// Add to current sequence (remove whitespace)
			currentSequence.sequence += line.replace(/\s/g, '');
		} else {
			throw new Error('Sequence data found before header');
		}
	}

	// Add the last sequence
	if (currentSequence) {
		sequences.push(currentSequence);
	}

	if (sequences.length === 0) {
		throw new Error('No sequences found');
	}

	return { sequences, warnings };
}

/**
 * Validate FASTA content
 * @param {string} fastaContent - Raw FASTA content
 * @returns {Object} Validation result
 */
export function validateFasta(fastaContent) {
	try {
		const { sequences, warnings } = parseFasta(fastaContent);
		const errors = [];

		// Check for empty sequences
		sequences.forEach((seq, idx) => {
			if (!seq.sequence) {
				errors.push(`Empty sequence: ${seq.header}`);
			}
		});

		// Check sequence length consistency (for alignments)
		if (sequences.length > 1) {
			const firstLength = sequences[0].sequence.length;
			const inconsistentLengths = sequences.filter((seq) => seq.sequence.length !== firstLength);

			if (inconsistentLengths.length > 0) {
				warnings.push(`Inconsistent sequence lengths detected (may not be aligned)`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			sequences,
			stats: {
				sequenceCount: sequences.length,
				averageLength:
					sequences.length > 0
						? Math.round(
								sequences.reduce((sum, seq) => sum + seq.sequence.length, 0) / sequences.length
							)
						: 0
			}
		};
	} catch (error) {
		return {
			valid: false,
			errors: [error.message],
			warnings: [],
			sequences: [],
			stats: { sequenceCount: 0, averageLength: 0 }
		};
	}
}

/**
 * Detect sequence type (DNA/RNA/Protein)
 * @param {string} sequence - Sequence string
 * @returns {string} Detected type
 */
export function detectSequenceType(sequence) {
	if (!sequence) return 'unknown';

	const cleanSeq = sequence.replace(/[-.\s]/g, '').toUpperCase();
	const nucleotideCount = [...cleanSeq].filter((char) => 'ACGTUN'.includes(char)).length;
	const nucleotideRatio = nucleotideCount / cleanSeq.length;

	// If >80% are standard nucleotides, consider it DNA/RNA
	if (nucleotideRatio > 0.8) {
		return cleanSeq.includes('U') ? 'RNA' : 'DNA';
	}

	return 'Protein';
}

/**
 * Validate sequence characters for given type
 * @param {string} sequence - Sequence string
 * @param {string} type - Expected type (DNA/RNA/Protein)
 * @returns {Array} Invalid characters found
 */
export function validateSequenceCharacters(sequence, type) {
	const validChars = type === 'Protein' ? VALID_AMINO_ACIDS : VALID_NUCLEOTIDES;
	const invalidChars = new Set();

	for (const char of sequence) {
		if (!validChars.has(char)) {
			invalidChars.add(char);
		}
	}

	return Array.from(invalidChars);
}

/**
 * Simple sequence statistics
 * @param {Array} sequences - Array of sequence objects
 * @returns {Object} Basic statistics
 */
export function getSequenceStats(sequences) {
	if (!sequences?.length) {
		return { count: 0, totalLength: 0, averageLength: 0 };
	}

	const totalLength = sequences.reduce((sum, seq) => sum + seq.sequence.length, 0);

	return {
		count: sequences.length,
		totalLength,
		averageLength: Math.round(totalLength / sequences.length),
		minLength: Math.min(...sequences.map((s) => s.sequence.length)),
		maxLength: Math.max(...sequences.map((s) => s.sequence.length))
	};
}

/**
 * Sanitize a single sequence/node name for Newick compatibility.
 * Replaces characters that are invalid in Newick tree format with underscores,
 * collapses consecutive underscores, and strips leading/trailing underscores.
 * @param {string} name - Original name
 * @returns {string} Sanitized name
 */
export function sanitizeName(name) {
	if (!name) return name;
	// Replace characters invalid in Newick format with underscores
	let sanitized = name.replace(/[|() ,;:[\]'"]/g, '_');
	// Collapse consecutive underscores to a single underscore
	sanitized = sanitized.replace(/_+/g, '_');
	// Strip leading and trailing underscores
	sanitized = sanitized.replace(/^_+|_+$/g, '');
	return sanitized;
}

/**
 * Sanitize sequence names in FASTA data and tree data so they remain consistent
 * and compatible with HyPhy's Newick tree parser.
 *
 * Characters replaced: | ( ) space , : ; [ ] ' "
 *
 * @param {string} fastaData - Raw FASTA content
 * @param {string} treeData - Newick tree string
 * @returns {{ sanitizedFasta: string, sanitizedTree: string }}
 */
export function sanitizeSequenceNames(fastaData, treeData) {
	// Build a mapping of original names to sanitized names from the FASTA headers
	const nameMap = new Map();
	const lines = fastaData.split(/\r?\n/);

	for (const line of lines) {
		if (line.startsWith('>')) {
			const original = line.substring(1).trim();
			const sanitized = sanitizeName(original);
			if (original !== sanitized) {
				nameMap.set(original, sanitized);
			}
		}
	}

	// If nothing needs sanitizing, return early
	if (nameMap.size === 0) {
		return { sanitizedFasta: fastaData, sanitizedTree: treeData };
	}

	console.log(`Sanitizing ${nameMap.size} sequence name(s) with special characters`);

	// Sanitize FASTA headers
	const sanitizedFasta = lines
		.map((line) => {
			if (line.startsWith('>')) {
				const original = line.substring(1).trim();
				const sanitized = nameMap.get(original);
				return sanitized !== undefined ? `>${sanitized}` : line;
			}
			return line;
		})
		.join('\n');

	// Sanitize tree node names by replacing each original name in the Newick string
	let sanitizedTree = treeData;
	if (treeData) {
		// Sort by length descending so longer names are replaced first,
		// preventing partial replacements of shorter substrings
		const sortedEntries = [...nameMap.entries()].sort((a, b) => b[0].length - a[0].length);
		for (const [original, sanitized] of sortedEntries) {
			// Escape special regex characters in the original name
			const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			sanitizedTree = sanitizedTree.replace(new RegExp(escaped, 'g'), sanitized);
		}
	}

	return { sanitizedFasta, sanitizedTree };
}

/**
 * Stop codons by genetic code ID.
 * Only entries that differ from Universal (0) are listed separately.
 */
const STOP_CODONS_BY_GENETIC_CODE = {
	0: ['TAA', 'TAG', 'TGA'], // Universal
	1: ['TAA', 'TAG', 'AGA', 'AGG'], // Vertebrate mitochondrial
	2: ['TAA', 'TAG'], // Yeast mitochondrial
	3: ['TAA', 'TAG'], // Mold mitochondrial
	4: ['TAA', 'TAG'], // Invertebrate mitochondrial
	5: ['TGA'], // Ciliate nuclear (TAA/TAG code for Gln)
	6: ['TAA', 'TAG'], // Echinoderm mitochondrial
	7: ['TAA', 'TAG'], // Euplotid nuclear
	8: ['TAA', 'TAG', 'TGA'], // Alternative yeast nuclear
	9: ['TAA', 'TAG'], // Ascidian mitochondrial
	10: ['TAA', 'TAG'], // Flatworm mitochondrial
	11: ['TAA', 'TGA'] // Blepharisma nuclear
};

/**
 * Detect whether content is NEXUS format.
 * @param {string} content - Raw file content
 * @returns {boolean}
 */
export function isNexusFormat(content) {
	return content?.trim().toLowerCase().startsWith('#nexus') ?? false;
}

/**
 * Detect whether content is FASTA format.
 * @param {string} content - Raw file content
 * @returns {boolean}
 */
export function isFastaFormat(content) {
	const trimmed = content?.trim() ?? '';
	if (!trimmed) return false;
	// FASTA headers start with '>'. We also accept '#' (sequential) per HyPhy/dm2's
	// autodetect rules, but only when it's NOT '#nexus' or '#mega'.
	if (trimmed.startsWith('>')) return true;
	const lower = trimmed.toLowerCase();
	if (trimmed.startsWith('#') && !lower.startsWith('#nexus') && !lower.startsWith('#mega')) {
		return true;
	}
	return false;
}

/**
 * Detect whether the content is in a format JS-side validators can parse
 * (currently FASTA + NEXUS). Used to gate codon validation: PHYLIP, MEGA,
 * CLUSTAL files all upload successfully (HyPhy's datareader.bf accepts them)
 * but our JS parsers don't recognize them. We skip JS-side codon validation
 * in those cases and let HyPhy validate on the analysis run instead, matching
 * dm2's behavior.
 * @param {string} content - Raw file content
 * @returns {boolean}
 */
export function isJSParseableFormat(content) {
	return isFastaFormat(content) || isNexusFormat(content);
}

/**
 * Parse NEXUS format string into sequences.
 * @param {string} nexusContent - Raw NEXUS content
 * @returns {Object} { sequences: [{header, sequence}], warnings: [] }
 */
export function parseNexus(nexusContent) {
	if (!nexusContent?.trim()) {
		throw new Error('File is empty');
	}

	const sequences = [];
	const warnings = [];

	const matrixMatch = nexusContent.match(/MATRIX\s*\n([\s\S]*?)\s*;/i);
	if (!matrixMatch) {
		throw new Error('No MATRIX block found in NEXUS file');
	}

	const matrixContent = matrixMatch[1];
	const lines = matrixContent.split('\n');

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;

		const parts = trimmedLine.split(/\s+/);
		if (parts.length >= 2) {
			const name = parts[0];
			const sequence = parts.slice(1).join('').replace(/\s/g, '');
			if (name && sequence) {
				sequences.push({ header: name, sequence });
			}
		}
	}

	if (sequences.length === 0) {
		throw new Error('No sequences found in NEXUS MATRIX block');
	}

	return { sequences, warnings };
}

/**
 * Parse alignment content in either FASTA or NEXUS format.
 * @param {string} content - Raw alignment content
 * @returns {Object} { sequences: [{header, sequence}], warnings: [] }
 */
export function parseAlignment(content) {
	if (isNexusFormat(content)) {
		return parseNexus(content);
	}
	return parseFasta(content);
}

/**
 * Validate a codon alignment for submission to codon-aware methods.
 * Checks that alignment site count is divisible by 3 and scans for in-frame stop codons.
 *
 * @param {string} alignmentData - Raw FASTA or NEXUS alignment content
 * @param {number} [geneticCodeId=0] - Genetic code ID (0 = Universal)
 * @returns {{ valid: boolean, errors: string[] }}
 */
/**
 * Human-readable names for the genetic codes above, so a report can say which one it used.
 * Ids match HyPhy's numbering and the selector in MethodSelector.
 */
const GENETIC_CODE_NAMES = {
	0: 'Universal',
	1: 'Vertebrate mitochondrial',
	2: 'Yeast mitochondrial',
	3: 'Mold mitochondrial',
	4: 'Invertebrate mitochondrial',
	5: 'Ciliate nuclear',
	6: 'Echinoderm mitochondrial',
	7: 'Euplotid nuclear',
	8: 'Alternative yeast nuclear',
	9: 'Ascidian mitochondrial',
	10: 'Flatworm mitochondrial',
	11: 'Blepharisma nuclear'
};

/** Characters treated as a gap or missing data. */
const GAP_CHARS = /[-.?~]/;

/**
 * Locate in-frame stop codons, in ALIGNMENT coordinates.
 *
 * This reports what is in the file. It draws no conclusion about what the file should be, and
 * nothing here suggests an edit: which of several very different causes produced a premature stop
 * -- a frameshift, a pseudogene, a sequencing error, a genuine nonsense mutation, or simply the
 * wrong genetic code -- is a question about the data, and the answer is not the software's to give.
 *
 * FOUR DECISIONS THAT MAKE THE NUMBERS MEAN SOMETHING:
 *
 * 1. Positions are codon COLUMNS OF THE ALIGNMENT, counting from 1. The previous implementation
 *    stripped gaps first and reported positions in ungapped coordinates, which correspond to no
 *    column the user can look at -- in a gapped alignment they point somewhere else entirely.
 *    HyPhy works in alignment columns and so does the alignment viewer.
 *
 * 2. Nothing is scanned unless the alignment length is a multiple of three. Without that, codon
 *    columns are not defined, and any stop codon "found" would be an artefact of an arbitrary
 *    frame rather than a fact about the data.
 *
 * 3. Each sequence's own last non-gap codon is skipped. A terminal stop is ordinary, and sequences
 *    end at different columns when there are trailing gaps.
 *
 * 4. Only unambiguous ACGT codons are called. A codon containing a gap or an ambiguity code is not
 *    a codon we can read, so it is passed over rather than guessed at.
 *
 * @param {string} alignmentData
 * @param {number} geneticCodeId
 * @returns {{scanned: boolean, reason?: string, geneticCode: string, totalSequences: number,
 *   affected: Array<{header: string, hits: Array<{position: number, codon: string}>}>}}
 */
export function findStopCodons(alignmentData, geneticCodeId = 0) {
	const geneticCode = GENETIC_CODE_NAMES[geneticCodeId] ?? `code ${geneticCodeId}`;
	const empty = { scanned: false, geneticCode, totalSequences: 0, affected: [] };

	if (!alignmentData || !alignmentData.trim()) {
		return { ...empty, reason: 'no alignment data' };
	}

	let parsed;
	try {
		parsed = parseAlignment(alignmentData);
	} catch (e) {
		return { ...empty, reason: e.message };
	}

	const sequences = parsed?.sequences ?? [];
	if (sequences.length === 0) return { ...empty, reason: 'no sequences found' };

	const columns = sequences[0].sequence.length;
	if (columns % 3 !== 0) {
		// Decision 2. Say why nothing was scanned rather than silently reporting nothing.
		return {
			...empty,
			totalSequences: sequences.length,
			reason: `alignment length (${columns}) is not a multiple of 3, so codon positions are undefined`
		};
	}

	const stopSet = new Set(
		STOP_CODONS_BY_GENETIC_CODE[geneticCodeId] || STOP_CODONS_BY_GENETIC_CODE[0]
	);

	const affected = [];
	for (const seq of sequences) {
		const raw = String(seq.sequence ?? '').toUpperCase();
		const codons = [];
		for (let c = 0; c + 3 <= raw.length; c += 3) codons.push(raw.substring(c, c + 3));

		// Decision 3: the sequence's own last codon that is not entirely gap.
		let lastReal = -1;
		for (let i = codons.length - 1; i >= 0; i--) {
			if (!/^[-.?~]{3}$/.test(codons[i])) {
				lastReal = i;
				break;
			}
		}

		const hits = [];
		for (let i = 0; i < codons.length; i++) {
			if (i === lastReal) continue;
			const codon = codons[i];
			// Decision 4.
			if (GAP_CHARS.test(codon) || !/^[ACGT]{3}$/.test(codon)) continue;
			if (stopSet.has(codon)) hits.push({ position: i + 1, codon });
		}

		if (hits.length) affected.push({ header: seq.header, hits });
	}

	return { scanned: true, geneticCode, totalSequences: sequences.length, affected };
}

/**
 * Render a stop-codon finding as plain text.
 *
 * Description only. No recommendation, no proposed edit, no next step -- the reader is a
 * molecular biologist looking at their own data, and they do not need software to tell them what a
 * premature stop codon might mean.
 *
 * @param {ReturnType<typeof findStopCodons>} finding
 * @param {{maxSequences?: number, maxPerSequence?: number}} [limits]
 * @returns {string} empty when there is nothing to report
 */
export function formatStopCodonReport(finding, { maxSequences = 10, maxPerSequence = 5 } = {}) {
	if (!finding?.scanned || finding.affected.length === 0) return '';

	const n = finding.affected.length;
	const total = finding.totalSequences;
	const lines = [
		`In-frame stop codons found in ${n} of ${total} ${total === 1 ? 'sequence' : 'sequences'}, ` +
			`reading the ${finding.geneticCode} genetic code.`,
		''
	];

	for (const seq of finding.affected.slice(0, maxSequences)) {
		const shown = seq.hits
			.slice(0, maxPerSequence)
			.map((h) => `codon ${h.position} (${h.codon})`)
			.join(', ');
		const extra =
			seq.hits.length > maxPerSequence ? `, and ${seq.hits.length - maxPerSequence} more` : '';
		lines.push(`  ${seq.header}: ${shown}${extra}`);
	}

	if (n > maxSequences) lines.push(`  ...and ${n - maxSequences} further sequences.`);

	lines.push(
		'',
		'Positions are codon columns of the alignment, counting from 1. The final codon of each ' +
			'sequence is not counted.'
	);

	return lines.join('\n');
}

export function validateCodonAlignment(alignmentData, geneticCodeId = 0) {
	const errors = [];

	if (!alignmentData || !alignmentData.trim()) {
		return { valid: false, errors: ['Alignment data is empty'] };
	}

	let parsed;
	try {
		parsed = parseAlignment(alignmentData);
	} catch (e) {
		return { valid: false, errors: [e.message] };
	}

	const { sequences } = parsed;

	if (sequences.length === 0) {
		return { valid: false, errors: ['No sequences found in alignment data'] };
	}

	// Check alignment site count (column count including gaps) for divisibility by 3.
	// HyPhy validates the total number of alignment sites, not ungapped sequence length.
	const alignmentSites = sequences[0].sequence.length;
	if (alignmentSites % 3 !== 0) {
		errors.push(
			`Alignment site count (${alignmentSites}) is not divisible by 3. ` +
				`Codon-based analyses require the alignment length to be a multiple of 3.`
		);
	}

	// In-frame stop codons, reported as one consolidated finding.
	//
	// This replaces a per-sequence loop that pushed one long sentence per affected sequence -- for a
	// 200-sequence alignment that produced 200 lines, joined with newlines and shown in a toast. It
	// also reported positions in UNGAPPED coordinates, obtained by stripping gaps before scanning,
	// which point at no column the user can actually look at.
	//
	// findStopCodons works in alignment columns and reports every occurrence rather than the first
	// per sequence. See its comment for the four decisions that make the numbers meaningful.
	const stopFinding = findStopCodons(alignmentData, geneticCodeId);
	const stopReport = formatStopCodonReport(stopFinding);
	if (stopReport) errors.push(stopReport);

	return { valid: errors.length === 0, errors, stopCodons: stopFinding };
}

/**
 * Convert sequences to FASTA format string
 * @param {Array} sequences - Array of sequence objects
 * @param {number} lineWidth - Line width for sequence wrapping (default: 80)
 * @returns {string} FASTA formatted string
 */
export function toFastaFormat(sequences, lineWidth = 80) {
	if (!sequences?.length) return '';

	return sequences
		.map((seq) => {
			const header = `>${seq.header}`;
			const sequence = seq.sequence;

			if (lineWidth <= 0) {
				return `${header}\n${sequence}`;
			}

			// Wrap sequence at specified line width
			const wrappedSequence =
				sequence.match(new RegExp(`.{1,${lineWidth}}`, 'g'))?.join('\n') || sequence;
			return `${header}\n${wrappedSequence}`;
		})
		.join('\n');
}

/**
 * Attempt to repair common FASTA format issues
 * @param {string} fastaContent - Raw FASTA content
 * @returns {Object} Repaired content and repair log
 */
export function repairFasta(fastaContent) {
	if (!fastaContent?.trim()) {
		return {
			repairedContent: '',
			repairs: ['Cannot repair empty content'],
			success: false
		};
	}

	let content = fastaContent;
	const repairs = [];

	// Remove excessive whitespace
	content = content.replace(/\n{3,}/g, '\n\n').trim();
	if (content !== fastaContent.trim()) {
		repairs.push('Removed excessive blank lines');
	}

	// Ensure headers start on new lines
	content = content.replace(/(\S)>/g, '$1\n>');
	if (content !== fastaContent) {
		repairs.push('Fixed header line breaks');
	}

	// Remove spaces within sequences (but preserve line breaks)
	const lines = content.split('\n');
	let inSequence = false;
	const repairedLines = [];

	for (const line of lines) {
		if (line.startsWith('>')) {
			inSequence = true;
			repairedLines.push(line);
		} else if (inSequence && line.trim()) {
			const originalLine = line;
			const cleanedLine = line.replace(/\s+/g, '');
			repairedLines.push(cleanedLine);
			if (originalLine !== cleanedLine) {
				repairs.push('Removed whitespace from sequences');
			}
		} else {
			repairedLines.push(line);
		}
	}

	const repairedContent = repairedLines.join('\n');

	return {
		repairedContent,
		repairs,
		success: repairs.length > 0
	};
}
