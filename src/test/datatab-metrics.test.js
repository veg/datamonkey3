/**
 * The Data tab's numbers.
 *
 * Two separate bugs, both of which read as "the app is telling me something about my file" and
 * were not true:
 *
 *  - "561 raw -> 187 processed" is the SAME alignment measured twice. datareader.bf takes `sites`
 *    from a codon filter and `rawsites` from a nucleotide filter over identical data, so rawsites
 *    is exactly 3x sites. The arrow said 374 sites had been discarded.
 *  - The file-limits copy claimed 5,000 sequences and a tree above 500. The real gates are
 *    maxUploadSize = 25000 and maxSLACSize = 10000 (HyPhyGlobals.ibf:33,15).
 */
import { describe, it, expect } from 'vitest';
import { formatAlignmentLength, formatGeneticCode } from '../lib/utils/fileMetricsDisplay.js';
import { uploadLimits, uploadLimitsCopy } from '../lib/config/uploadLimits.js';

describe('formatAlignmentLength', () => {
	it('states one length in two units instead of implying a loss', () => {
		expect(formatAlignmentLength({ rawsites: 561, sites: 187 })).toBe(
			'561 nucleotides (187 codons)'
		);
	});

	it('does not render the old arrow or the word "processed"', () => {
		const out = formatAlignmentLength({ rawsites: 561, sites: 187 });
		expect(out).not.toContain('→');
		expect(out).not.toContain('processed');
	});

	it('falls back to codons alone for a cached record with no rawsites', () => {
		// descriptorSync replays whatever IndexedDB holds, with no migration step.
		const out = formatAlignmentLength({ sites: 187 });
		expect(out).toBe('187 codons');
		expect(out).not.toMatch(/NaN|undefined/);
	});

	it('does not invent a codon count for non-codon data', () => {
		expect(formatAlignmentLength({ rawsites: 561, sites: 561, gencodeid: -1 })).toBe('561 sites');
	});

	it('says Unknown rather than NaN when there is no length at all', () => {
		expect(formatAlignmentLength({})).toBe('Unknown');
	});
});

describe('formatGeneticCode', () => {
	it('names the code instead of printing its id', () => {
		expect(formatGeneticCode(0)).toBe('Universal code');
		expect(formatGeneticCode(0)).not.toBe('0');
	});

	it('resolves other table entries', () => {
		expect(formatGeneticCode(4)).toContain('Invertebrate');
	});

	it('handles the non-codon sentinels, which are not rows in the table', () => {
		expect(formatGeneticCode(-1)).toBe('Nucleotide');
		expect(formatGeneticCode(-2)).toBe('Amino acid');
	});

	it('degrades to the id for a code it does not know', () => {
		expect(formatGeneticCode(99)).toBe('Code 99');
	});
});

describe('upload limits copy', () => {
	it('carries the limits datareader actually enforces', () => {
		expect(uploadLimits.maxSequences).toBe(25000);
		expect(uploadLimits.treeRequiredAbove).toBe(10000);
	});

	it('no longer claims 5,000 sequences or a tree above 500', () => {
		const copy = uploadLimitsCopy();
		expect(copy).toContain('25,000 sequences');
		// Lookbehind, not toContain: '25,000 sequences' contains '5,000 sequences' as a substring,
		// which would make the naive assertion pass on the FIXED copy and fail on nothing.
		expect(copy).not.toMatch(/(?<![\d,])5,000 sequences/);
		expect(copy).not.toMatch(/(?<![\d,])500 sequences/);
	});
});
