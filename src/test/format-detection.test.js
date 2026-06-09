/**
 * Tests for format-detection helpers in fastaValidation.js.
 *
 * These gate JS-side codon validation: PHYLIP, MEGA, CLUSTAL files upload
 * fine via HyPhy's datareader.bf but our JS parsers don't understand them,
 * so the gate keeps us from blocking codon-aware methods on those formats.
 */

import { describe, it, expect } from 'vitest';
import {
	isFastaFormat,
	isNexusFormat,
	isJSParseableFormat
} from '../lib/utils/fastaValidation.js';

const FASTA_SAMPLE = `>Seq1
ATGAAACCC
>Seq2
ATGAAAGGG`;

const NEXUS_SAMPLE = `#nexus
BEGIN DATA;
DIMENSIONS NTAX=2 NCHAR=9;
FORMAT DATATYPE=DNA;
MATRIX
Seq1 ATGAAACCC
Seq2 ATGAAAGGG
;
END;`;

const PHYLIP_SAMPLE = ` 2 9
Seq1      ATGAAACCC
Seq2      ATGAAAGGG`;

const MEGA_SAMPLE = `#mega
!Title: Sample;
#Seq1
ATGAAACCC
#Seq2
ATGAAAGGG`;

const CLUSTAL_SAMPLE = `CLUSTAL W (1.83) multiple sequence alignment

Seq1            ATGAAACCC
Seq2            ATGAAAGGG`;

describe('isNexusFormat', () => {
	it('detects #nexus header (lowercase)', () => {
		expect(isNexusFormat(NEXUS_SAMPLE)).toBe(true);
	});

	it('detects #NEXUS header (uppercase, case-insensitive)', () => {
		expect(isNexusFormat('#NEXUS\nBEGIN DATA;')).toBe(true);
	});

	it('ignores leading whitespace', () => {
		expect(isNexusFormat('   \n#nexus\n')).toBe(true);
	});

	it('rejects FASTA', () => {
		expect(isNexusFormat(FASTA_SAMPLE)).toBe(false);
	});

	it('rejects MEGA (also starts with #)', () => {
		expect(isNexusFormat(MEGA_SAMPLE)).toBe(false);
	});

	it('rejects empty input', () => {
		expect(isNexusFormat('')).toBe(false);
		expect(isNexusFormat(null)).toBe(false);
		expect(isNexusFormat(undefined)).toBe(false);
	});
});

describe('isFastaFormat', () => {
	it('detects standard > headers', () => {
		expect(isFastaFormat(FASTA_SAMPLE)).toBe(true);
	});

	it("detects HyPhy's # header variant for FASTA", () => {
		expect(isFastaFormat('#Seq1\nATG\n#Seq2\nGGG')).toBe(true);
	});

	it('rejects NEXUS even though it starts with #', () => {
		expect(isFastaFormat(NEXUS_SAMPLE)).toBe(false);
	});

	it('rejects MEGA even though it starts with #', () => {
		expect(isFastaFormat(MEGA_SAMPLE)).toBe(false);
	});

	it('rejects PHYLIP (starts with a digit count)', () => {
		expect(isFastaFormat(PHYLIP_SAMPLE)).toBe(false);
	});

	it('rejects CLUSTAL', () => {
		expect(isFastaFormat(CLUSTAL_SAMPLE)).toBe(false);
	});

	it('rejects empty input', () => {
		expect(isFastaFormat('')).toBe(false);
		expect(isFastaFormat(null)).toBe(false);
		expect(isFastaFormat(undefined)).toBe(false);
	});
});

describe('isJSParseableFormat', () => {
	it('returns true for FASTA', () => {
		expect(isJSParseableFormat(FASTA_SAMPLE)).toBe(true);
	});

	it('returns true for NEXUS', () => {
		expect(isJSParseableFormat(NEXUS_SAMPLE)).toBe(true);
	});

	it('returns false for PHYLIP', () => {
		expect(isJSParseableFormat(PHYLIP_SAMPLE)).toBe(false);
	});

	it('returns false for MEGA', () => {
		expect(isJSParseableFormat(MEGA_SAMPLE)).toBe(false);
	});

	it('returns false for CLUSTAL', () => {
		expect(isJSParseableFormat(CLUSTAL_SAMPLE)).toBe(false);
	});

	it('returns false for empty input', () => {
		expect(isJSParseableFormat('')).toBe(false);
		expect(isJSParseableFormat(null)).toBe(false);
	});
});
