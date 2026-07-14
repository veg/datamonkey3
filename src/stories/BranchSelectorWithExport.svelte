<script>
	import BranchSelector from '../lib/BranchSelector.svelte';

	// Props passed through to BranchSelector
	export let treeData = '';
	export let height = 400;
	export let width = 800;
	export let mode = 'multi-set';
	export let selectionMode = 'foreground';
	export let initialSetNames = null;
	export let selectedBranches = [];
	export let allowMultiSelect = true;
	export let disabled = false;

	// Export state
	let taggedNewick = '';
	let selectionSets = [];
	let selectedCount = 0;

	function handleSelectionChange(event) {
		taggedNewick = event.detail.taggedNewick || '';
		selectionSets = event.detail.selectionSets || [];
		selectedCount = event.detail.count || 0;

		console.log('Selection changed:', {
			count: selectedCount,
			sets: selectionSets,
			taggedNewick: taggedNewick
		});
	}

	function copyToClipboard() {
		navigator.clipboard.writeText(taggedNewick);
	}
</script>

<div class="wrapper">
	<BranchSelector
		{treeData}
		{height}
		{width}
		{mode}
		{selectionMode}
		{initialSetNames}
		{selectedBranches}
		{allowMultiSelect}
		{disabled}
		on:selectionChange={handleSelectionChange}
	/>

	<div class="export-panel">
		<h4>Tagged Newick Export</h4>
		<p class="info">Selected branches: {selectedCount}</p>
		{#if selectionSets.length > 0}
			<p class="info">Sets: {selectionSets.join(', ')}</p>
		{/if}
		<textarea
			readonly
			value={taggedNewick}
			placeholder="Select branches to see the tagged Newick string..."
		></textarea>
		<button on:click={copyToClipboard}>
			Copy to Clipboard
		</button>
	</div>
</div>

<style>
	.wrapper {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.export-panel {
		background: #f5f5f5;
		padding: 1rem;
		border-radius: 8px;
		font-family: monospace;
	}

	.export-panel h4 {
		margin: 0 0 0.5rem 0;
	}

	.info {
		margin: 0.25rem 0;
		color: #666;
		font-size: 14px;
	}

	textarea {
		width: 100%;
		height: 120px;
		font-family: monospace;
		font-size: 12px;
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		resize: vertical;
		box-sizing: border-box;
	}

	button {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		background: #4CAF50;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	button:hover {
		background: #45a049;
	}
</style>
