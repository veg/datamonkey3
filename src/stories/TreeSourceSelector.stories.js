import TreeSourceSelector from '../lib/TreeSourceSelector.svelte';

export default {
	title: 'Components/TreeSourceSelector',
	component: TreeSourceSelector,
	parameters: {
		docs: {
			description: {
				component:
					'A tree source selection component that allows users to choose between using an uploaded tree, the neighbor-joining tree from alignment metrics, or uploading a different tree. Includes expandable tree previews for each option.'
			}
		}
	},
	argTypes: {
		hasUploadedTree: {
			control: 'boolean',
			description: 'Whether an uploaded tree is available'
		},
		hasInferredTree: {
			control: 'boolean',
			description: 'Whether a neighbor-joining tree from alignment metrics is available'
		},
		treeSource: {
			control: 'radio',
			options: ['uploaded', 'inferred', 'upload-new'],
			description: 'Selected tree source'
		},
		disabled: {
			control: 'boolean',
			description: 'Whether the component is disabled'
		},
		uploadedTreeNewick: {
			control: 'text',
			description: 'Newick string for the uploaded tree'
		},
		inferredTreeNewick: {
			control: 'text',
			description: 'Newick string for the NJ tree'
		}
	}
};

// Sample Newick strings for demos
const sampleNJTree =
	'((((PIG:0.147969,COW:0.213430):0.085099,HORSE:0.165787,CAT:0.264806):0.058611,((RHMONKEY:0.002015,BABOON:0.003108):0.022733,(HUMAN:0.004349,CHIMP:0.000799):0.011873):0.101856):0.340802,RAT:0.050958,MOUSE:0.097950)';

const sampleUploadedTree =
	'((HUMAN:0.1,CHIMP:0.1):0.2,(GORILLA:0.15,(ORANGUTAN:0.2,GIBBON:0.25):0.1):0.05)';

const Template = (args) => ({
	Component: TreeSourceSelector,
	props: args,
	on: {
		treeSourceChange: (event) => {
			console.log('Tree source changed:', event.detail);
		},
		fileUploaded: (event) => {
			console.log('File uploaded:', event.detail);
		}
	}
});

// Default state with all options available and tree previews
export const Default = Template.bind({});
Default.args = {
	hasUploadedTree: true,
	hasInferredTree: true,
	treeSource: 'inferred',
	disabled: false,
	uploadedTreeNewick: sampleUploadedTree,
	inferredTreeNewick: sampleNJTree
};
Default.parameters = {
	docs: {
		description: {
			story: 'Default state with both tree sources available. Click "Show tree" to preview each tree.'
		}
	}
};

// No uploaded tree, only NJ tree from metrics
export const OnlyInferredTree = Template.bind({});
OnlyInferredTree.args = {
	hasUploadedTree: false,
	hasInferredTree: true,
	treeSource: 'inferred',
	disabled: false,
	uploadedTreeNewick: '',
	inferredTreeNewick: sampleNJTree
};
OnlyInferredTree.parameters = {
	docs: {
		description: {
			story: 'Only the neighbor-joining tree is available (common case when no tree was included in the alignment file).'
		}
	}
};

// User selected uploaded tree
export const UsingUploadedTree = Template.bind({});
UsingUploadedTree.args = {
	hasUploadedTree: true,
	hasInferredTree: true,
	treeSource: 'uploaded',
	disabled: false,
	uploadedTreeNewick: sampleUploadedTree,
	inferredTreeNewick: sampleNJTree
};
UsingUploadedTree.parameters = {
	docs: {
		description: {
			story: 'User has selected to use their uploaded tree instead of the inferred NJ tree.'
		}
	}
};

// User wants to upload a different tree
export const UploadDifferentTree = Template.bind({});
UploadDifferentTree.args = {
	hasUploadedTree: true,
	hasInferredTree: true,
	treeSource: 'upload-new',
	disabled: false,
	uploadedTreeNewick: sampleUploadedTree,
	inferredTreeNewick: sampleNJTree
};
UploadDifferentTree.parameters = {
	docs: {
		description: {
			story: 'User wants to upload a different tree file. The upload area is shown when this option is selected.'
		}
	}
};

// No inferred tree available (edge case)
export const NoInferredTree = Template.bind({});
NoInferredTree.args = {
	hasUploadedTree: true,
	hasInferredTree: false,
	treeSource: 'uploaded',
	disabled: false,
	uploadedTreeNewick: sampleUploadedTree,
	inferredTreeNewick: ''
};
NoInferredTree.parameters = {
	docs: {
		description: {
			story: 'Edge case where no NJ tree could be inferred. The inferred option is disabled.'
		}
	}
};

// Disabled state
export const Disabled = Template.bind({});
Disabled.args = {
	hasUploadedTree: true,
	hasInferredTree: true,
	treeSource: 'inferred',
	disabled: true,
	uploadedTreeNewick: sampleUploadedTree,
	inferredTreeNewick: sampleNJTree
};
Disabled.parameters = {
	docs: {
		description: {
			story: 'Component in disabled state - all inputs are non-interactive.'
		}
	}
};

// With larger tree
export const LargerTree = Template.bind({});
LargerTree.args = {
	hasUploadedTree: false,
	hasInferredTree: true,
	treeSource: 'inferred',
	disabled: false,
	uploadedTreeNewick: '',
	inferredTreeNewick:
		'(((((((COW:0.213430,PIG:0.147969):0.085099,HORSE:0.165787):0.058611,CAT:0.264806):0.049553,((RHMONKEY:0.002015,BABOON:0.003108):0.022733,(HUMAN:0.004349,CHIMP:0.000799):0.011873):0.101856):0.149582,RABBIT:0.206227):0.028276,(RAT:0.050958,MOUSE:0.097950):0.276411):0.044020,OPOSSUM:0.340802)'
};
LargerTree.parameters = {
	docs: {
		description: {
			story: 'Example with a larger tree to show how the preview handles more complex phylogenies.'
		}
	}
};
