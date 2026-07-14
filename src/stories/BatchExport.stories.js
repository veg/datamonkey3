import BatchExportDemo from './components/BatchExportDemo.svelte';
import '../app.css';

export default {
	title: 'Export/BatchExport',
	component: BatchExportDemo,
	argTypes: {
		analyses: { control: 'object' },
		files: { control: 'object' }
	},
	parameters: {
		docs: {
			description: {
				component:
					'Batch export component for downloading multiple analysis results as a ZIP archive. Features filtering by method and file, multi-select functionality. Each analysis is exported as a separate JSON file within the ZIP.'
			}
		}
	}
};

// Mock files
const mockFiles = [
	{ id: 'file-1', filename: 'hiv_sequences.fasta', size: 2048 },
	{ id: 'file-2', filename: 'influenza_alignment.fasta', size: 4096 },
	{ id: 'file-3', filename: 'coronavirus_genes.fasta', size: 8192 }
];

// Mock analyses (excluding datareader since those are now in Data tab)
const mockAnalyses = [
	{
		id: 'analysis-1',
		method: 'fel',
		status: 'completed',
		fileId: 'file-1',
		createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).getTime()
	},
	{
		id: 'analysis-2',
		method: 'busted',
		status: 'completed',
		fileId: 'file-1',
		createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).getTime()
	},
	{
		id: 'analysis-3',
		method: 'meme',
		status: 'completed',
		fileId: 'file-2',
		createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).getTime()
	},
	{
		id: 'analysis-5',
		method: 'slac',
		status: 'completed',
		fileId: 'file-3',
		createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).getTime()
	},
	{
		id: 'analysis-6',
		method: 'fel',
		status: 'completed',
		fileId: 'file-3',
		createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).getTime()
	}
];

const Template = (args) => ({
	Component: BatchExportDemo,
	props: args
});

export const Default = Template.bind({});
Default.args = {
	analyses: mockAnalyses,
	files: mockFiles
};
Default.parameters = {
	docs: {
		description: {
			story: 'Default batch export panel showing multiple completed analyses with filtering options and multi-select functionality. Exports as ZIP archive.'
		}
	}
};

export const MultipleAnalyses = Template.bind({});
MultipleAnalyses.args = {
	analyses: mockAnalyses,
	files: mockFiles
};
MultipleAnalyses.parameters = {
	docs: {
		description: {
			story: 'Batch export with multiple analyses from different methods (FEL, BUSTED, MEME, SLAC) across multiple files.'
		}
	}
};

export const SingleMethod = Template.bind({});
SingleMethod.args = {
	analyses: mockAnalyses.filter((a) => a.method === 'fel'),
	files: mockFiles
};
SingleMethod.parameters = {
	docs: {
		description: {
			story: 'Batch export showing only FEL analyses. Useful when comparing results across different datasets.'
		}
	}
};

export const SingleFile = Template.bind({});
SingleFile.args = {
	analyses: mockAnalyses.filter((a) => a.fileId === 'file-1'),
	files: mockFiles.filter((f) => f.id === 'file-1')
};
SingleFile.parameters = {
	docs: {
		description: {
			story: 'Batch export showing analyses for a single file (hiv_sequences.fasta).'
		}
	}
};

export const ManyAnalyses = Template.bind({});
ManyAnalyses.args = {
	analyses: [
		...mockAnalyses,
		...Array.from({ length: 15 }, (_, i) => ({
			id: `analysis-${i + 10}`,
			method: ['fel', 'busted', 'meme', 'slac', 'absrel'][i % 5],
			status: 'completed',
			fileId: mockFiles[i % 3].id,
			createdAt: new Date(Date.now() - (i + 1) * 60 * 60 * 1000).getTime()
		}))
	],
	files: mockFiles
};
ManyAnalyses.parameters = {
	docs: {
		description: {
			story: 'Batch export with many analyses demonstrating the scrollable table and "Select All" functionality.'
		}
	}
};

export const Empty = Template.bind({});
Empty.args = {
	analyses: [],
	files: []
};
Empty.parameters = {
	docs: {
		description: {
			story: 'Batch export panel when no analyses are available. Shows empty state message.'
		}
	}
};

export const SingleAnalysis = Template.bind({});
SingleAnalysis.args = {
	analyses: [mockAnalyses[0]],
	files: [mockFiles[0]]
};
SingleAnalysis.parameters = {
	docs: {
		description: {
			story: 'Batch export with only a single analysis available.'
		}
	}
};
