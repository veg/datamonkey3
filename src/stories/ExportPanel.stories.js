import ExportPanelDemo from './components/ExportPanelDemo.svelte';
import '../app.css';

export default {
	title: 'Export/ExportPanel',
	component: ExportPanelDemo,
	argTypes: {
		analysis: { control: 'object' },
		file: { control: 'object' },
		resultData: { control: 'object' },
		showExportOptions: { control: 'boolean' }
	},
	parameters: {
		docs: {
			description: {
				component:
					'Export panel for downloading analysis results as JSON. Features custom filename editing, metadata inclusion toggle, and preview functionality.'
			}
		}
	}
};

// Mock data
const mockAnalysis = {
	id: 'analysis-123',
	method: 'fel',
	status: 'completed',
	createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
	completedAt: new Date().toISOString()
};

const mockFile = {
	id: 'file-456',
	filename: 'sequences.fasta',
	size: 1024,
	type: 'fasta'
};

const mockFelResults = {
	input: {
		file: 'sequences.fasta',
		tree: '(seq1:0.1,seq2:0.2)',
		sequences: 10,
		sites: 300
	},
	fits: [
		{
			model: 'Global MG94xREV',
			log_likelihood: -1234.56,
			parameters: 23,
			AIC: 2515.12
		}
	],
	tested: {
		sites: [
			{ site_index: 1, p: 0.001, alpha: 0.5, beta: 2.1 },
			{ site_index: 2, p: 0.15, alpha: 1.2, beta: 0.8 },
			{ site_index: 3, p: 0.03, alpha: 2.8, beta: 0.4 },
			{ site_index: 4, p: 0.002, alpha: 0.3, beta: 3.2 },
			{ site_index: 5, p: 0.8, alpha: 0.9, beta: 1.1 }
		]
	}
};

const Template = (args) => ({
	Component: ExportPanelDemo,
	props: args
});

export const Collapsed = Template.bind({});
Collapsed.args = {
	analysis: mockAnalysis,
	file: mockFile,
	resultData: mockFelResults,
	showExportOptions: false
};
Collapsed.parameters = {
	docs: {
		description: {
			story: 'Export panel in collapsed state showing only the header.'
		}
	}
};

export const Expanded = Template.bind({});
Expanded.args = {
	analysis: mockAnalysis,
	file: mockFile,
	resultData: mockFelResults,
	showExportOptions: true
};
Expanded.parameters = {
	docs: {
		description: {
			story: 'Export panel expanded showing filename customization, metadata toggle, and download button.'
		}
	}
};

export const WithFelResults = Template.bind({});
WithFelResults.args = {
	analysis: {
		id: 'fel-123',
		method: 'fel',
		status: 'completed',
		createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		completedAt: new Date().toISOString()
	},
	file: {
		id: 'file-1',
		filename: 'hiv_pol_gene.fasta',
		size: 8192
	},
	resultData: mockFelResults,
	showExportOptions: true
};
WithFelResults.parameters = {
	docs: {
		description: {
			story: 'Export panel with FEL analysis results ready to download.'
		}
	}
};

export const WithBustedResults = Template.bind({});
WithBustedResults.args = {
	analysis: {
		id: 'busted-456',
		method: 'busted',
		status: 'completed',
		createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
		completedAt: new Date().toISOString()
	},
	file: {
		id: 'file-2',
		filename: 'influenza_alignment.fasta',
		size: 4096
	},
	resultData: {
		input: {
			file: 'influenza_alignment.fasta',
			sequences: 8,
			sites: 250
		},
		fits: [
			{
				model: 'Unconstrained model',
				log_likelihood: -987.65,
				parameters: 15,
				AIC: 2005.3
			}
		],
		test_results: {
			'p-value': 0.001,
			'likelihood ratio': 15.56,
			'evidence for selection': 'Strong evidence'
		}
	},
	showExportOptions: true
};
WithBustedResults.parameters = {
	docs: {
		description: {
			story: 'Export panel configured for BUSTED analysis results.'
		}
	}
};

export const NoAnalysis = Template.bind({});
NoAnalysis.args = {
	analysis: null,
	file: null,
	resultData: null,
	showExportOptions: true
};
NoAnalysis.parameters = {
	docs: {
		description: {
			story: 'Export panel when no analysis is loaded. Export button is disabled.'
		}
	}
};
