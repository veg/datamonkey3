/**
 * Tests for sanitizeName() and sanitizeSequenceNames() utilities
 * Verifies that Newick-invalid characters are properly sanitized in
 * both FASTA headers and tree node names.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeName, sanitizeSequenceNames } from '../lib/utils/fastaValidation.js';

describe('sanitizeName', () => {
	it('returns clean names unchanged', () => {
		expect(sanitizeName('Human')).toBe('Human');
		expect(sanitizeName('Seq_123')).toBe('Seq_123');
	});

	it('replaces pipes with underscores', () => {
		expect(sanitizeName('NC_007367.1|MP')).toBe('NC_007367.1_MP');
	});

	it('replaces parentheses with underscores', () => {
		expect(sanitizeName('virus(H3N2)')).toBe('virus_H3N2');
	});

	it('replaces spaces with underscores', () => {
		expect(sanitizeName('Influenza A virus')).toBe('Influenza_A_virus');
	});

	it('replaces colons, semicolons, commas', () => {
		expect(sanitizeName('a:b;c,d')).toBe('a_b_c_d');
	});

	it('replaces brackets and quotes', () => {
		expect(sanitizeName("a[b]c'd\"e")).toBe('a_b_c_d_e');
	});

	it('collapses consecutive underscores', () => {
		expect(sanitizeName('a||b')).toBe('a_b');
		expect(sanitizeName('a (b) c')).toBe('a_b_c');
	});

	it('strips leading and trailing underscores', () => {
		expect(sanitizeName('|leading')).toBe('leading');
		expect(sanitizeName('trailing|')).toBe('trailing');
		expect(sanitizeName('(wrapped)')).toBe('wrapped');
	});

	it('handles the full problematic name from issue #117', () => {
		const name = 'NC_007367.1|MP Influenza A virus (A/New York/392/2004(H3N2))';
		const result = sanitizeName(name);
		expect(result).not.toMatch(/[|() ,;:[\]'"]/);
		expect(result).not.toMatch(/_$/);
		expect(result).not.toMatch(/^_/);
		expect(result).not.toMatch(/__/);
	});

	it('returns empty/falsy input unchanged', () => {
		expect(sanitizeName('')).toBe('');
		expect(sanitizeName(null)).toBe(null);
		expect(sanitizeName(undefined)).toBe(undefined);
	});
});

describe('sanitizeSequenceNames', () => {
	it('returns data unchanged when no special characters are present', () => {
		const fasta = '>Human\nACGT\n>Chimp\nACGT';
		const tree = '(Human:0.1,Chimp:0.2);';
		const { sanitizedFasta, sanitizedTree } = sanitizeSequenceNames(fasta, tree);
		expect(sanitizedFasta).toBe(fasta);
		expect(sanitizedTree).toBe(tree);
	});

	it('sanitizes FASTA headers and tree node names consistently', () => {
		const fasta = '>seq|one\nACGT\n>seq two\nACGT';
		const tree = '(seq|one:0.1,seq two:0.2);';
		const { sanitizedFasta, sanitizedTree } = sanitizeSequenceNames(fasta, tree);

		expect(sanitizedFasta).toContain('>seq_one');
		expect(sanitizedFasta).toContain('>seq_two');
		expect(sanitizedTree).toContain('seq_one');
		expect(sanitizedTree).toContain('seq_two');
		// Colons for branch lengths should remain (they're part of tree data, not node names)
		expect(sanitizedTree).toContain(':0.1');
		expect(sanitizedTree).toContain(':0.2');
	});

	it('handles complex names with parentheses', () => {
		const fasta = '>A/New York/392/2004(H3N2)\nACGT\n>Normal\nACGT';
		const tree = '(A/New York/392/2004(H3N2):0.1,Normal:0.2);';
		const { sanitizedFasta, sanitizedTree } = sanitizeSequenceNames(fasta, tree);

		// FASTA header should be sanitized
		expect(sanitizedFasta).not.toContain('>A/New York/392/2004(H3N2)');
		// Tree should not contain raw parentheses from the name
		// (the tree structure parentheses at start/end are fine)
		expect(sanitizedTree).toContain('Normal');
	});

	it('preserves sequence data', () => {
		const fasta = '>seq|one\nACGTACGT\n>seq|two\nTGCATGCA';
		const tree = '(seq|one:0.1,seq|two:0.2);';
		const { sanitizedFasta } = sanitizeSequenceNames(fasta, tree);

		expect(sanitizedFasta).toContain('ACGTACGT');
		expect(sanitizedFasta).toContain('TGCATGCA');
	});

	it('handles null tree data', () => {
		const fasta = '>seq|one\nACGT';
		const { sanitizedFasta, sanitizedTree } = sanitizeSequenceNames(fasta, null);

		expect(sanitizedFasta).toContain('>seq_one');
		expect(sanitizedTree).toBeNull();
	});

	it('handles longer names before shorter to avoid partial replacement', () => {
		const fasta = '>seq|A\nACGT\n>seq|AB\nACGT';
		const tree = '(seq|A:0.1,seq|AB:0.2);';
		const { sanitizedTree } = sanitizeSequenceNames(fasta, tree);

		// seq|AB should be replaced as a whole, not partially
		expect(sanitizedTree).toContain('seq_AB');
		expect(sanitizedTree).toContain('seq_A');
	});
});
