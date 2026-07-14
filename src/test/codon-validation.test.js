/**
 * Tests for validateCodonAlignment() utility
 * Verifies that codon alignment validation catches:
 * - Sequences not divisible by 3
 * - In-frame stop codons for various genetic codes
 * - Edge cases (empty input, single codons, etc.)
 */

import { describe, it, expect } from 'vitest';
import { validateCodonAlignment, parseNexus, isNexusFormat } from '../lib/utils/fastaValidation.js';

// Helper to build a simple FASTA string
function fasta(seqs) {
	return seqs.map(([name, seq]) => `>${name}\n${seq}`).join('\n');
}

describe('validateCodonAlignment', () => {
	describe('valid alignments', () => {
		it('accepts a valid codon alignment (divisible by 3, no stop codons)', () => {
			const data = fasta([
				['Seq1', 'ATGAAACCC'],
				['Seq2', 'ATGAAAGGG']
			]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('accepts a single codon sequence (length 3)', () => {
			const data = fasta([['Seq1', 'ATG']]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(true);
		});

		it('allows a terminal stop codon (last codon)', () => {
			// TAA at the end should not be flagged since it is the terminal codon
			const data = fasta([['Seq1', 'ATGAAATAA']]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(true);
		});
	});

	describe('not divisible by 3', () => {
		it('rejects alignment whose length is not divisible by 3', () => {
			const data = fasta([
				['Seq1', 'ATGAA'],
				['Seq2', 'ATGCC']
			]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]).toContain('not divisible by 3');
		});

		it('rejects single nucleotide', () => {
			const data = fasta([['Seq1', 'A']]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('not divisible by 3');
		});
	});

	describe('in-frame stop codons (Universal code)', () => {
		it('detects TAA stop codon in-frame', () => {
			// TAA at codon position 2 (in-frame, not terminal)
			const data = fasta([['Seq1', 'ATGTAACCC']]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('TAA');
			expect(result.errors[0]).toContain('codon position 2');
		});

		it('detects TAG stop codon in-frame', () => {
			const data = fasta([['Seq1', 'ATGTAGCCC']]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('TAG');
		});

		it('detects TGA stop codon in-frame', () => {
			const data = fasta([['Seq1', 'ATGTGACCC']]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('TGA');
		});

		it('does not flag stop codons that are out of frame', () => {
			// "AATAAGGCC" - TAA starts at position 1 (out of frame)
			// Codons: AAT AAG GCC - none are stop codons
			const data = fasta([['Seq1', 'AATAAGCCC']]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(true);
		});
	});

	describe('multiple sequences', () => {
		it('detects stop codon in second sequence only', () => {
			const data = fasta([
				['Clean', 'ATGAAACCC'],
				['Dirty', 'ATGTAACCC']
			]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('Dirty');
		});

		it('reports stop codons in multiple sequences', () => {
			const data = fasta([
				['Seq1', 'ATGTAACCC'],
				['Seq2', 'ATGTAGCCC']
			]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(2);
		});
	});

	describe('genetic code variants', () => {
		it('Ciliate nuclear (5): TAA is NOT a stop codon', () => {
			// In ciliate nuclear code, only TGA is a stop codon
			const data = fasta([['Seq1', 'ATGTAACCC']]);
			const result = validateCodonAlignment(data, 5);
			// TAA codes for Gln in ciliate nuclear, should be valid
			expect(result.valid).toBe(true);
		});

		it('Ciliate nuclear (5): TGA IS a stop codon', () => {
			const data = fasta([['Seq1', 'ATGTGACCC']]);
			const result = validateCodonAlignment(data, 5);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('TGA');
		});

		it('Vertebrate mito (1): AGA is a stop codon', () => {
			const data = fasta([['Seq1', 'ATGAGACCC']]);
			const result = validateCodonAlignment(data, 1);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('AGA');
		});

		it('Vertebrate mito (1): TGA is NOT a stop codon', () => {
			// In vertebrate mitochondrial code, TGA codes for Trp
			const data = fasta([['Seq1', 'ATGTGACCC']]);
			const result = validateCodonAlignment(data, 1);
			expect(result.valid).toBe(true);
		});

		it('unknown genetic code falls back to Universal', () => {
			const data = fasta([['Seq1', 'ATGTAACCC']]);
			const result = validateCodonAlignment(data, 999);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('TAA');
		});
	});

	describe('edge cases', () => {
		it('returns invalid for null input', () => {
			const result = validateCodonAlignment(null);
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
		});

		it('returns invalid for empty string', () => {
			const result = validateCodonAlignment('');
			expect(result.valid).toBe(false);
		});

		it('returns invalid for whitespace-only input', () => {
			const result = validateCodonAlignment('   \n  ');
			expect(result.valid).toBe(false);
		});

		it('handles lowercase sequences', () => {
			const data = fasta([['Seq1', 'atgtaaccc']]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('TAA');
		});

		it('checks alignment column count (with gaps) for divisibility by 3', () => {
			// 12 columns (including gaps) = divisible by 3
			const data = fasta([['Seq1', 'ATG---AAACCC']]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(true);
		});

		it('rejects alignment where column count with gaps is not divisible by 3', () => {
			// 11 columns (including gaps) = NOT divisible by 3
			// Even though ungapped length (8) doesn't matter — HyPhy checks site count
			const data = fasta([['Seq1', 'ATG---AACCC']]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('not divisible by 3');
		});

		it('defaults to genetic code 0 when not specified', () => {
			const data = fasta([['Seq1', 'ATGTAACCC']]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(false);
		});
	});

	describe('NEXUS format support', () => {
		function nexus(seqs) {
			const ntax = seqs.length;
			const nchar = seqs[0]?.[1]?.length || 0;
			return `#NEXUS\nBEGIN DATA;\n  DIMENSIONS NTAX=${ntax} NCHAR=${nchar};\n  FORMAT DATATYPE=DNA GAP=- MISSING=?;\n  MATRIX\n${seqs.map(([name, seq]) => `    ${name} ${seq}`).join('\n')}\n  ;\nEND;\n`;
		}

		it('accepts a valid NEXUS codon alignment', () => {
			const data = nexus([
				['Seq1', 'ATGAAACCC'],
				['Seq2', 'ATGAAAGGG']
			]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(true);
		});

		it('rejects NEXUS alignment not divisible by 3', () => {
			const data = nexus([
				['Seq1', 'ATGAA'],
				['Seq2', 'ATGCC']
			]);
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('not divisible by 3');
		});

		it('detects in-frame stop codon in NEXUS format', () => {
			const data = nexus([['Seq1', 'ATGTAACCC']]);
			const result = validateCodonAlignment(data, 0);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('TAA');
		});

		it('provides clear error for NEXUS without MATRIX block', () => {
			const data = '#NEXUS\nBEGIN DATA;\nEND;\n';
			const result = validateCodonAlignment(data);
			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('MATRIX');
		});

		it('does not produce "Sequence data found before header" for NEXUS', () => {
			const data = nexus([['Seq1', 'ATGAAACCC']]);
			const result = validateCodonAlignment(data);
			expect(result.errors.join(' ')).not.toContain('Sequence data found before header');
		});
	});

	describe('parseNexus', () => {
		it('parses NEXUS MATRIX block into normalized sequence objects', () => {
			const data = `#NEXUS\nBEGIN DATA;\n  MATRIX\n    Seq1 ATGCCC\n    Seq2 ATGGGG\n  ;\nEND;\n`;
			const { sequences } = parseNexus(data);
			expect(sequences).toHaveLength(2);
			expect(sequences[0].header).toBe('Seq1');
			expect(sequences[0].sequence).toBe('ATGCCC');
		});

		it('throws clear error for missing MATRIX', () => {
			expect(() => parseNexus('#NEXUS\nBEGIN DATA;\nEND;\n')).toThrow('MATRIX');
		});
	});

	describe('isNexusFormat', () => {
		it('detects NEXUS format', () => {
			expect(isNexusFormat('#NEXUS\nBEGIN DATA;')).toBe(true);
			expect(isNexusFormat('#nexus\nBEGIN DATA;')).toBe(true);
		});

		it('rejects non-NEXUS', () => {
			expect(isNexusFormat('>Seq1\nATGCCC')).toBe(false);
			expect(isNexusFormat(null)).toBe(false);
			expect(isNexusFormat('')).toBe(false);
		});
	});
});
