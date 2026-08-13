/**
 * HyPhy's genetic code table, keyed by the numeric ID HyPhy uses on the command line and in
 * datareader's FILE_INFO.gencodeid.
 *
 * This lived inside MethodSelector.svelte, which meant the Data tab had no way to turn a
 * gencodeid back into a name and printed the bare integer instead. One home, two consumers.
 * The `name` values are the option labels in the Analyze tab's dropdown and are mapped back to
 * `id` there — do not reword them without checking that mapping.
 */
export const GENETIC_CODES = [
	{ id: 0, name: 'Universal', label: 'Universal code' },
	{ id: 1, name: 'Vertebrate mitochondrial', label: 'Vertebrate mitochondrial DNA code' },
	{ id: 2, name: 'Yeast mitochondrial', label: 'Yeast mitochondrial DNA code' },
	{
		id: 3,
		name: 'Mold mitochondrial',
		label: 'Mold, Protozoan and Coelenterate mt; Mycloplasma/Spiroplasma'
	},
	{ id: 4, name: 'Invertebrate mitochondrial', label: 'Invertebrate mitochondrial DNA code' },
	{ id: 5, name: 'Ciliate nuclear', label: 'Ciliate, Dasycladacean and Hexamita Nuclear code' },
	{ id: 6, name: 'Echinoderm mitochondrial', label: 'Echinoderm mitochondrial DNA code' },
	{ id: 7, name: 'Euplotid nuclear', label: 'Euplotid Nuclear code' },
	{ id: 8, name: 'Alternative yeast nuclear', label: 'Alternative Yeast Nuclear code' },
	{ id: 9, name: 'Ascidian mitochondrial', label: 'Ascidian mitochondrial DNA code' },
	{ id: 10, name: 'Flatworm mitochondrial', label: 'Flatworm mitochondrial DNA code' },
	{ id: 11, name: 'Blepharisma nuclear', label: 'Blepharisma Nuclear code' }
];
