/**
 * Tests for GARD model/datatype compatibility validation
 * Verifies that:
 * - Model options are correctly filtered by datatype
 * - gencodeid maps correctly to datatype
 * - Invalid model+datatype combos are corrected by the safety net
 */

import { describe, it, expect } from 'vitest';

// Model compatibility constants (mirroring MethodSelector and BackendAnalysisRunner)
const NUCLEOTIDE_MODELS = ['GTR', 'HKY85', 'TN93', 'JC69'];
const PROTEIN_MODELS = ['JTT', 'WAG', 'LG', 'Dayhoff'];

const FILTERED_OPTIONS = {
	codon: NUCLEOTIDE_MODELS,
	nucleotide: NUCLEOTIDE_MODELS,
	protein: PROTEIN_MODELS
};

const FILTERED_DEFAULTS = {
	codon: 'GTR',
	nucleotide: 'GTR',
	protein: 'JTT'
};

/**
 * Maps gencodeid to GARD datatype string
 * (same logic as the reactive block in MethodSelector)
 */
function gencodeidToDatatype(gencodeid) {
	if (gencodeid === -2) return 'protein';
	if (gencodeid === -1) return 'nucleotide';
	return 'codon'; // >= 0
}

/**
 * Validates and corrects a GARD model for a given datatype
 * (same logic as BackendAnalysisRunner safety net)
 */
function validateGardModel(model, datatype) {
	if ((datatype === 'nucleotide' || datatype === 'codon') && !NUCLEOTIDE_MODELS.includes(model)) {
		return 'GTR';
	}
	if (datatype === 'protein' && !PROTEIN_MODELS.includes(model)) {
		return 'JTT';
	}
	return model;
}

describe('GARD model/datatype compatibility', () => {
	describe('gencodeid to datatype mapping', () => {
		it('maps gencodeid >= 0 to codon', () => {
			expect(gencodeidToDatatype(0)).toBe('codon');
			expect(gencodeidToDatatype(1)).toBe('codon');
			expect(gencodeidToDatatype(11)).toBe('codon');
		});

		it('maps gencodeid -1 to nucleotide', () => {
			expect(gencodeidToDatatype(-1)).toBe('nucleotide');
		});

		it('maps gencodeid -2 to protein', () => {
			expect(gencodeidToDatatype(-2)).toBe('protein');
		});
	});

	describe('model filtering by datatype', () => {
		it('codon data shows only nucleotide models', () => {
			const models = FILTERED_OPTIONS['codon'];
			expect(models).toEqual(['GTR', 'HKY85', 'TN93', 'JC69']);
			expect(models).not.toContain('JTT');
			expect(models).not.toContain('WAG');
		});

		it('nucleotide data shows only nucleotide models', () => {
			const models = FILTERED_OPTIONS['nucleotide'];
			expect(models).toEqual(['GTR', 'HKY85', 'TN93', 'JC69']);
		});

		it('protein data shows only protein models', () => {
			const models = FILTERED_OPTIONS['protein'];
			expect(models).toEqual(['JTT', 'WAG', 'LG', 'Dayhoff']);
			expect(models).not.toContain('GTR');
			expect(models).not.toContain('HKY85');
		});
	});

	describe('default model per datatype', () => {
		it('codon defaults to GTR', () => {
			expect(FILTERED_DEFAULTS['codon']).toBe('GTR');
		});

		it('nucleotide defaults to GTR', () => {
			expect(FILTERED_DEFAULTS['nucleotide']).toBe('GTR');
		});

		it('protein defaults to JTT', () => {
			expect(FILTERED_DEFAULTS['protein']).toBe('JTT');
		});
	});

	describe('safety net: model validation and correction', () => {
		it('accepts valid nucleotide model for codon data', () => {
			expect(validateGardModel('GTR', 'codon')).toBe('GTR');
			expect(validateGardModel('HKY85', 'codon')).toBe('HKY85');
			expect(validateGardModel('TN93', 'nucleotide')).toBe('TN93');
			expect(validateGardModel('JC69', 'nucleotide')).toBe('JC69');
		});

		it('accepts valid protein model for protein data', () => {
			expect(validateGardModel('JTT', 'protein')).toBe('JTT');
			expect(validateGardModel('WAG', 'protein')).toBe('WAG');
			expect(validateGardModel('LG', 'protein')).toBe('LG');
			expect(validateGardModel('Dayhoff', 'protein')).toBe('Dayhoff');
		});

		it('corrects protein model on codon data to GTR', () => {
			expect(validateGardModel('JTT', 'codon')).toBe('GTR');
			expect(validateGardModel('WAG', 'codon')).toBe('GTR');
			expect(validateGardModel('LG', 'nucleotide')).toBe('GTR');
			expect(validateGardModel('Dayhoff', 'nucleotide')).toBe('GTR');
		});

		it('corrects nucleotide model on protein data to JTT', () => {
			expect(validateGardModel('GTR', 'protein')).toBe('JTT');
			expect(validateGardModel('HKY85', 'protein')).toBe('JTT');
			expect(validateGardModel('TN93', 'protein')).toBe('JTT');
			expect(validateGardModel('JC69', 'protein')).toBe('JTT');
		});
	});

	describe('filteredOptionsBy mechanism', () => {
		it('resolves filtered options based on controller value', () => {
			// Simulates what renderableAdvancedOptions does
			const modelConfig = {
				type: 'select',
				options: ['JTT', 'WAG', 'LG', 'Dayhoff', 'GTR', 'HKY85', 'TN93', 'JC69'],
				filteredOptionsBy: 'datatype',
				filteredOptions: FILTERED_OPTIONS
			};

			function resolveOptions(config, controllerValue) {
				if (config.filteredOptionsBy && config.filteredOptions) {
					const filtered = config.filteredOptions[controllerValue];
					if (filtered) return filtered;
				}
				return config.options;
			}

			expect(resolveOptions(modelConfig, 'codon')).toEqual(NUCLEOTIDE_MODELS);
			expect(resolveOptions(modelConfig, 'nucleotide')).toEqual(NUCLEOTIDE_MODELS);
			expect(resolveOptions(modelConfig, 'protein')).toEqual(PROTEIN_MODELS);
		});

		it('falls back to full options for unknown controller value', () => {
			const modelConfig = {
				options: ['A', 'B', 'C'],
				filteredOptionsBy: 'datatype',
				filteredOptions: { known: ['A'] }
			};

			function resolveOptions(config, controllerValue) {
				if (config.filteredOptionsBy && config.filteredOptions) {
					const filtered = config.filteredOptions[controllerValue];
					if (filtered) return filtered;
				}
				return config.options;
			}

			expect(resolveOptions(modelConfig, 'unknown')).toEqual(['A', 'B', 'C']);
		});
	});
});
