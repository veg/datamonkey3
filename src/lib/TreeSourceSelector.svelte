<!-- TreeSourceSelector.svelte - Tree source selection component with tree previews -->
<script>
	import { createEventDispatcher } from 'svelte';
	import { Upload, X, ChevronDown, ChevronUp } from '$lib/icons';
	import PhyloTree from './phylotree.svelte';
	import { trackEvent } from './utils/analytics.js';

	const dispatch = createEventDispatcher();

	// Props
	export let hasUploadedTree = false;
	export let hasInferredTree = true; // Whether NJ tree from alignment metrics exists
	export let treeSource = 'inferred'; // 'uploaded' | 'inferred' | 'upload-new'
	export let disabled = false;
	export let uploadedTreeNewick = ''; // Newick string for uploaded tree
	export let inferredTreeNewick = ''; // Newick string for NJ tree

	// File upload state
	let fileInput;
	let uploadedFile = null;
	let newUploadedNewick = ''; // Newick from newly uploaded file

	// Preview state
	let showUploadedPreview = false;
	let showInferredPreview = false;
	let showNewUploadPreview = false;

	// Status display - parameters are used for Svelte reactivity tracking
	const getStatusText = (_treeSource, _uploadedFile, _hasUploadedTree, _hasInferredTree) => {
		if (treeSource === 'uploaded' && hasUploadedTree) {
			return 'Using uploaded tree';
		} else if (treeSource === 'inferred' && hasInferredTree) {
			return 'Using neighbor-joining tree';
		} else if (treeSource === 'upload-new') {
			if (uploadedFile) {
				return `Using ${uploadedFile.name}`;
			}
			return 'Select tree file to upload';
		}
		return 'Select tree source';
	};

	// Event handlers
	function handleTreeSourceChange() {
		dispatch('treeSourceChange', {
			treeSource,
			hasUploadedTree,
			hasInferredTree,
			uploadedFile
		});
	}

	async function handleFileUpload() {
		const file = fileInput?.files?.[0];
		if (file) {
			uploadedFile = file;

			// Read the file content to get Newick string
			try {
				const content = await file.text();
				newUploadedNewick = content.trim();
			} catch (e) {
				console.error('Error reading tree file:', e);
				newUploadedNewick = '';
			}

			// Track tree upload
			trackEvent('tree-uploaded', { source: 'upload-new' });

			dispatch('fileUploaded', {
				file,
				treeSource: 'upload-new',
				newick: newUploadedNewick
			});
			handleTreeSourceChange();
		}
	}

	function clearUploadedFile() {
		uploadedFile = null;
		newUploadedNewick = '';
		showNewUploadPreview = false;
		if (fileInput) {
			fileInput.value = '';
		}
		handleTreeSourceChange();
	}

	function toggleUploadedPreview() {
		showUploadedPreview = !showUploadedPreview;
	}

	function toggleInferredPreview() {
		showInferredPreview = !showInferredPreview;
	}

	function toggleNewUploadPreview() {
		showNewUploadPreview = !showNewUploadPreview;
	}

	// Truncate Newick string for display
	function truncateNewick(newick, maxLength = 60) {
		if (!newick) return '';
		if (newick.length <= maxLength) return newick;
		return newick.substring(0, maxLength) + '...';
	}

	// Reactive statements
	$: statusText = getStatusText(treeSource, uploadedFile, hasUploadedTree, hasInferredTree);
</script>

<div class="tree-source-selector">
	<!-- Tree Source Selection Header -->
	<div class="tree-source-header">
		<div class="tree-source-title">
			<label class="source-label">Tree Source:</label>
			<div class="status-badge">
				<span class="status-content">
					{statusText}
				</span>
			</div>
		</div>
	</div>

	<!-- Tree Source Options -->
	<div class="tree-source-options">
		{#if hasUploadedTree}
			<div class="option-block">
				<label class="option-row">
					<input
						type="radio"
						bind:group={treeSource}
						value="uploaded"
						on:change={handleTreeSourceChange}
						{disabled}
						class="option-radio"
					/>
					<span class="option-content">
						<span class="option-text">Use uploaded tree</span>
					</span>
				</label>

				{#if uploadedTreeNewick}
					<div class="tree-preview-section">
						<button
							type="button"
							class="preview-toggle"
							on:click={toggleUploadedPreview}
						>
							{#if showUploadedPreview}
								<ChevronUp class="toggle-icon" />
								<span>Hide tree</span>
							{:else}
								<ChevronDown class="toggle-icon" />
								<span>Show tree</span>
							{/if}
						</button>

						{#if showUploadedPreview}
							<div class="tree-preview-container">
								<div class="newick-string">
									<span class="newick-label">Newick:</span>
									<code class="newick-code">{uploadedTreeNewick}</code>
								</div>
								<PhyloTree
									newickString={uploadedTreeNewick}
									height={250}
									width={400}
									selectable={false}
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<div class="option-block">
			<label class="option-row">
				<input
					type="radio"
					bind:group={treeSource}
					value="inferred"
					on:change={handleTreeSourceChange}
					disabled={!hasInferredTree || disabled}
					class="option-radio"
				/>
				<span class="option-content">
					<span class="option-text">Use neighbor-joining tree</span>
					<span class="option-hint">(Generated from alignment)</span>
				</span>
			</label>

			{#if inferredTreeNewick && hasInferredTree}
				<div class="tree-preview-section">
					<button
						type="button"
						class="preview-toggle"
						on:click={toggleInferredPreview}
					>
						{#if showInferredPreview}
							<ChevronUp class="toggle-icon" />
							<span>Hide tree</span>
						{:else}
							<ChevronDown class="toggle-icon" />
							<span>Show tree</span>
						{/if}
					</button>

					{#if showInferredPreview}
						<div class="tree-preview-container">
							<div class="newick-string">
								<span class="newick-label">Newick:</span>
								<code class="newick-code">{inferredTreeNewick}</code>
							</div>
							<PhyloTree
								newickString={inferredTreeNewick}
								height={250}
								width={400}
								selectable={false}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="option-block">
			<label class="option-row disabled">
				<input
					type="radio"
					bind:group={treeSource}
					value="upload-new"
					on:change={handleTreeSourceChange}
					disabled={true}
					class="option-radio"
				/>
				<span class="option-content">
					<span class="option-text">Upload a different tree</span>
					<span class="option-hint">(Not implemented yet)</span>
				</span>
			</label>
		</div>
	</div>

	<!-- File Upload Section (shown when upload-new is selected) -->
	{#if treeSource === 'upload-new'}
		<div class="upload-section">
			<div class="upload-area">
				<input
					type="file"
					bind:this={fileInput}
					on:change={handleFileUpload}
					accept=".nwk,.newick,.tre,.tree,.nh"
					{disabled}
					class="file-input"
					id="tree-file-input"
				/>
				<label for="tree-file-input" class="file-input-label" class:disabled>
					<Upload class="upload-icon" />
					{#if uploadedFile}
						<span class="file-name">{uploadedFile.name}</span>
						<span class="file-size">({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
					{:else}
						<span class="upload-text">Click to select tree file</span>
						<span class="upload-hint">Newick format (.nwk, .newick, .tre, .tree, .nh)</span>
					{/if}
				</label>

				{#if uploadedFile}
					<button
						type="button"
						on:click={clearUploadedFile}
						{disabled}
						class="clear-file-btn"
						title="Remove selected file"
					>
						<X class="clear-icon" />
					</button>
				{/if}
			</div>

			<!-- Preview for newly uploaded tree -->
			{#if newUploadedNewick}
				<div class="tree-preview-section">
					<button
						type="button"
						class="preview-toggle"
						on:click={toggleNewUploadPreview}
					>
						{#if showNewUploadPreview}
							<ChevronUp class="toggle-icon" />
							<span>Hide tree</span>
						{:else}
							<ChevronDown class="toggle-icon" />
							<span>Show tree</span>
						{/if}
					</button>

					{#if showNewUploadPreview}
						<div class="tree-preview-container">
							<div class="newick-string">
								<span class="newick-label">Newick:</span>
								<code class="newick-code">{newUploadedNewick}</code>
							</div>
							<PhyloTree
								newickString={newUploadedNewick}
								height={250}
								width={400}
								selectable={false}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tree-source-selector {
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		max-width: 500px;
	}

	.tree-source-header {
		margin-bottom: 16px;
	}

	.tree-source-title {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 8px;
	}

	.source-label {
		font-size: 14px;
		font-weight: 500;
		color: #374151;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		background: #f3f4f6;
		border-radius: 6px;
		font-size: 12px;
		color: #6b7280;
	}

	.status-content {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tree-source-options {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 20px;
	}

	.option-block {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.option-row {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		cursor: pointer;
	}

	.option-row.disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.option-radio {
		margin-top: 2px;
		width: 16px;
		height: 16px;
		accent-color: #3b82f6;
	}

	.option-radio:disabled {
		cursor: not-allowed;
	}

	.option-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.option-text {
		font-size: 14px;
		color: #374151;
		font-weight: 400;
	}

	.option-hint {
		font-size: 12px;
		color: #9ca3af;
		font-style: italic;
	}

	/* Tree Preview Styles */
	.tree-preview-section {
		margin-left: 28px;
		margin-top: 4px;
	}

	.preview-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: none;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		font-size: 12px;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.preview-toggle:hover {
		background: #f9fafb;
		border-color: #d1d5db;
		color: #374151;
	}

	:global(.toggle-icon) {
		width: 14px;
		height: 14px;
	}

	.tree-preview-container {
		margin-top: 8px;
		padding: 12px;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: auto;
		max-width: 100%;
	}

	.newick-string {
		margin-bottom: 12px;
		padding: 8px;
		background: #f3f4f6;
		border-radius: 4px;
		overflow-x: auto;
	}

	.newick-label {
		font-size: 11px;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		display: block;
		margin-bottom: 4px;
	}

	.newick-code {
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
		font-size: 11px;
		color: #374151;
		word-break: break-all;
		white-space: pre-wrap;
		display: block;
		max-height: 60px;
		overflow-y: auto;
	}

	/* Upload Section Styles */
	.upload-section {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid #e5e7eb;
	}

	.upload-area {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.file-input-label {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 20px;
		border: 2px dashed #d1d5db;
		border-radius: 8px;
		background: #f9fafb;
		cursor: pointer;
		transition: all 0.2s ease;
		min-height: 80px;
	}

	.file-input-label:hover:not(.disabled) {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.file-input-label.disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background: #f3f4f6;
	}

	:global(.upload-icon) {
		width: 24px;
		height: 24px;
		color: #6b7280;
		margin-bottom: 8px;
	}

	.file-input-label:hover:not(.disabled) :global(.upload-icon) {
		color: #3b82f6;
	}

	.upload-text {
		font-size: 14px;
		font-weight: 500;
		color: #374151;
		margin-bottom: 4px;
	}

	.upload-hint {
		font-size: 12px;
		color: #6b7280;
	}

	.file-name {
		font-size: 14px;
		font-weight: 500;
		color: #059669;
		margin-bottom: 2px;
	}

	.file-size {
		font-size: 12px;
		color: #6b7280;
	}

	.clear-file-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		background: white;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.clear-file-btn:hover:not(:disabled) {
		border-color: #ef4444;
		background: #fef2f2;
		color: #ef4444;
	}

	.clear-file-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	:global(.clear-icon) {
		width: 16px;
		height: 16px;
	}
</style>
