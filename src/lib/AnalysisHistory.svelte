<script>
	import { onMount } from 'svelte';
	import { analysisStore } from '../stores/analyses';
	import { persistentFileStore, currentFile } from '../stores/fileInfo';
	import { browser } from '$app/environment';
	import AnalysisCard from './AnalysisCard.svelte';
	import { Loader2, BadgeCheck } from 'lucide-svelte';
	import { trackEvent } from './utils/analytics.js';

	// Props
	export let onSelectAnalysis = (id) => {}; // Callback when analysis is selected
	export let filterByCurrentFile = false; // Whether to show only analyses for the current file
	export let compact = false; // Whether to use compact view
	export let redirectToResults = false; // Whether to redirect to Results tab when selecting an analysis

	// Define sortedAnalyses variable first
	let sortedAnalyses = [];

	// Store subscriptions - exclude datareader analyses as they're just file processing
	$: filteredAnalyses =
		filterByCurrentFile && $currentFile
			? $analysisStore.analyses.filter(
					(a) => a.fileId === $currentFile.id && a.method !== 'datareader'
				)
			: $analysisStore.analyses.filter((a) => a.method !== 'datareader');

	// Sort analyses by date (newest first)
	$: {
		console.log('AnalysisHistory: Got filteredAnalyses:', filteredAnalyses.length, 'analyses');
		sortedAnalyses = [...filteredAnalyses].sort((a, b) => b.createdAt - a.createdAt);
		console.log(
			'AnalysisHistory: Sorted analyses:',
			sortedAnalyses.map((a) => `${a.id} (${a.method})`)
		);
	}

	// Group analyses by file
	$: analysesGroupedByFile = sortedAnalyses.reduce((groups, analysis) => {
		const fileId = analysis.fileId;
		if (!groups[fileId]) {
			groups[fileId] = [];
		}
		groups[fileId].push(analysis);
		return groups;
	}, {});

	// Get file name from file ID
	function getFileName(fileId) {
		const file = $persistentFileStore.files.find((f) => f.id === fileId);
		return file ? file.filename : 'Unknown file';
	}

	// Delete an analysis
	async function deleteAnalysis(analysisId) {
		if (confirm('Are you sure you want to delete this analysis?')) {
			try {
				await analysisStore.deleteAnalysis(analysisId);
			} catch (error) {
				console.error('Error deleting analysis:', error);
			}
		}
	}

	// Handle card selection
	function handleSelect(event) {
		const { analysisId } = event.detail;
		onSelectAnalysis(analysisId);

		// If redirectToResults is true, switch to Results tab
		if (redirectToResults) {
			// Use custom event to communicate with parent
			dispatchEvent(
				new CustomEvent('switchTab', {
					detail: { tabName: 'results', analysisId },
					bubbles: true
				})
			);
		}
	}

	// Handle view action
	function handleView(event) {
		const { analysisId } = event.detail;
		onSelectAnalysis(analysisId);

		// If redirectToResults is true, switch to Results tab
		if (redirectToResults) {
			// Use custom event to communicate with parent
			dispatchEvent(
				new CustomEvent('switchTab', {
					detail: { tabName: 'results', analysisId },
					bubbles: true
				})
			);
		}
	}

	// Handle export action
	function handleExport(event) {
		const { analysisId } = event.detail;
		// Implement export functionality
	}

	// Handle cancel action
	async function handleCancel(event) {
		const { analysisId } = event.detail;
		if (confirm('Are you sure you want to cancel this analysis?')) {
			try {
				// Find the analysis to get method and progress for tracking
				const analysis = sortedAnalyses.find((a) => a.id === analysisId);

				await analysisStore.cancelAnalysis(analysisId);

				// Track analysis cancellation
				trackEvent('analysis-cancelled', {
					method: analysis?.method || 'unknown',
					progress: analysis?.progress || 0
				});
			} catch (error) {
				console.error('Error cancelling analysis:', error);
				alert('Failed to cancel analysis: ' + error.message);
			}
		}
	}

	// Handle delete action
	async function handleDelete(event) {
		const { analysisId } = event.detail;
		if (confirm('Are you sure you want to delete this analysis? This action cannot be undone.')) {
			try {
				// Find the analysis to get method for tracking
				const analysis = sortedAnalyses.find((a) => a.id === analysisId);

				await analysisStore.deleteAnalysis(analysisId);

				// Track analysis deletion
				trackEvent('analysis-deleted', {
					method: analysis?.method || 'unknown'
				});
			} catch (error) {
				console.error('Error deleting analysis:', error);
				alert('Failed to delete analysis: ' + error.message);
			}
		}
	}

	// Handle re-run action (for interrupted analyses)
	function handleRerun(event) {
		const { method, fileId } = event.detail;
		// Dispatch event to switch to Analyze tab with the method pre-selected
		dispatchEvent(
			new CustomEvent('switchTab', {
				detail: {
					tabName: 'analyze',
					method,
					fileId,
					rerun: true
				},
				bubbles: true
			})
		);
	}

	// Load analyses on mount
	onMount(async () => {
		if (browser) {
			try {
				await analysisStore.loadAnalyses();
			} catch (error) {
				console.error('Error loading analyses:', error);
			}
		}
	});
</script>

<div class="analysis-history">
	{#if $analysisStore.isLoading}
		<div class="flex items-center justify-center p-4">
			<Loader2 class="mr-2 h-4 w-4 animate-spin" />
			<span>Loading analyses...</span>
		</div>
	{:else if $analysisStore.error}
		<div class="rounded-xl border border-status-error-border bg-gradient-to-b from-red-50 to-white p-6 text-center text-status-error-text">
			<div class="mx-auto mb-4 h-24 w-24 overflow-hidden rounded-xl">
				<img
					src="/img/mascot-error.png"
					alt="Datamonkey mascot encountered an error"
					class="h-full w-auto opacity-60"
				/>
			</div>
			<p class="font-medium">Error: {$analysisStore.error}</p>
		</div>
	{:else if sortedAnalyses.length === 0}
		<div class="rounded-xl border border-border-subtle bg-gradient-to-b from-brand-whisper to-white p-6 text-center text-text-slate shadow-sm">
			<div class="flex flex-col items-center">
				<div class="mb-4 overflow-hidden rounded-xl">
					<img
						src="/img/mascot-waiting.png"
						alt="Datamonkey mascot"
						class="h-28 w-auto opacity-50 transition-opacity hover:opacity-70"
					/>
				</div>
				<p class="font-medium text-text-rich">
					No analyses found{filterByCurrentFile ? ' for the current file' : ''}.
				</p>
				<p class="mt-2 text-sm">Run an analysis method to see results here.</p>
			</div>
		</div>
	{:else}
		<div class="max-h-[500px] overflow-y-auto pr-1">
			{#if !filterByCurrentFile}
				<!-- Group by file when not filtering -->
				{#each Object.entries(analysesGroupedByFile) as [fileId, analyses]}
					<div class="mb-4">
						<h3 class="mb-2 bg-surface-sunken p-2 text-sm font-semibold text-text-rich">{getFileName(fileId)}</h3>
						<div class="analysis-cards">
							{#each analyses as analysis (analysis.id)}
								<AnalysisCard
									{analysis}
									{compact}
									selected={analysis.id === $analysisStore.currentAnalysisId}
									on:select={handleSelect}
									on:view={handleView}
									on:export={handleExport}
									on:cancel={handleCancel}
									on:delete={handleDelete}
									on:rerun={handleRerun}
								/>
							{/each}
						</div>
					</div>
				{/each}
			{:else}
				<!-- Simple list when filtering by current file -->
				<div class="analysis-cards">
					{#each sortedAnalyses as analysis (analysis.id)}
						<AnalysisCard
							{analysis}
							{compact}
							selected={analysis.id === $analysisStore.currentAnalysisId}
							on:select={handleSelect}
							on:view={handleView}
							on:export={handleExport}
							on:cancel={handleCancel}
							on:delete={handleDelete}
							on:rerun={handleRerun}
						/>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
