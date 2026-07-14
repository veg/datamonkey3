import IconPreviewComponent from './IconPreview.svelte';

export default {
	title: 'Design System/Icon Preview',
	component: IconPreviewComponent,
	parameters: {
		layout: 'fullscreen'
	}
};

const Template = (args) => ({
	Component: IconPreviewComponent,
	props: args
});

export const ProposedIcons = Template.bind({});
ProposedIcons.args = {};
