/**
 * Tests for the in-frame stop codon report.
 *
 * The report is DESCRIPTIVE by design: it states what is in the file and stops there. Several very
 * different things produce a premature stop — a frameshift, a pseudogene, a sequencing error, a
 * genuine nonsense mutation, or simply the wrong genetic code — and choosing between them is a
 * question about the data, not something software should answer on the user's behalf. There are
 * assertions below that pin that: no recommendation, and no offer to modify the alignment.
 *
 * The correctness half is about coordinates. The previous implementation stripped gaps before
 * scanning and reported positions in ungapped space, which point at no column the user can look at.
 */
import { describe, it, expect } from 'vitest';
import {
	findStopCodons,
	formatStopCodonReport,
	validateCodonAlignment
} from '../lib/utils/fastaValidation.js';

/** ATG AAA TAA GGG — a premature stop at codon 3 of 4. */
const withStop = '>seq1\nATGAAATAAGGG\n>seq2\nATGAAAGGGCCC\n';

describe('findStopCodons reports alignment columns, not ungapped positions', () => {
	it('finds a premature stop and names its codon column', () => {
		const r = findStopCodons(withStop, 0);
		expect(r.scanned).toBe(true);
		expect(r.totalSequences).toBe(2);
		expect(r.affected).toHaveLength(1);
		expect(r.affected[0].header).toBe('seq1');
		expect(r.affected[0].hits).toEqual([{ position: 3, codon: 'TAA' }]);
	});

	it('counts gapped columns, so the position matches what the user sees', () => {
		// Gap codon first, then ATG, then TAA. In ALIGNMENT coordinates the stop is codon 3.
		// Stripping gaps first — the old behaviour — would have called it codon 2, pointing at ATG.
		const gapped = '>s\n---ATGTAAGGG\n';
		const r = findStopCodons(gapped, 0);
		expect(r.affected[0].hits).toEqual([{ position: 3, codon: 'TAA' }]);
	});

	it('reports every occurrence, not only the first per sequence', () => {
		const many = '>s\nATGTAAAAATGATAGGGG\n'; // stops at codons 2, 4 and 5; 6 is terminal
		const r = findStopCodons(many, 0);
		expect(r.affected[0].hits.map((h) => h.position)).toEqual([2, 4, 5]);
	});

	it('does not count a terminal stop', () => {
		const terminal = '>s\nATGAAATAA\n';
		expect(findStopCodons(terminal, 0).affected).toHaveLength(0);
	});

	it("uses each sequence's own last non-gap codon as its terminus", () => {
		// Trailing gaps mean sequences end at different columns; the stop here is terminal for
		// this sequence even though it is not the last column of the alignment.
		const trailing = '>s\nATGAAATAA---\n';
		expect(findStopCodons(trailing, 0).affected).toHaveLength(0);
	});

	it('does not scan at all when the alignment length is not a multiple of 3', () => {
		// Codon columns are undefined, so any stop "found" would be an artefact of an arbitrary
		// frame rather than a fact about the data.
		const r = findStopCodons('>s\nATGAAATAAG\n', 0);
		expect(r.scanned).toBe(false);
		expect(r.affected).toHaveLength(0);
		expect(r.reason).toMatch(/not a multiple of 3/);
	});

	it('passes over codons containing gaps or ambiguity rather than guessing', () => {
		expect(findStopCodons('>s\nATGT-AGGGCCC\n', 0).affected).toHaveLength(0);
		expect(findStopCodons('>s\nATGTNAGGGCCC\n', 0).affected).toHaveLength(0);
	});

	it('honours the genetic code, which decides what a stop even is', () => {
		// TGA is a stop under the universal code and tryptophan under vertebrate mitochondrial.
		const seq = '>s\nATGTGAAAAGGG\n';
		expect(findStopCodons(seq, 0).affected).toHaveLength(1);
		expect(findStopCodons(seq, 1).affected).toHaveLength(0);

		// And AGA is a stop under vertebrate mitochondrial but arginine under universal.
		const seq2 = '>s\nATGAGAAAAGGG\n';
		expect(findStopCodons(seq2, 0).affected).toHaveLength(0);
		expect(findStopCodons(seq2, 1).affected).toHaveLength(1);
	});

	it('does not throw on unparseable input', () => {
		expect(() => findStopCodons('not an alignment at all', 0)).not.toThrow();
		expect(findStopCodons('', 0).scanned).toBe(false);
	});
});

describe('formatStopCodonReport describes, and does not advise', () => {
	const report = formatStopCodonReport(findStopCodons(withStop, 0));

	it('states the count, the sequence, and the codon column', () => {
		expect(report).toContain('1 of 2 sequences');
		expect(report).toContain('seq1: codon 3 (TAA)');
		expect(report).toContain('codon columns of the alignment');
	});

	it('names the genetic code it read', () => {
		// Which code was used determines what counts as a stop, so a report that omits it is not
		// interpretable.
		expect(report).toContain('Universal');
		expect(formatStopCodonReport(findStopCodons(withStop, 1))).not.toContain('Universal');
	});

	it('makes no recommendation and proposes no edit', () => {
		// The load-bearing assertion. Software that offers to trim, strip, fix or realign a
		// scientific alignment is asserting that doing so is acceptable, which is not its call.
		expect(report).not.toMatch(
			/should|recommend|suggest|try |consider|trim|strip|remove|fix|repair|correct |edit|we can|click here/i
		);
	});

	it('is empty when there is nothing to report', () => {
		expect(formatStopCodonReport(findStopCodons('>s\nATGAAAGGGCCC\n', 0))).toBe('');
		expect(formatStopCodonReport(null)).toBe('');
	});

	it('bounds a large report and says how much it left out', () => {
		const seqs = Array.from({ length: 30 }, (_, i) => `>s${i}\nATGTAAAAAGGG`).join('\n');
		const r = formatStopCodonReport(findStopCodons(seqs, 0));
		expect(r).toContain('30 of 30 sequences');
		expect(r).toMatch(/and 20 further sequences/);
	});
});

describe('validateCodonAlignment consolidates the finding', () => {
	it('produces ONE entry for stop codons rather than one per sequence', () => {
		// Previously a 200-sequence alignment produced 200 lines, joined with newlines into a toast.
		const seqs = Array.from({ length: 12 }, (_, i) => `>s${i}\nATGTAAAAAGGG`).join('\n');
		const result = validateCodonAlignment(seqs, 0);
		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain('12 of 12 sequences');
	});

	it('still reports the divisibility problem on its own terms', () => {
		const result = validateCodonAlignment('>s\nATGAAATAAG\n', 0);
		expect(result.errors.some((e) => /divisible by 3/.test(e))).toBe(true);
		// And does not also claim stop codons, whose positions would be undefined here.
		expect(result.errors.some((e) => /stop codon/i.test(e))).toBe(false);
	});

	it('exposes the structured finding for callers that want it', () => {
		const result = validateCodonAlignment(withStop, 0);
		expect(result.stopCodons.affected[0].hits[0].position).toBe(3);
	});
});
