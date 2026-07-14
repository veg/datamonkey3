import AnalysisTimingEstimate from '../lib/AnalysisTimingEstimate.svelte';
import AnalysisTimingEstimateWrapper from './AnalysisTimingEstimateWrapper.svelte';

export default {
	title: 'Analysis/AnalysisTimingEstimate',
	component: AnalysisTimingEstimateWrapper,
	argTypes: {
		method: {
			control: 'select',
			options: [
				'fel',
				'meme',
				'slac',
				'fubar',
				'absrel',
				'busted',
				'gard',
				'bgm',
				'relax',
				'multi-hit',
				'contrast-fel'
			]
		},
		geneticCode: {
			control: 'select',
			options: [
				'Universal',
				'Vertebrate-mitochondrial',
				'Yeast-mitochondrial',
				'Mold-mitochondrial'
			]
		},
		datasetSize: {
			control: 'select',
			options: ['small', 'medium', 'large'],
			description: 'Size of the mock dataset'
		},
		executionMode: {
			control: 'select',
			options: ['backend', 'wasm'],
			description: 'Execution environment (backend or local WASM)'
		}
	}
};

// Default story - Fast analysis on small dataset
export const Default = {
	args: {
		method: 'slac',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'small',
		executionMode: 'backend'
	}
};

// Very fast analysis - Backend
export const VeryFastAnalysis = {
	args: {
		method: 'slac',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'small',
		executionMode: 'backend'
	}
};

// Fast analysis - Backend
export const FastAnalysis = {
	args: {
		method: 'fel',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'large',
		executionMode: 'backend'
	}
};

// Medium speed analysis - Backend
export const MediumSpeedAnalysis = {
	args: {
		method: 'meme',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'large',
		executionMode: 'backend'
	}
};

// Slow analysis - Backend
export const SlowAnalysis = {
	args: {
		method: 'absrel',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'large',
		executionMode: 'backend'
	}
};

// Very slow analysis - Backend
export const VerySlowAnalysis = {
	args: {
		method: 'bgm',
		methodOptions: {
			steps: 30000,
			samples: 200
		},
		geneticCode: 'Universal',
		datasetSize: 'large',
		executionMode: 'backend'
	}
};

// Analysis with advanced options (increased complexity)
export const WithAdvancedOptions = {
	args: {
		method: 'fel',
		methodOptions: {
			rateClasses: 6,
			confidenceIntervals: true,
			synonymousRateVariation: true
		},
		geneticCode: 'Universal',
		datasetSize: 'medium',
		executionMode: 'backend'
	}
};

// FUBAR with MCMC options
export const FubarWithMCMC = {
	args: {
		method: 'fubar',
		methodOptions: {
			mcmcSamples: 5000000,
			mcmcChains: 10,
			gridPoints: 40
		},
		geneticCode: 'Universal',
		datasetSize: 'medium',
		executionMode: 'backend'
	}
};

// GARD analysis (very slow)
export const GardAnalysis = {
	args: {
		method: 'gard',
		methodOptions: {
			maxBreakpoints: 20,
			siteToSiteRateVariation: true
		},
		geneticCode: 'Universal',
		datasetSize: 'large',
		executionMode: 'backend'
	}
};

// Local WASM execution examples
export const LocalWasmFast = {
	args: {
		method: 'slac',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'medium',
		executionMode: 'wasm'
	}
};

export const LocalWasmMedium = {
	args: {
		method: 'fubar',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'medium',
		executionMode: 'wasm'
	}
};

export const LocalWasmSlow = {
	args: {
		method: 'busted',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: 'large',
		executionMode: 'wasm'
	}
};

// No file selected
export const NoFileSelected = {
	args: {
		method: 'fel',
		methodOptions: {},
		geneticCode: 'Universal',
		datasetSize: null,
		executionMode: 'backend'
	}
};

// Method comparison
export const MethodComparison = {
	render: () => ({
		Component: {
			template: `
				<div class="p-4 space-y-4">
					<h2 class="text-xl font-bold mb-4">Runtime Estimates for All Methods (Medium Dataset: 50 sequences, 2000 sites)</h2>
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						<div class="border rounded p-3" v-for="method in methods" :key="method">
							<h3 class="font-semibold mb-2">{{ methodLabels[method] || method.toUpperCase() }}</h3>
							<AnalysisTimingEstimateWrapper :method="method" datasetSize="medium" />
						</div>
					</div>
				</div>
			`,
			components: { AnalysisTimingEstimateWrapper },
			data() {
				return {
					methods: [
						'slac',
						'fel',
						'meme',
						'fubar',
						'absrel',
						'busted',
						'relax',
						'multi-hit',
						'contrast-fel',
						'gard',
						'bgm'
					],
					methodLabels: {
						slac: 'SLAC (Fastest)',
						fel: 'FEL',
						meme: 'MEME',
						fubar: 'FUBAR',
						absrel: 'aBSREL',
						busted: 'BUSTED',
						relax: 'RELAX',
						fade: 'FADE',
						'multi-hit': 'Multi-hit',
						nrm: 'NRM',
						'contrast-fel': 'Contrast-FEL',
						gard: 'GARD',
						bgm: 'BGM (Slowest)'
					}
				};
			}
		}
	})
};
