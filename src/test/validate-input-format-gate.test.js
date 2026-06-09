/**
 * Tests for BaseAnalysisRunner.validateInput format gating.
 *
 * Codon-aware methods (FEL, MEME, BUSTED, etc.) require the alignment to be
 * divisible by 3 with no premature stop codons. The JS-side check
 * (validateCodonAlignment) parses the alignment as FASTA or NEXUS — anything
 * else (PHYLIP, MEGA, CLUSTAL) is rejected by parseFasta with a confusing
 * "Sequence data found before header" error. Per dm2 parity, we skip JS
 * codon validation for non-FASTA/NEXUS formats and trust HyPhy to validate
 * on the analysis run.
 */

import { describe, it, expect } from 'vitest';
import { BaseAnalysisRunner } from '../lib/services/BaseAnalysisRunner.js';

const TREE = '((Seq1:0.1,Seq2:0.1):0.1);';

const VALID_FASTA = `>Seq1\nATGAAACCC\n>Seq2\nATGAAAGGG`;
const STOP_FASTA = `>Seq1\nATGTAACCC\n>Seq2\nATGAAAGGG`; // TAA stop codon
const BAD_LENGTH_FASTA = `>Seq1\nATGA\n>Seq2\nATGA`; // not divisible by 3

const PHYLIP = ` 2 9\nSeq1      ATGTAACCC\nSeq2      ATGAAAGGG`; // has stop codon
const MEGA = `#mega\n!Title: Sample;\n#Seq1\nATGTAACCC\n#Seq2\nATGAAAGGG`; // has stop codon
const CLUSTAL = `CLUSTAL W (1.83) multiple sequence alignment\n\nSeq1            ATGTAACCC\nSeq2            ATGAAAGGG`;

describe('BaseAnalysisRunner.validateInput format gating', () => {
	const runner = new BaseAnalysisRunner();

	it('runs codon validation for FASTA + codon-aware method', () => {
		expect(() => runner.validateInput(STOP_FASTA, TREE, 'fel')).toThrow(/stop codon/i);
	});

	it('runs codon validation for FASTA, catches bad length', () => {
		expect(() => runner.validateInput(BAD_LENGTH_FASTA, TREE, 'fel')).toThrow(/divisible by 3/i);
	});

	it('accepts a clean FASTA for codon-aware method', () => {
		expect(() => runner.validateInput(VALID_FASTA, TREE, 'fel')).not.toThrow();
	});

	it('skips codon validation for PHYLIP (would otherwise be parsed as FASTA and fail)', () => {
		expect(() => runner.validateInput(PHYLIP, TREE, 'fel')).not.toThrow();
	});

	it('skips codon validation for MEGA', () => {
		expect(() => runner.validateInput(MEGA, TREE, 'fel')).not.toThrow();
	});

	it('skips codon validation for CLUSTAL', () => {
		expect(() => runner.validateInput(CLUSTAL, TREE, 'fel')).not.toThrow();
	});

	it('skips codon validation for non-codon-aware methods regardless of format', () => {
		expect(() => runner.validateInput(STOP_FASTA, TREE, 'gard')).not.toThrow();
		expect(() => runner.validateInput(PHYLIP, TREE, 'gard')).not.toThrow();
	});

	it('still requires fastaData', () => {
		expect(() => runner.validateInput('', TREE, 'fel')).toThrow(/FASTA data is empty/i);
	});

	it('still requires treeData', () => {
		expect(() => runner.validateInput(VALID_FASTA, '', 'fel')).toThrow(/Tree data is empty/i);
	});
});
