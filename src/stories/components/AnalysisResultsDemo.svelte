<script>
	import {
		FelVisualization,
		SimpleFelVisualization,
		MemeVisualization,
		AbsrelVisualization,
		BustedVisualization,
		RelaxVisualization,
		SlacVisualization,
		BgmVisualization,
		FadeVisualization,
		GardVisualization
	} from 'hyphy-scope';
	import DataReaderResults from '$lib/dataReaderResults.svelte';

	export let analysis = {};
	export let file = {};
	export let resultData = {};
	export let loading = false;
	export let error = null;

	// Format date for display
	function formatDate(timestamp) {
		return new Date(timestamp).toLocaleString();
	}

	// Get the appropriate visualization component based on method
	function getVisualizationComponent(method) {
		const methodLower = method.toLowerCase();
		switch (methodLower) {
			case 'fel':
				return FelVisualization;
			case 'meme':
				return MemeVisualization;
			case 'absrel':
			case 'abserel':
				return AbsrelVisualization;
			case 'busted':
				return BustedVisualization;
			case 'relax':
				return RelaxVisualization;
			case 'slac':
				return SlacVisualization;
			case 'bgm':
				return BgmVisualization;
			case 'fade':
				return FadeVisualization;
			case 'gard':
				return GardVisualization;
			default:
				return null;
		}
	}

	$: visualizationComponent = analysis.method ? getVisualizationComponent(analysis.method) : null;
</script>

<div class="analysis-viewer">
	{#if loading}
		<div class="flex flex-col items-center justify-center p-8">
			<div class="loader mb-4"></div>
			<p>Loading analysis results...</p>
		</div>
	{:else if error}
		<div class="error-container p-4 text-red-500">
			<h3 class="font-bold">Error</h3>
			<p>{error}</p>
		</div>
	{:else if analysis && file}
		<div class="analysis-container">
			<div class="bg-gray-100 p-4">
				<div class="flex items-center justify-between">
					<h2 class="text-xl font-bold">{analysis.method.toUpperCase()} Analysis</h2>
				</div>
				<div class="text-sm text-gray-600">
					<p>File: {file.filename}</p>
					<p>
						Status:
						<span
							class="font-semibold capitalize {analysis.status === 'completed'
								? 'text-green-600'
								: analysis.status === 'pending'
									? 'text-yellow-600'
									: 'text-gray-600'}"
						>
							{analysis.status === 'completed' ? 'Completed' : analysis.status}
						</span>
					</p>
					<p>Created: {formatDate(analysis.createdAt)}</p>
					{#if analysis.completedAt}
						<p>Completed: {formatDate(analysis.completedAt)}</p>
					{/if}
				</div>
			</div>

			<div class="result-content p-4">
				{#if analysis.status === 'completed' && resultData}
					<!-- HyPhy-Scope visualization for supported methods -->
					{#if visualizationComponent}
						<div class="hyphy-scope-container mb-4">
							<svelte:component this={visualizationComponent} data={resultData} />
						</div>
					{/if}

					<!-- Fallback display for methods not fully supported by hyphy-scope -->
					{#if analysis.method === 'datareader'}
						<DataReaderResults fileMetricsJSON={resultData} />
					{:else if !visualizationComponent}
						<!-- Generic JSON display for unsupported methods -->
						<div class="json-display">
							<h3 class="mb-2 text-lg font-bold">Analysis Results</h3>
							<pre class="max-h-96 overflow-auto bg-gray-100 p-2 text-sm">{JSON.stringify(
									resultData,
									null,
									2
								)}</pre>
						</div>
					{/if}
				{:else if ['pending', 'running', 'mounting', 'processing', 'saving'].includes(analysis.status)}
					<div class="flex flex-col items-center justify-center p-8">
						<div class="loader mb-4"></div>
						<p>Analysis is {analysis.status}...</p>
					</div>
				{:else}
					<p class="text-gray-600">No results available</p>
				{/if}
			</div>
		</div>
	{:else}
		<p class="p-4 text-gray-500">Select an analysis to view results</p>
	{/if}
</div>

<style>
	.loader {
		border: 8px solid #f3f3f3;
		border-top: 8px solid #3498db;
		border-radius: 50%;
		width: 50px;
		height: 50px;
		animation: spin 2s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.hyphy-scope-container {
		min-height: 400px;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		background: white;
		position: relative;
	}
</style>
