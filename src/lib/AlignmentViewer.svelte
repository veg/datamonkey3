<script>
	import { AliVibe } from 'alivibe';
	import { onMount, tick } from 'svelte';
	import { treeStore } from '../stores/tree';
	import { alignmentFileStore } from '../stores/fileInfo';
	import { persistentFileStore } from '../stores/fileInfo';
	import { Save } from 'lucide-svelte';
	import { trackEvent } from './utils/analytics.js';

	export let alignmentFile = null;
	export let fileMetricsJSON = null;

	let alivibe;
	let mounted = false;
	let isLoading = false;
	let isSaving = false;
	let saveMessage = null;
	let error = null;

	$: if (alignmentFile && mounted) {
		loadAlignment();
	}

	async function loadAlignment() {
		if (!alignmentFile) return;

		trackEvent('alignment-viewer-opened');

		isLoading = true;
		error = null;

		try {
			await tick();
			const content = await alignmentFile.text();
			const fastaText = convertToFasta(content);

			if (alivibe) {
				alivibe.loadFasta(fastaText);

				// Load tree if available
				const trees = $treeStore;
				const newick = trees?.usertree || trees?.nj;
				if (newick) {
					alivibe.loadTree(newick);
				}
			}
		} catch (err) {
			console.error('Error loading alignment:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	async function saveEdits() {
		if (!alivibe || !alignmentFile) return;

		isSaving = true;
		saveMessage = null;

		try {
			const alignment = alivibe.getAlignment();
			if (!alignment || !alignment.length) {
				throw new Error('No alignment data to save');
			}

			// Build FASTA content
			const fastaContent = alignment
				.map(entry => `>${entry.name}\n${entry.seq}`)
				.join('\n') + '\n';

			// Create a new File object with the same name
			const filename = alignmentFile.name || 'alignment.fasta';
			const newFile = new File([fastaContent], filename, { type: 'text/plain' });

			// Update the persistent store (handles overwriting by name)
			await persistentFileStore.uploadFile(newFile);

			// Update the in-memory alignment file store
			alignmentFileStore.set(newFile);

			saveMessage = 'saved';
			setTimeout(() => { saveMessage = null; }, 2000);
		} catch (err) {
			console.error('Error saving alignment:', err);
			saveMessage = 'error';
			setTimeout(() => { saveMessage = null; }, 3000);
		} finally {
			isSaving = false;
		}
	}

	function stripAppendedTrees(fastaContent) {
		const lines = fastaContent.split('\n');
		const filtered = [];

		for (const line of lines) {
			const trimmed = line.trim();
			// Skip Newick tree lines (start with '(', contain ':' and ';')
			if (trimmed.startsWith('(') && trimmed.includes(':') && trimmed.includes(';')) {
				continue;
			}
			filtered.push(line);
		}

		return filtered.join('\n');
	}

	function convertToFasta(content) {
		const trimmed = content.trim();

		if (trimmed.toLowerCase().startsWith('#nexus')) {
			return nexusToFasta(trimmed);
		}

		if (trimmed.startsWith('>')) {
			return stripAppendedTrees(trimmed);
		}

		return trimmed;
	}

	function nexusToFasta(content) {
		const matrixMatch = content.match(/MATRIX\s*\n([\s\S]*?)\s*;/i);
		if (!matrixMatch) {
			throw new Error('Could not find MATRIX block in NEXUS file');
		}

		const lines = matrixMatch[1].split('\n');
		let fasta = '';

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine) continue;

			const parts = trimmedLine.split(/\s+/);
			if (parts.length >= 2) {
				const name = parts[0];
				const sequence = parts.slice(1).join('');
				fasta += `>${name}\n${sequence}\n`;
			}
		}

		return fasta;
	}

	onMount(() => {
		mounted = true;
	});
</script>

{#if isLoading}
	<div class="flex items-center justify-center p-8">
		<p class="text-sm text-text-silver">Loading alignment viewer...</p>
	</div>
{:else if error}
	<div class="p-4 text-sm text-red-600">
		Failed to load alignment: {error}
	</div>
{/if}

<div class="alivibe-container">
	<div class="save-bar">
		<button
			class="save-btn"
			on:click={saveEdits}
			disabled={isSaving || !alignmentFile}
			title="Save alignment edits back to file"
		>
			<Save size={14} />
			{#if isSaving}
				Saving...
			{:else if saveMessage === 'saved'}
				Saved
			{:else if saveMessage === 'error'}
				Save failed
			{:else}
				Save edits
			{/if}
		</button>
	</div>
	<AliVibe bind:this={alivibe} height="500px" features={{
		sequences: false,
		phylogeny: false,
		reset: false,
		history: false,
		export: false,
		viewMode: true,
		highlighter: true,
		alignment: true,
		frame: true,
		info: true
	}} />
	<div class="attribution">
		Alignment viewer powered by <a href="https://murrellgroup.github.io/WebWidgets/alivibe.html" target="_blank" rel="noopener noreferrer">AlIViBE</a> from the <a href="https://github.com/MurrellGroup" target="_blank" rel="noopener noreferrer">Murrell Group</a> (<a href="https://github.com/MurrellGroup/WebWidgets" target="_blank" rel="noopener noreferrer">source</a>)
	</div>
</div>

<style>
	.alivibe-container {
		width: 100%;
		overflow: hidden;
	}

	.save-bar {
		display: flex;
		justify-content: flex-end;
		padding: 6px 12px;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		cursor: pointer;
	}

	.save-btn:hover:not(:disabled) {
		background: #f3f4f6;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.attribution {
		padding: 6px 12px;
		font-size: 11px;
		color: #9ca3af;
		text-align: right;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.attribution a {
		color: #6b7280;
		text-decoration: underline;
		text-decoration-color: #d1d5db;
	}

	.attribution a:hover {
		color: #374151;
	}
</style>
