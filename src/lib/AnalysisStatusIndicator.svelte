<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { analysisStore, activeAnalyses } from '../stores/analyses';
	import { goto } from '$app/navigation';
	import { CheckCircle2, AlertTriangle, Pause, Zap, Loader2, RefreshCw } from '$lib/icons';

	// Load analyses on mount to ensure indicator has correct data
	// This is necessary because the layout mounts before the page
	onMount(async () => {
		if (browser) {
			await analysisStore.loadAnalyses();
		}
	});

	// Function to navigate to the Results tab when clicked
	function navigateToResults() {
		goto('/?tab=results');
	}

	// Get today's date at midnight for filtering completed analyses
	// Using a function so it can be recalculated if needed
	function getTodayStart() {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return today;
	}

	// Use Set-based deduplication to correctly count analyses that may appear in both arrays
	// This prevents double-counting and ensures accurate status tracking
	$: runningCount = (() => {
		const runningIds = new Set();

		// Add running analyses from main analyses array (exclude interrupted)
		$analysisStore.analyses
			.filter(
				(a) =>
					!['completed', 'error', 'cancelled', 'interrupted'].includes(a.status) &&
					a.method !== 'datareader'
			)
			.forEach((a) => runningIds.add(a.id));

		// Add running analyses from active analyses array (may overlap with main)
		$activeAnalyses
			.filter((a) => !['completed', 'error', 'interrupted'].includes(a.status) && a.method !== 'datareader')
			.forEach((a) => runningIds.add(a.id));

		return runningIds.size;
	})();

	$: completedCount = (() => {
		const todayStart = getTodayStart();
		// Count completed analyses from today only
		return $analysisStore.analyses.filter(
			(a) =>
				a.status === 'completed' &&
				a.completedAt &&
				new Date(a.completedAt) >= todayStart &&
				a.method !== 'datareader'
		).length;
	})();

	$: failedCount = (() => {
		const failedIds = new Set();

		// Add failed analyses from main analyses array
		$analysisStore.analyses
			.filter((a) => a.status === 'error' && a.method !== 'datareader')
			.forEach((a) => failedIds.add(a.id));

		// Add failed analyses from active analyses array (may overlap with main)
		$activeAnalyses
			.filter((a) => a.status === 'error' && a.method !== 'datareader')
			.forEach((a) => failedIds.add(a.id));

		return failedIds.size;
	})();

	// Count interrupted analyses (WASM analyses that were terminated by page refresh)
	$: interruptedCount = $analysisStore.analyses.filter(
		(a) => a.status === 'interrupted' && a.method !== 'datareader'
	).length;

	// Count reconnecting analyses (backend analyses attempting to reconnect)
	$: reconnectingCount = $analysisStore.analyses.filter(
		(a) => a.status === 'reconnecting' && a.method !== 'datareader'
	).length;

	// Count connection_lost analyses (backend analyses that could not reconnect)
	$: connectionLostCount = $analysisStore.analyses.filter(
		(a) => a.status === 'connection_lost' && a.method !== 'datareader'
	).length;

	// Only show indicator if there are any analyses to display
	$: showIndicator = runningCount > 0 || completedCount > 0 || failedCount > 0 || interruptedCount > 0 || reconnectingCount > 0 || connectionLostCount > 0;

	// Debug logging when counts change
	$: if (runningCount > 0 || completedCount > 0 || failedCount > 0 || interruptedCount > 0 || reconnectingCount > 0 || connectionLostCount > 0) {
		console.log(`📊 [StatusIndicator] running=${runningCount} completed=${completedCount} failed=${failedCount} interrupted=${interruptedCount} reconnecting=${reconnectingCount} connectionLost=${connectionLostCount} (analyses=${$analysisStore.analyses.length}, active=${$activeAnalyses.length})`);
	}
</script>

{#if showIndicator}
	<button
		class="flex items-center space-x-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm transition-shadow duration-200 hover:shadow-md"
		on:click={navigateToResults}
		aria-label="View all analyses"
	>
		{#if runningCount > 0}
			<div class="flex items-center">
				<span class="inline-flex items-center justify-center text-sm">
					<Loader2 class="mr-1 h-4 w-4 animate-spin text-blue-500" />
					<span class="font-medium text-blue-600">{runningCount}</span>
				</span>
			</div>
		{/if}

		{#if completedCount > 0}
			<div class="flex items-center">
				{#if runningCount > 0}
					<span class="mx-1.5 text-gray-300">•</span>
				{/if}
				<span class="inline-flex items-center justify-center text-sm">
					<CheckCircle2 class="mr-1 h-4 w-4 text-green-500" />
					<span class="font-medium text-green-600">{completedCount}</span>
				</span>
			</div>
		{/if}

		{#if failedCount > 0}
			<div class="flex items-center">
				{#if runningCount > 0 || completedCount > 0}
					<span class="mx-1.5 text-gray-300">•</span>
				{/if}
				<span class="inline-flex items-center justify-center text-sm">
					<AlertTriangle class="mr-1 h-4 w-4 text-red-500" />
					<span class="font-medium text-red-600">{failedCount}</span>
				</span>
			</div>
		{/if}

		{#if interruptedCount > 0}
			<div class="flex items-center">
				{#if runningCount > 0 || completedCount > 0 || failedCount > 0}
					<span class="mx-1.5 text-gray-300">•</span>
				{/if}
				<span class="inline-flex items-center justify-center text-sm">
					<Pause class="mr-1 h-4 w-4 text-orange-500" />
					<span class="font-medium text-orange-600">{interruptedCount}</span>
				</span>
			</div>
		{/if}

		{#if reconnectingCount > 0}
			<div class="flex items-center">
				{#if runningCount > 0 || completedCount > 0 || failedCount > 0 || interruptedCount > 0}
					<span class="mx-1.5 text-gray-300">•</span>
				{/if}
				<span class="inline-flex items-center justify-center text-sm">
					<RefreshCw class="mr-1 h-4 w-4 animate-spin text-blue-400" />
					<span class="font-medium text-blue-600">{reconnectingCount}</span>
				</span>
			</div>
		{/if}

		{#if connectionLostCount > 0}
			<div class="flex items-center">
				{#if runningCount > 0 || completedCount > 0 || failedCount > 0 || interruptedCount > 0 || reconnectingCount > 0}
					<span class="mx-1.5 text-gray-300">•</span>
				{/if}
				<span class="inline-flex items-center justify-center text-sm">
					<Zap class="mr-1 h-4 w-4 text-amber-500" />
					<span class="font-medium text-amber-600">{connectionLostCount}</span>
				</span>
			</div>
		{/if}
	</button>
{/if}

