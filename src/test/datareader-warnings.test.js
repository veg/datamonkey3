/**
 * What the Data tab tells the user about the changes datareader made to their alignment.
 *
 * datareader collapses duplicates, renames sequences, pads short ones and strips a terminal stop
 * codon column. It has always written a sentence about each of those to ./datareader.log — a file
 * nothing in the JS layer reads. Only counts reached results.json, and one of them was mislabelled:
 * `ambiguous_sites` is the boolean padWarning, and the UI rendered it as "Found 1 ambiguous
 * character in your alignment" — wrong count, wrong cause, wrong advice.
 *
 * The describe-don't-modify assertion at the bottom is the maintainer's rule, mirrored from
 * stop-codon-diagnosis.test.js: this UI states what is in the file and stops there.
 */
import { describe, it, expect } from 'vitest';
import { buildWarnings } from '../lib/utils/datareaderWarnings.js';

const textOf = (w) => [w.title, w.message, w.details, ...(w.items ?? [])].join(' ');

describe('padding warning', () => {
	it('explains padding rather than reporting an ambiguous-character count', () => {
		// The legacy boolean, which is all a cached record has.
		const [w] = buildWarnings({ ambiguous_sites: 1 });
		expect(w.message).toContain('padded');
		expect(w.message).not.toContain('ambiguous character');
		expect(textOf(w)).not.toContain('ambiguous character');
	});

	it('names how many sequences were padded, and which gap characters count', () => {
		const [w] = buildWarnings({ padded_sequences: 3 });
		expect(w.message).toContain('3 sequences');
		expect(w.details).toContain('~');
		expect(w.details).toContain('-');
	});
});

describe('stop codons', () => {
	it('leaves the dead `stop_codons` key dead', () => {
		// datareader has never emitted this key; the branch that read it could not fire, and
		// reviving it would fire on a key that means something else.
		expect(buildWarnings({ stop_codons: 5 })).toHaveLength(0);
	});

	it('reports the key datareader does emit, as the boolean it is', () => {
		const warnings = buildWarnings({ stop_codons_stripped: 1 });
		expect(warnings).toHaveLength(1);
		expect(warnings[0].message).toMatch(/stop codon/i);
	});
});

describe('names of the sequences that changed', () => {
	it('lists renames', () => {
		const [w] = buildWarnings({ renamed_names: ['seq|1 -> seq_1'] });
		expect(w.items).toContain('seq|1 -> seq_1');
		expect(textOf(w)).toContain('seq_1');
	});

	it('lists duplicate pairs', () => {
		const [w] = buildWarnings({ duplicate_names: ['a = b'] });
		expect(w.items).toContain('a = b');
	});

	it("accepts HyPhy's numerically-keyed objects as well as arrays", () => {
		const [w] = buildWarnings({ renamed_names: { 0: 'x|1 -> x_1', 1: 'y|2 -> y_2' } });
		expect(w.items).toEqual(['x|1 -> x_1', 'y|2 -> y_2']);
	});

	it('carries a name containing a double quote through without breaking', () => {
		const [w] = buildWarnings({ duplicate_names: ['say "hi" = other'] });
		expect(w.items).toContain('say "hi" = other');
		expect(textOf(w)).toContain('say "hi"');
	});

	it('fires on the names alone, without a separate count field', () => {
		expect(buildWarnings({ duplicate_names: ['a = b'] })).toHaveLength(1);
		expect(buildWarnings({ renamed_names: ['a -> b'] })).toHaveLength(1);
	});
});

describe('the copy describes, and never offers to modify the alignment', () => {
	it('recommends nothing across every warning it can produce', () => {
		const everything = buildWarnings({
			duplicate_sequences: 2,
			duplicate_names: ['a = b', 'c = a'],
			sequences_renamed: 1,
			renamed_names: ['seq|1 -> seq_1'],
			padded_sequences: 2,
			ambiguous_sites: 1,
			stop_codons_stripped: 1,
			sites: 12,
			sequences: 4
		});
		expect(everything.length).toBeGreaterThan(4);
		for (const w of everything) {
			expect(textOf(w)).not.toMatch(/remove|fix|trim|we can|repair/i);
		}
	});
});

describe('a clean file produces no warnings', () => {
	it('says nothing about an alignment with nothing to report', () => {
		expect(
			buildWarnings({
				duplicate_sequences: 0,
				sequences_renamed: 0,
				ambiguous_sites: 0,
				padded_sequences: 0,
				stop_codons_stripped: 0,
				sites: 187,
				sequences: 10
			})
		).toEqual([]);
	});

	it('tolerates a missing FILE_INFO', () => {
		expect(buildWarnings(undefined)).toEqual([]);
	});
});
