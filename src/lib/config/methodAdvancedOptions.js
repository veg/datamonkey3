/**
 * METHOD_ADVANCED_OPTIONS — the per-method advanced-option schema.
 *
 * Lifted out of MethodSelector.svelte because it is data, not markup, and two places now need it:
 * the selector renders it, and analysisConfig.restoreFrom filters a re-run's saved settings against
 * it so an option a later release removed cannot resurrect a control that no longer exists.
 *
 * Adding a method still means adding a section here — same content, one file over.
 */

export const METHOD_ADVANCED_OPTIONS = {
	// AxoMEME exposes almost nothing on purpose. It is a fitted model with one set of weights:
	// there are no branch sets to select (it consumes the whole tree as a distance matrix), no
	// rate-variation switch, and no genetic code choice — the code table is baked into the
	// model's tokenizer as the universal one. Offering knobs that do not reach the model would be
	// worse than offering none. Calling mode is the one real choice, because it is a threshold
	// applied AFTER inference and genuinely changes what gets reported.
	axomeme: {
		callMode: {
			type: 'select',
			label: 'How to rank sites',
			// percentile, not the reference driver's pvalue default. The model's predicted LRT does
			// not reach the chi-square gates pvalue compares against — measured across 12 real
			// submissions, one site in 662 cleared 3.12 and none cleared 4.45 — so pvalue makes the
			// method silent. See CALL_DEFAULTS in postprocess.js.
			default: 'percentile',
			options: ['percentile', 'zscore', 'pvalue'],
			description:
				'percentile and zscore rank sites within this alignment, which is what the model is built to do. pvalue compares against fixed LRT gates (4.45 / 3.12) that its scores rarely reach — it will usually report nothing.'
		}
	},
	fel: {
		// Branch selection options
		branchesToTest: {
			type: 'select',
			label: 'Branches to Test',
			default: 'All',
			options: ['All', 'Internal', 'Leaves', 'Unlabeled', 'Custom', 'Interactive'],
			description: 'Which branches to test for positive selection'
		},
		customBranches: {
			type: 'text',
			label: 'Custom branches (comma-separated or regex)',
			default: '',
			placeholder: 'e.g. Node1,Node2 or /^human/i',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Custom'],
			description: 'Comma-separated branch names or regex pattern'
		},
		interactiveTree: {
			type: 'interactive-tree',
			label: 'Select branches on tree',
			default: '',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Interactive'],
			description: 'Click on tree branches to select them for testing'
		},
		// Core FEL parameters
		srv: {
			type: 'select',
			label: 'Synonymous rate variation (recommended)',
			default: 'Yes',
			options: ['Yes', 'No']
		},
		multipleHits: {
			type: 'select',
			label: 'Multiple Hits',
			default: 'None',
			options: ['None', 'Double', 'Double+Triple']
		},
		siteMultihit: {
			type: 'select',
			label: 'Site Multihit',
			default: 'Estimate',
			options: ['Estimate', 'Global'],
			dependsOn: 'multipleHits',
			enabledWhen: ['Double', 'Double+Triple']
		},
		// Advanced parameters (matching the form structure)
		resample: {
			type: 'number',
			label: 'Resample (parametric bootstrap replicates)',
			default: 0,
			min: 0,
			max: 1000,
			step: 1,
			description:
				'Advanced setting - will result in MUCH SLOWER run time. Recommended for small to medium (<30 sequences) datasets.'
		},
		confidenceIntervals: {
			type: 'boolean',
			label: 'Compute confidence intervals',
			default: false,
			description: 'Compute profile likelihood confidence intervals for each variable site'
		},
		// Keep existing parameters for backward compatibility
		pValueThreshold: {
			type: 'number',
			label: 'P-value threshold',
			default: 0.1,
			min: 0.001,
			max: 1,
			step: 0.001
		}
	},
	meme: {
		pvalue: {
			type: 'number',
			label: 'P-value threshold',
			default: 0.1,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'P-value threshold for calling a site under selection'
		},
		rates: {
			type: 'number',
			label: 'Rate classes',
			default: 2,
			min: 2,
			max: 10,
			step: 1,
			description: 'Number of site rate classes'
		},
		multiple_hits: {
			type: 'select',
			label: 'Multiple hits',
			default: 'None',
			options: ['None', 'Double', 'Triple', 'Double+Triple'],
			description: 'Include support for multiple nucleotide substitutions'
		},
		site_multihit: {
			type: 'select',
			label: 'Site multiple hits',
			default: 'Estimate',
			options: ['Estimate', 'None'],
			description: 'How to handle multiple hits per site'
		},
		impute_states: {
			type: 'select',
			label: 'Impute states',
			default: 'No',
			options: ['No', 'Yes'],
			description: 'Impute ancestral states for internal nodes'
		}
	},
	slac: {
		// Branch selection options (similar to FEL)
		branchesToTest: {
			type: 'select',
			label: 'Branches to Test',
			default: 'All',
			options: ['All', 'Internal', 'Leaves', 'Unlabeled', 'Custom', 'Interactive'],
			description: 'Which branches to test for positive selection'
		},
		customBranches: {
			type: 'text',
			label: 'Custom branches (comma-separated or regex)',
			default: '',
			placeholder: 'e.g. Node1,Node2 or /^human/i',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Custom'],
			description: 'Comma-separated branch names or regex pattern'
		},
		interactiveTree: {
			type: 'interactive-tree',
			label: 'Select branches on tree',
			default: '',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Interactive'],
			description: 'Click on tree branches to select them for testing'
		},
		// SLAC-specific parameters
		samples: {
			type: 'number',
			label: 'Ancestral reconstruction samples',
			default: 100,
			min: 1,
			max: 1000,
			step: 1,
			description: 'Number of samples for ancestral reconstruction uncertainty'
		},
		pvalue: {
			type: 'number',
			label: 'P-value threshold',
			default: 0.1,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'The p-value threshold to use when testing for selection'
		}
	},
	fubar: {
		grid: {
			type: 'number',
			label: 'Number of grid points',
			default: 20,
			min: 5,
			max: 50,
			description: 'Specifies the number of grid points for the Bayesian analysis'
		},
		concentration_parameter: {
			type: 'number',
			label: 'Concentration parameter',
			default: 0.5,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'The concentration parameter for the Dirichlet prior in the Bayesian estimation'
		},
		posteriorThreshold: {
			type: 'number',
			label: 'Posterior probability threshold',
			default: 0.9,
			min: 0.5,
			max: 0.99,
			step: 0.01,
			description:
				'Sites with posterior probability above this threshold are considered under positive selection'
		}
	},
	'b-still': {
		grid: {
			type: 'number',
			label: 'Number of grid points',
			default: 20,
			min: 5,
			max: 50,
			description: 'Grid points per dimension (total grid = D²)'
		},
		concentration_parameter: {
			type: 'number',
			label: 'Concentration parameter',
			default: 0.5,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'Dirichlet prior concentration parameter'
		},
		method: {
			type: 'select',
			label: 'Posterior estimation method',
			default: 'Variational-Bayes',
			options: ['Variational-Bayes', 'Collapsed-Gibbs', 'Metropolis-Hastings'],
			description: 'Method for estimating the posterior distribution'
		},
		ebf: {
			type: 'number',
			label: 'EBF threshold',
			default: 10,
			min: 1,
			max: 1000,
			step: 1,
			description: 'Empirical Bayes Factor threshold for reporting invariant sites'
		},
		radius_threshold: {
			type: 'number',
			label: 'Radius threshold',
			default: 0.5,
			min: 0,
			max: 10,
			step: 0.1,
			description: 'Expected substitution multiplier for near-zero regime'
		}
	},
	'b-still': {
		grid: {
			type: 'number',
			label: 'Number of grid points',
			default: 20,
			min: 5,
			max: 50,
			description: 'Grid points per dimension (total grid = D²)'
		},
		concentration_parameter: {
			type: 'number',
			label: 'Concentration parameter',
			default: 0.5,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'Dirichlet prior concentration parameter'
		},
		method: {
			type: 'select',
			label: 'Posterior estimation method',
			default: 'Variational-Bayes',
			options: ['Variational-Bayes', 'Collapsed-Gibbs', 'Metropolis-Hastings'],
			description: 'Method for estimating the posterior distribution'
		},
		ebf: {
			type: 'number',
			label: 'EBF threshold',
			default: 10,
			min: 1,
			max: 1000,
			step: 1,
			description: 'Empirical Bayes Factor threshold for reporting invariant sites'
		},
		radius_threshold: {
			type: 'number',
			label: 'Radius threshold',
			default: 0.5,
			min: 0,
			max: 10,
			step: 0.1,
			description: 'Expected substitution multiplier for near-zero regime'
		}
	},
	absrel: {
		// Branch selection options
		branchesToTest: {
			type: 'select',
			label: 'Branches to Test',
			default: 'All',
			options: ['All', 'Internal', 'Leaves', 'Unlabeled', 'Custom', 'Interactive'],
			description: 'Which branches to test (default: All)'
		},
		customBranches: {
			type: 'text',
			label: 'Custom branches (comma-separated or regex)',
			default: '',
			placeholder: 'e.g. Node1,Node2 or /^human/i',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Custom'],
			description: 'Comma-separated branch names or regex pattern'
		},
		interactiveTree: {
			type: 'interactive-tree',
			label: 'Select branches on tree',
			default: '',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Interactive'],
			description: 'Click on tree branches to select them for testing'
		},
		// Core aBSREL parameters
		multipleHits: {
			type: 'select',
			label: 'Multiple Hits',
			default: 'None',
			options: ['None', 'Double', 'Double+Triple'],
			description: 'Include support for multiple nucleotide substitutions'
		},
		srv: {
			type: 'select',
			label: 'Synonymous Rate Variation',
			default: 'Yes',
			options: ['Yes', 'No'],
			description: 'Include synonymous rate variation'
		},
		// Advanced parameters
		blb: {
			type: 'number',
			label: 'Bag of Little Bootstrap (BLB) Rate',
			default: 1.0,
			min: 0.0,
			max: 1.0,
			step: 0.1,
			description: '[Advanced] Bag of little bootstrap alignment resampling rate'
		}
	},
	busted: {
		// Branch selection options
		branchesToTest: {
			type: 'select',
			label: 'Foreground Branches',
			default: 'All',
			options: ['All', 'Internal', 'Leaves', 'Unlabeled', 'Custom', 'Interactive'],
			description:
				'Select foreground branches to test for positive selection. All other branches will be treated as background.'
		},
		customBranches: {
			type: 'text',
			label: 'Custom foreground branches (comma-separated or regex)',
			default: '',
			placeholder: 'e.g. Node1,Node2 or /^human/i',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Custom'],
			description: 'Comma-separated branch names or regex pattern for foreground branches'
		},
		interactiveTree: {
			type: 'interactive-tree',
			label: 'Select foreground branches on tree',
			default: '',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Interactive'],
			description: 'Click on tree branches to select them as foreground branches for testing'
		},
		// Core BUSTED parameters
		srv: {
			type: 'select',
			label: 'Synonymous rate variation (BUSTED-S)',
			default: 'Yes',
			options: ['Yes', 'No', 'Branch-site'],
			description: 'Include variations in synonymous substitution rates'
		},
		errorSink: {
			type: 'select',
			label: 'Error protection (BUSTED-E)',
			default: 'No',
			options: ['Yes', 'No'],
			description: 'Enhance robustness against alignment errors'
		},
		multipleHits: {
			type: 'select',
			label: 'Multiple Hits',
			default: 'None',
			options: ['None', 'Double', 'Double+Triple'],
			description: 'Support for handling multiple nucleotide substitutions'
		},
		// Advanced parameters
		rates: {
			type: 'number',
			label: 'Omega rate classes',
			default: 3,
			min: 2,
			max: 10,
			step: 1,
			description: 'Number of omega rate classes in the model'
		},
		synRates: {
			type: 'number',
			label: 'Synonymous rate classes',
			default: 3,
			min: 2,
			max: 10,
			step: 1,
			description: 'Number of synonymous rate classes in the model'
		},
		gridSize: {
			type: 'number',
			label: 'Grid size',
			default: 250,
			min: 50,
			max: 1000,
			step: 50,
			description: 'Number of points in initial distributional guess for likelihood fitting'
		},
		startingPoints: {
			type: 'number',
			label: 'Starting points',
			default: 1,
			min: 1,
			max: 10,
			step: 1,
			description: 'Number of initial random guesses to seed rate values optimization'
		}
	},
	gard: {
		datatype: {
			type: 'select',
			label: 'Data type',
			default: 'nucleotide',
			options: ['codon', 'nucleotide', 'protein'],
			description: 'Type of data to analyze for recombination'
		},
		model: {
			type: 'select',
			label: 'Substitution model',
			default: 'GTR',
			options: ['JTT', 'WAG', 'LG', 'Dayhoff', 'GTR', 'HKY85', 'TN93', 'JC69'],
			filteredOptionsBy: 'datatype',
			filteredOptions: {
				codon: ['GTR', 'HKY85', 'TN93', 'JC69'],
				nucleotide: ['GTR', 'HKY85', 'TN93', 'JC69'],
				protein: ['JTT', 'WAG', 'LG', 'Dayhoff']
			},
			filteredDefaults: {
				codon: 'GTR',
				nucleotide: 'GTR',
				protein: 'JTT'
			},
			description: 'Substitution model to use for the analysis'
		},
		mode: {
			type: 'select',
			label: 'Run mode',
			default: 'Normal',
			options: ['Normal', 'Faster'],
			description: 'Normal: thorough analysis; Faster: quicker but less comprehensive'
		},
		rv: {
			type: 'select',
			label: 'Site-to-site rate variation',
			default: 'None',
			options: ['None', 'GDD', 'Gamma'],
			description: 'Model for rate variation among sites (None, General Discrete, Beta-Gamma)'
		},
		rate_classes: {
			type: 'number',
			label: 'Rate classes',
			default: 4,
			min: 2,
			max: 10,
			description: 'Number of discrete rate classes for rate variation'
		}
	},
	bgm: {
		steps: {
			type: 'number',
			label: 'Chain length steps',
			default: 10000,
			min: 1000,
			max: 100000000,
			step: 1000,
			description: 'Length of each MCMC chain'
		},
		burnIn: {
			type: 'number',
			label: 'Burn-in samples',
			default: 1000,
			min: 100,
			max: 100000,
			step: 100,
			description: 'Number of burn-in samples to discard'
		},
		samples: {
			type: 'number',
			label: 'Samples',
			default: 100,
			min: 10,
			max: 10000,
			step: 10,
			description: 'Number of samples to collect'
		},
		maxParents: {
			type: 'number',
			label: 'Maximum parents per node',
			default: 1,
			min: 0,
			max: 10,
			step: 1,
			description: 'Maximum number of parents allowed per node in the graphical model'
		},
		minSubs: {
			type: 'number',
			label: 'Minimum substitutions per site',
			default: 1,
			min: 1,
			max: 100,
			step: 1,
			description: 'Minimum number of substitutions required per site'
		}
	},
	fade: {
		pValueThreshold: {
			type: 'number',
			label: 'P-value threshold',
			default: 0.1,
			min: 0.001,
			max: 1,
			step: 0.001
		},
		gridPoints: { type: 'number', label: 'Grid points', default: 20, min: 5, max: 50 },
		mcmcChains: { type: 'number', label: 'MCMC chains', default: 5, min: 2, max: 20 },
		mcmcSamples: {
			type: 'number',
			label: 'MCMC samples',
			default: 2000000,
			min: 100000,
			max: 10000000,
			step: 100000
		}
	},
	relax: {
		// Branch selection options
		branchesToTest: {
			type: 'select',
			label: 'Branch Selection Mode',
			default: 'Interactive',
			options: ['Interactive'],
			description: 'Select TEST and REFERENCE branches interactively on the tree'
		},
		interactiveTree: {
			type: 'interactive-tree',
			label: 'Select TEST and REFERENCE branches on tree',
			default: '',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Interactive'],
			description: 'Click on tree branches to assign them to TEST or REFERENCE sets'
		},
		// RELAX-specific parameters
		models: {
			type: 'select',
			label: 'Analysis models',
			default: 'All',
			options: ['All', 'Minimal'],
			description: 'All: descriptive models and RELAX test; Minimal: RELAX test only'
		},
		rates: {
			type: 'number',
			label: 'Omega rate classes',
			default: 3,
			min: 2,
			max: 10,
			step: 1,
			description: 'Number of omega rate classes'
		},
		mode: {
			type: 'select',
			label: 'Run mode',
			default: 'Classic mode',
			options: ['Classic mode'],
			description: 'RELAX analysis mode'
		},
		killZeroLengths: {
			type: 'select',
			label: 'Kill zero-length branches',
			default: 'No',
			options: ['No', 'Yes'],
			description: 'How to handle zero-length branches'
		}
	},
	'multi-hit': {
		rates: {
			type: 'number',
			label: 'Rate classes',
			default: 3,
			min: 1,
			max: 10,
			step: 1,
			description: 'Number of omega rate classes to include in the model'
		},
		triple_islands: {
			type: 'select',
			label: 'Triple islands',
			default: 'No',
			options: ['No', 'Yes'],
			description: 'Use separate rate parameter for synonymous triple-hit substitutions'
		}
	},
	nrm: {
		rate_classes: {
			type: 'number',
			label: 'Rate classes',
			default: 1,
			min: 1,
			max: 10,
			step: 1,
			description: 'Number of rate classes for the analysis'
		},
		triple_islands: {
			type: 'select',
			label: 'Triple islands',
			default: 'No',
			options: ['No', 'Yes'],
			description: 'Use triple islands for the analysis'
		}
	},
	prime: {
		// PRIME variant selection
		variant: {
			type: 'select',
			label: 'PRIME Variant',
			default: 'S-PRIME',
			options: [
				'S-PRIME',
				{ value: 'G-PRIME', label: 'G-PRIME (coming soon)', disabled: true },
				{ value: 'E-PRIME', label: 'E-PRIME (coming soon)', disabled: true }
			],
			description: 'S-PRIME: site-level property-informed model'
		},
		// Branch selection options
		branchesToTest: {
			type: 'select',
			label: 'Branches to Test',
			default: 'All',
			options: ['All', 'Internal', 'Leaves', 'Unlabeled', 'Interactive'],
			description: 'Which branches to test for property-dependent selection'
		},
		interactiveTree: {
			type: 'interactive-tree',
			label: 'Select branches on tree',
			default: '',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Interactive'],
			description: 'Click on tree branches to select them for testing'
		},
		// Property set selection
		propertySet: {
			type: 'select',
			label: 'Amino Acid Property Set',
			default: '5PROP',
			options: ['5PROP', '4PROP', '3PROP', '2PROP', 'Atchley', 'LCAP'],
			description:
				'Set of amino acid properties to model (5PROP: hydrophobicity, polarity, volume, charge, iso-electric point)'
		},
		// P-value threshold
		pValueThreshold: {
			type: 'number',
			label: 'P-value threshold',
			default: 0.1,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'The p-value threshold to use when testing for property-dependent selection'
		},
		// Impute states
		imputeStates: {
			type: 'select',
			label: 'Impute states',
			default: 'No',
			options: ['No', 'Yes'],
			description: 'Use site-level model fits to impute likely character states'
		}
	},
	'contrast-fel': {
		// Branch selection options
		branchesToTest: {
			type: 'select',
			label: 'Branch Selection Mode',
			default: 'Interactive',
			options: ['Custom', 'Interactive'],
			description: 'How to specify branch sets for comparison'
		},
		// Custom branch set configuration (when not using Interactive)
		branchSet1: {
			type: 'text',
			label: 'Branch Set 1 (Source)',
			default: 'Source',
			placeholder: 'e.g. Source, Internal, Leaves',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Custom'],
			description: 'First group of branches to compare'
		},
		branchSet2: {
			type: 'text',
			label: 'Branch Set 2 (Test)',
			default: 'Test',
			placeholder: 'e.g. Test, Unlabeled, Custom',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Custom'],
			description: 'Second group of branches to compare'
		},
		branchSet3: {
			type: 'text',
			label: 'Branch Set 3 (optional)',
			default: '',
			placeholder: 'e.g. Reference, Background',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Custom'],
			description: 'Optional third group of branches for comparison'
		},
		// Interactive tree selection
		interactiveTree: {
			type: 'interactive-tree',
			label: 'Select branch sets on tree',
			default: '',
			dependsOn: 'branchesToTest',
			enabledWhen: ['Interactive'],
			description: 'Click on tree branches to assign them to different sets for comparison'
		},
		// Core Contrast-FEL parameters
		srv: {
			type: 'select',
			label: 'Synonymous rate variation (recommended)',
			default: 'Yes',
			options: ['Yes', 'No'],
			description: 'Include synonymous rate variation in the model'
		},
		permutations: {
			type: 'select',
			label: 'Perform permutation tests',
			default: 'Yes',
			options: ['Yes', 'No'],
			description: 'Use permutation tests to evaluate significance'
		},
		// Statistical thresholds
		pvalue: {
			type: 'number',
			label: 'P-value threshold',
			default: 0.05,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'Significance value for site tests'
		},
		qvalue: {
			type: 'number',
			label: 'Q-value threshold (FDR)',
			default: 0.2,
			min: 0.001,
			max: 1,
			step: 0.001,
			description: 'False Discovery Rate threshold for reporting'
		},
		// Output options
		output: {
			type: 'text',
			label: 'Output file name (optional)',
			default: '',
			placeholder: 'e.g. contrast_results.json',
			description: 'Custom name for output file (defaults to automatic naming)'
		}
	}
};
