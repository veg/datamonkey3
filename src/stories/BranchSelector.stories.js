import BranchSelector from '../lib/BranchSelector.svelte';
import BranchSelectorWithExport from './BranchSelectorWithExport.svelte';

export default {
	title: 'Components/BranchSelector',
	component: BranchSelector,
	parameters: {
		docs: {
			description: {
				component:
					'Interactive phylogenetic tree with branch selection capabilities for analysis methods like FEL, SLAC, Contrast-FEL, and RELAX'
			}
		}
	},
	argTypes: {
		treeData: {
			control: 'text',
			description: 'Newick format phylogenetic tree data'
		},
		selectedBranches: {
			control: 'object',
			description: 'Array of branch names or objects with name/id for initial selection'
		},
		selectionMode: {
			control: { type: 'select' },
			options: ['foreground', 'background'],
			description: 'Type of branch selection (maps to single-set mode internally)'
		},
		mode: {
			control: { type: 'select' },
			options: ['single-set', 'multi-set'],
			description: 'Selection mode: single-set for FG/BG, multi-set for Contrast-FEL/RELAX'
		},
		allowMultiSelect: {
			control: 'boolean',
			description: 'Allow multiple branch selection (single-set mode only)'
		},
		disabled: {
			control: 'boolean',
			description: 'Disable all interactions'
		},
		height: {
			control: { type: 'range', min: 200, max: 800, step: 50 },
			description: 'Height of the tree container in pixels'
		},
		width: {
			control: { type: 'range', min: 400, max: 1200, step: 50 },
			description: 'Width of the tree container in pixels'
		},
		initialSetNames: {
			control: 'object',
			description: 'Custom set names for multi-set mode (e.g., ["TEST", "REFERENCE"] for RELAX)'
		}
	}
};

// Sample tree data for testing (using same data as phylotree stories)
const sampleTreeData =
	'((((PIG:0.147969,COW:0.213430):0.085099,HORSE:0.165787,CAT:0.264806):0.058611,((RHMONKEY{PR}:0.002015,BABOON{PR}:0.003108){PR}:0.022733,(HUMAN{PR}:0.004349,CHIMP{PR}:0.000799){PR}:0.011873){PR}:0.101856){PR}:0.340802,RAT:0.050958,MOUSE:0.097950)';

const largerTreeData =
	'((((((HUMAN:0.043371,CHIMP:0.043371):0.007073,(BABOON:0.036079,GREEN_MONKEY:0.036079):0.014365):0.012251,((RAT:0.081244,MOUSE:0.081244):0.072733,RABBIT:0.153977):0.008799):0.028456,(COW:0.162525,(HORSE:0.109852,CAT:0.109852):0.052673):0.028707):0.021592,((CARP:0.190394,LOACH:0.190394):0.156348,FLY:0.346742):0.017283):0.0003,YEAST:0.364025);';

// Template function
const Template = (args) => ({
	Component: BranchSelector,
	props: args,
	on: {
		selectionChange: (event) => {
			console.log('Selection changed:', event.detail);
		},
		error: (event) => {
			console.error('Tree error:', event.detail);
		}
	}
});

// Default story
export const Default = Template.bind({});
Default.args = {
	treeData: sampleTreeData,
	selectedBranches: [],
	selectionMode: 'foreground',
	mode: 'single-set',
	allowMultiSelect: true,
	disabled: false,
	height: 400,
	width: 800
};

// With preselected branches (using actual node names from tree)
export const WithPreselection = Template.bind({});
WithPreselection.args = {
	...Default.args,
	selectedBranches: ['HUMAN', 'CHIMP', 'BABOON']
};

// Background selection mode
export const BackgroundMode = Template.bind({});
BackgroundMode.args = {
	...Default.args,
	selectionMode: 'background'
};

// Multi-set mode (for Contrast-FEL)
export const MultiSetMode = Template.bind({});
MultiSetMode.args = {
	...Default.args,
	mode: 'multi-set',
	initialSetNames: null // Will default to Set_1, Set_2
};

// RELAX mode with TEST/REFERENCE sets
export const RelaxMode = Template.bind({});
RelaxMode.args = {
	...Default.args,
	mode: 'multi-set',
	initialSetNames: ['TEST', 'REFERENCE']
};

// Larger tree
export const LargerTree = Template.bind({});
LargerTree.args = {
	...Default.args,
	treeData: largerTreeData,
	height: 500
};

// Disabled state
export const Disabled = Template.bind({});
Disabled.args = {
	...Default.args,
	disabled: true,
	selectedBranches: ['HUMAN', 'CHIMP']
};

// No tree data
export const NoTreeData = Template.bind({});
NoTreeData.args = {
	...Default.args,
	treeData: ''
};

// Compact height
export const CompactHeight = Template.bind({});
CompactHeight.args = {
	...Default.args,
	height: 250
};

// Tall layout
export const TallLayout = Template.bind({});
TallLayout.args = {
	...Default.args,
	treeData: largerTreeData,
	height: 600
};

// Single selection mode (custom implementation)
export const SingleSelection = Template.bind({});
SingleSelection.args = {
	...Default.args,
	allowMultiSelect: false
};

// Interactive demo with event logging
export const InteractiveDemo = {
	render: (args) => ({
		Component: BranchSelector,
		props: args,
		on: {
			selectionChange: (event) => {
				console.log('Demo - Selection changed:', {
					count: event.detail.count,
					selectedBranches: event.detail.selectedBranches,
					taggedNewick: event.detail.taggedNewick?.substring(0, 100) + '...'
				});
			},
			error: (event) => {
				console.error('Demo - Tree error:', event.detail);
			}
		}
	}),
	args: {
		...Default.args,
		selectionMode: 'foreground',
		height: 450
	}
};

// Multi-set mode with visible Newick export
const ExportTemplate = (args) => ({
	Component: BranchSelectorWithExport,
	props: args
});

export const MultiSetWithExport = ExportTemplate.bind({});
MultiSetWithExport.args = {
	...Default.args,
	mode: 'multi-set',
	height: 400
};
MultiSetWithExport.parameters = {
	docs: {
		description: {
			story: 'Multi-set mode with a visible export panel showing the tagged Newick string. Use this to verify that set tags are properly applied to selected branches.'
		}
	}
};

// RELAX mode with export
export const RelaxModeWithExport = ExportTemplate.bind({});
RelaxModeWithExport.args = {
	...Default.args,
	mode: 'multi-set',
	initialSetNames: ['TEST', 'REFERENCE'],
	height: 400
};
RelaxModeWithExport.parameters = {
	docs: {
		description: {
			story: 'RELAX analysis mode with TEST/REFERENCE sets and visible Newick export.'
		}
	}
};
