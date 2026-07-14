<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { writable } from 'svelte/store';
	import AnalysisCard from '../lib/AnalysisCard.svelte';
	import { AlertTriangle, FileText } from 'lucide-svelte';

	// Accept mocked stores as props for Storybook
	export let mockAnalysisStore = null;
	export let mockPersistentFileStore = null;
	export let mockCurrentFile = null;

	// Props (same as original component)
	export let onSelectAnalysis = (id) => {}; // Callback when analysis is selected
	export let filterByCurrentFile = false; // Whether to show only analyses for the current file
	export let compact = false; // Whether to use compact view
	export let redirectToResults = false; // Whether to redirect to Results tab when selecting an analysis

	// Use mocked stores if provided, otherwise create defaults
	const defaultAnalysisStore = writable({
		analyses: [],
		isLoading: false,
		error: null,
		currentAnalysisId: null
	});
	const defaultPersistentFileStore = writable({ files: [] });
	const defaultCurrentFile = writable(null);

	const analysisStore = mockAnalysisStore || defaultAnalysisStore;
	const persistentFileStore = mockPersistentFileStore || defaultPersistentFileStore;
	const currentFile = mockCurrentFile || defaultCurrentFile;

	// Define sortedAnalyses variable first
	let sortedAnalyses = [];

	// Store subscriptions - exclude datareader analyses as they're just file processing
	$: filteredAnalyses =
		filterByCurrentFile && $currentFile
			? $analysisStore.analyses.filter(
					(analysis) => analysis.fileId === $currentFile.id && analysis.method !== 'datareader'
				)
			: $analysisStore.analyses.filter((analysis) => analysis.method !== 'datareader');

	// Sort analyses by creation date (most recent first)
	$: sortedAnalyses = filteredAnalyses.sort((a, b) => {
		const aTime = a.createdAt || 0;
		const bTime = b.createdAt || 0;
		return bTime - aTime;
	});

	// Function to get filename for an analysis
	function getFilenameForAnalysis(fileId) {
		if (!$persistentFileStore?.files) return 'Unknown file';
		const file = $persistentFileStore.files.find((f) => f.id === fileId);
		return file ? file.filename || file.name || 'Unknown file' : 'Unknown file';
	}

	// Function to handle analysis selection
	function handleSelectAnalysis(id) {
		console.log('Analysis selected:', id);
		onSelectAnalysis(id);

		if (redirectToResults && browser) {
			// Navigate to results tab
			const event = new CustomEvent('navigate-to-results', {
				detail: { analysisId: id }
			});
			window.dispatchEvent(event);
		}
	}
</script>

<div class="analysis-history">
	{#if $analysisStore.isLoading}
		<div class="loading-state p-8 text-center">
			<div class="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
			<p class="mt-4 text-gray-600">Loading analysis history...</p>
		</div>
	{:else if $analysisStore.error}
		<div class="error-state p-8 text-center">
			<div class="mb-4 text-red-600">
				<AlertTriangle class="mx-auto h-12 w-12" />
			</div>
			<h3 class="mb-2 text-lg font-medium text-gray-900">Error Loading Analysis History</h3>
			<p class="text-gray-600">{$analysisStore.error}</p>
		</div>
	{:else if sortedAnalyses.length === 0}
		<div class="empty-state p-8 text-center">
			<div class="mb-4 text-gray-400">
				<FileText class="mx-auto h-12 w-12" />
			</div>
			<h3 class="mb-2 text-lg font-medium text-gray-900">No Analysis History</h3>
			<p class="text-gray-600">
				{filterByCurrentFile && $currentFile
					? 'No analyses found for the current file.'
					: 'No analyses have been run yet.'}
			</p>
		</div>
	{:else}
		<div class="analyses-list space-y-4">
			{#each sortedAnalyses as analysis (analysis.id)}
				<AnalysisCard
					{analysis}
					filename={getFilenameForAnalysis(analysis.fileId)}
					{compact}
					onSelect={() => handleSelectAnalysis(analysis.id)}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.analysis-history {
		width: 100%;
	}

	.loading-state,
	.error-state,
	.empty-state {
		min-height: 200px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.analyses-list {
		padding: 0;
	}
</style>
