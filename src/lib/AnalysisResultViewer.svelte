<script>
	import { onMount } from 'svelte';
	import { analysisStore } from '../stores/analyses';
	import { persistentFileStore } from '../stores/fileInfo';
	import ExportPanel from './ExportPanel.svelte';
	import FelVisualization from './FelVisualization.svelte';
	import AxomemeResults from './AxomemeResults.svelte';
	import AnalysisProgress from './AnalysisProgress.svelte';
	import { FINAL_HYPHY_EYE_URL } from './config/env';
	import {
		shareWithHyphyEye,
		isMethodSupported,
		getHyphyEyeUrl
	} from './utils/hyphyEyeIntegration';
	import { safeParseJSON } from './utils/jsonUtils';
	import {
		FelVisualization as HyphyScopeFel,
		SimpleFelVisualization,
		MemeVisualization,
		BustedVisualization,
		RelaxVisualization,
		SlacVisualization,
		BgmVisualization,
		FadeVisualization,
		GardVisualization,
		FubarVisualization,
		PrimeVisualization
	} from 'hyphy-scope';
	import AbsrelVisualizationWrapper from './AbsrelVisualizationWrapper.svelte';
	import FubarVisualizationWrapper from './FubarVisualizationWrapper.svelte';
	import MultiHitVisualizationWrapper from './MultiHitVisualizationWrapper.svelte';
	import { Server, Monitor, ExternalLink } from 'lucide-svelte';

	export let analysisId = null;

	let analysis = null;
	let file = null;
	let resultData = null;
	let loading = true;
	let error = null;

	$: if (analysisId) {
		loadAnalysis(analysisId);
	}

	async function loadAnalysis(id) {
		loading = true;
		error = null;

		try {
			// Get analysis from local IndexedDB storage
			analysis = await analysisStore.getAnalysis(id);

			if (!analysis) {
				error = 'Analysis not found';
				loading = false;
				return;
			}

			// If analysis doesn't have metadata, try to get it from activeAnalysesList
			if (!analysis.metadata && $analysisStore.activeAnalysesList) {
				const activeAnalysis = $analysisStore.activeAnalysesList.find((a) => a.id === id);
				if (activeAnalysis && activeAnalysis.metadata) {
					analysis = { ...analysis, metadata: activeAnalysis.metadata };
				}
			}

			// Get file metadata
			file = $persistentFileStore.files.find((f) => f.id === analysis.fileId);

			if (!file) {
				error = 'Associated file not found';
				loading = false;
				return;
			}

			// Parse result data if available
			if (analysis.result) {
				try {
					// Check if result is already an object (from backend) or needs parsing (from WebAssembly)
					if (typeof analysis.result === 'string') {
						resultData = safeParseJSON(analysis.result);
					} else {
						// Already parsed object from backend
						resultData = analysis.result;
					}
				} catch (e) {
					console.error('Error parsing analysis result:', e);
					console.log('Result type:', typeof analysis.result);
					console.log('Result preview:', analysis.result);
					resultData = { error: 'Invalid result format' };
				}
			} else {
				// DEBUG: Log when result is missing
				console.warn('Analysis has no result data:', {
					id: analysis.id,
					status: analysis.status,
					method: analysis.method,
					completedAt: analysis.completedAt,
					hasResult: !!analysis.result
				});
			}
		} catch (e) {
			console.error('Error loading analysis:', e);
			error = e.message || 'Error loading analysis';
		} finally {
			loading = false;
		}
	}

	// Format date for display
	function formatDate(timestamp) {
		return new Date(timestamp).toLocaleString();
	}

	// Get the appropriate hyphy-scope visualization component based on method
	function getHyphyScopeVisualization(method) {
		const methodLower = method.toLowerCase();
		switch (methodLower) {
			case 'fel':
			case 'contrast-fel':
				return HyphyScopeFel;
			case 'axomeme':
				// Not a hyphy-scope visualiser — AxoMEME emits per-site predictions rather than a HyPhy
				// results document — but it renders through the same slot, which takes any component
				// accepting `data`.
				return AxomemeResults;
			case 'meme':
				return MemeVisualization;
			case 'absrel':
			case 'abserel':
				return AbsrelVisualizationWrapper;
			case 'busted':
				return BustedVisualization;
			case 'relax':
				return RelaxVisualization;
			case 'slac':
				return SlacVisualization;
			case 'fubar':
			case 'b-still':
			case 'bstill':
				return FubarVisualizationWrapper;
			case 'bgm':
				return BgmVisualization;
			case 'fade':
				return FadeVisualization;
			case 'gard':
				return GardVisualization;
			case 'multi-hit':
			case 'multihit':
				return MultiHitVisualizationWrapper;
			case 'nrm':
				// NRM doesn't have a hyphy-scope visualization yet - will fall back to raw results
				return null;
			case 'prime':
				return PrimeVisualization;
			default:
				return null;
		}
	}

	$: hyphyScopeComponent = analysis?.method ? getHyphyScopeVisualization(analysis.method) : null;

	// Subscribe to store changes to auto-update when analysis status changes
	$: if (analysisId && $analysisStore.analyses) {
		// Find the current analysis in the store
		const storeAnalysis = $analysisStore.analyses.find((a) => a.id === analysisId);
		if (
			storeAnalysis &&
			(!analysis ||
				storeAnalysis.status !== analysis.status ||
				storeAnalysis.completedAt !== analysis.completedAt)
		) {
			// Analysis has been updated in the store, reload it
			loadAnalysis(analysisId);
		}
	}

	onMount(() => {
		if (analysisId) {
			loadAnalysis(analysisId);
		}
	});
</script>

<div class="analysis-viewer" data-testid="analysis-viewer">
	{#if loading}
		<div class="flex flex-col items-center justify-center p-8">
			<div class="loader mb-4"></div>
			<p>Loading analysis results...</p>
		</div>
	{:else if error}
		<div
			class="error-container flex flex-col items-center rounded-2xl bg-gradient-to-b from-red-50 to-white p-8 text-center"
		>
			<div class="mb-5 overflow-hidden rounded-xl shadow-sm">
				<img
					src="/img/mascot-error.png"
					alt="Datamonkey mascot encountered an error"
					class="h-36 w-auto opacity-60"
				/>
			</div>
			<h3 class="mb-2 text-lg font-semibold text-text-rich">Something went wrong</h3>
			<p class="max-w-md text-status-error-text">{error}</p>
		</div>
	{:else if analysis && file}
		<div class="analysis-container">
			<!-- Export panel with options -->
			<ExportPanel {analysisId} />

			<div class="bg-surface-sunken p-4">
				<div class="flex items-center justify-between">
					<h2 class="text-xl font-bold text-text-rich">{analysis.method.toUpperCase()} Analysis</h2>
				</div>
				<div class="text-sm text-text-slate">
					<p>File: {file.filename}</p>
					<p>
						Status:
						<span
							class="font-semibold capitalize {analysis.status === 'completed'
								? 'text-status-success'
								: analysis.status === 'pending'
									? 'text-status-warning'
									: 'text-text-slate'}"
						>
							{analysis.status === 'completed' ? 'Completed' : analysis.status}
						</span>
					</p>
					<p>
						Execution:
						<span class="font-medium">
							{#if analysis.metadata?.executionMode === 'backend'}
								<span class="inline-flex items-center text-status-info">
									<Server class="mr-1 h-3 w-3" />
									Server
								</span>
							{:else if analysis.metadata?.executionMode === 'wasm'}
								<span class="inline-flex items-center text-brand-royal">
									<Monitor class="mr-1 h-3 w-3" />
									Local (WebAssembly)
								</span>
							{:else}
								<span class="text-text-silver">Unknown</span>
							{/if}
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
					{#if hyphyScopeComponent}
						<div class="hyphy-scope-container mb-6">
							<div class="mb-4 rounded-lg bg-white p-4 shadow-sm">
								<h3 class="mb-4 text-lg font-semibold">
									{analysis.method.toUpperCase()} Analysis Visualization
								</h3>
								<!-- Debug logging for aBSREL data structure -->
								{#if analysis.method.toLowerCase() === 'absrel'}
									<div class="mb-4 text-xs text-text-silver">
										<details>
											<summary>Debug: aBSREL Data Structure</summary>
											<pre
												class="max-h-40 overflow-auto bg-surface-raised p-2 text-xs">{JSON.stringify(
													resultData,
													null,
													2
												)}</pre>
										</details>
									</div>
								{/if}
								<svelte:component this={hyphyScopeComponent} data={resultData} />
							</div>
						</div>
					{/if}

					<!-- Display method-specific results -->
					{#if analysis.method === 'datareader'}
						<div class="data-reader-results">
							<h3 class="mb-2 text-lg font-bold">File Information</h3>
							{#if resultData.FILE_INFO}
								<div class="mb-4">
									<p><strong>Type:</strong> {resultData.FILE_INFO.type || 'Unknown'}</p>
									<p><strong>Sequences:</strong> {resultData.FILE_INFO.sequences || 0}</p>
									<p><strong>Sites:</strong> {resultData.FILE_INFO.sites || 0}</p>
								</div>
							{/if}

							{#if resultData.FILE_PARTITION_INFO}
								<h3 class="mb-2 text-lg font-bold">Partition Information</h3>
								<div class="partition-info">
									{#each Object.entries(resultData.FILE_PARTITION_INFO) as [key, partition]}
										<div class="mb-2 border-l-4 border-brand-royal pl-2">
											<p><strong>Partition {key}:</strong></p>
											<p><strong>Sites:</strong> {partition.sites || 0}</p>
											<p><strong>Sequences:</strong> {partition.sequences || 0}</p>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{:else if ['FEL', 'CONTRAST-FEL', 'SLAC', 'MEME', 'BUSTED', 'RELAX', 'FUBAR', 'aBSREL', 'ABSREL', 'GARD', 'MULTI-HIT', 'NRM'].includes(analysis.method)}
						<!-- Selection analysis results with fallback legacy visualization for FEL -->
						<div class="selection-analysis">
							{#if resultData.input && resultData.input.file}
								<p><strong>Analysis File:</strong> {resultData.input.file}</p>
							{/if}

							<!-- Legacy FEL visualization (keeping as fallback) -->
							{#if analysis.method === 'FEL' && !hyphyScopeComponent}
								<div class="mb-6 mt-6 rounded-lg bg-white p-4 shadow-sm">
									<h3 class="mb-4 text-lg font-semibold">FEL Analysis Visualization (Legacy)</h3>
									<FelVisualization {resultData} />
								</div>
							{/if}

							{#if resultData.fits && resultData.fits.length > 0}
								<h3 class="mb-2 text-lg font-bold">Model Fits</h3>
								<div class="overflow-x-auto">
									<table class="w-full table-auto">
										<thead class="bg-surface-sunken">
											<tr>
												<th class="p-2 text-left">Model</th>
												<th class="p-2 text-left">Log Likelihood</th>
												<th class="p-2 text-left">Parameters</th>
												<th class="p-2 text-left">AIC</th>
											</tr>
										</thead>
										<tbody>
											{#each resultData.fits as fit}
												<tr class="border-b">
													<td class="p-2">{fit.model || 'Unknown'}</td>
													<td class="p-2"
														>{fit.log_likelihood ? fit.log_likelihood.toFixed(2) : 'N/A'}</td
													>
													<td class="p-2">{fit.parameters || 'N/A'}</td>
													<td class="p-2">{fit.AIC ? fit.AIC.toFixed(2) : 'N/A'}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}

							{#if resultData.tested && resultData.tested.sites && resultData.tested.sites.length > 0}
								<h3 class="my-2 text-lg font-bold">Site Results</h3>
								<div class="max-h-96 overflow-auto">
									<table class="w-full table-auto">
										<thead class="sticky top-0 bg-surface-sunken">
											<tr>
												<th class="p-2 text-left">Site</th>
												<th class="p-2 text-left">p-value</th>
												<th class="p-2 text-left">alpha</th>
												<th class="p-2 text-left">beta</th>
												<th class="p-2 text-left">Selection</th>
											</tr>
										</thead>
										<tbody>
											{#each resultData.tested.sites as site}
												<tr class="border-b" class:bg-status-warning-bg={site.p <= 0.05}>
													<td class="p-2">{site.site_index || site.site || 'N/A'}</td>
													<td class="p-2">{site.p ? site.p.toExponential(2) : 'N/A'}</td>
													<td class="p-2">{site.alpha ? site.alpha.toFixed(2) : 'N/A'}</td>
													<td class="p-2">{site.beta ? site.beta.toFixed(2) : 'N/A'}</td>
													<td class="p-2">
														{#if site.p <= 0.05}
															{#if site.beta > site.alpha}
																<span class="font-bold text-status-error">Positive</span>
															{:else}
																<span class="font-bold text-brand-royal">Negative</span>
															{/if}
														{:else}
															<span class="text-text-silver">Neutral</span>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}

							{#if !resultData.tested && !resultData.fits}
								<pre class="bg-surface-sunken p-2 text-sm">{JSON.stringify(
										resultData,
										null,
										2
									)}</pre>
							{/if}

							<!-- HyPhy-eye integration with localStorage sharing -->
							{#if isMethodSupported(analysis.method)}
								<div class="mb-4 mt-4 rounded-lg bg-status-info-bg p-4 text-center shadow-sm">
									<p class="mb-2 text-status-info-text">
										View results with automatic data sharing:
									</p>
									<button
										on:click={() => shareWithHyphyEye(resultData, analysis.method)}
										class="inline-flex items-center rounded-md bg-brand-royal px-4 py-2 text-white transition-colors hover:bg-brand-deep"
									>
										View in HyPhy-eye
										<ExternalLink class="ml-1 h-4 w-4" />
									</button>
									<p class="mt-2 text-sm text-brand-royal">
										Analysis results will be automatically shared via localStorage.
									</p>
								</div>
							{:else}
								<div class="mb-4 mt-4 rounded-lg bg-surface-sunken p-4 text-center shadow-sm">
									<p class="mb-2">Open results in a new tab:</p>
									<a
										href="{FINAL_HYPHY_EYE_URL}/pages/{analysis.method
											.toLowerCase()
											.replace('-', '')}"
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center rounded-md bg-brand-royal px-4 py-2 text-white transition-colors hover:bg-brand-deep"
									>
										Open {analysis.method.toUpperCase()} Results in hyphy-eye
										<ExternalLink class="ml-1 h-4 w-4" />
									</a>
									<p class="mt-2 text-sm text-text-slate">
										Note: You will need to upload your result JSON to hyphy-eye manually.
									</p>
								</div>
							{/if}
						</div>
					{:else}
						<!-- Generic JSON display for other methods -->
						<div class="json-display">
							<h3 class="mb-2 text-lg font-bold">Analysis Results</h3>
							<pre class="max-h-96 overflow-auto bg-surface-sunken p-2 text-sm">{JSON.stringify(
									resultData,
									null,
									2
								)}</pre>
						</div>
					{/if}
				{:else if ['pending', 'running', 'mounting', 'processing', 'saving'].includes(analysis.status)}
					<!-- Show the detailed analysis progress when viewing a pending/running analysis -->
					<AnalysisProgress {analysisId} />
				{:else if analysis.status === 'completed' && !resultData}
					<!-- Analysis is marked complete but results are missing (likely due to state bug) -->
					<div class="rounded-lg bg-status-warning-bg p-4">
						<p class="mb-2 text-status-warning-text">
							<strong>Analysis appears complete but results are not loading.</strong>
						</p>
						<p class="mb-3 text-sm text-status-warning-text">
							This may be due to a state synchronization issue. The analysis completed successfully
							but the results weren't properly saved.
						</p>
						<button
							on:click={() => loadAnalysis(analysisId)}
							class="rounded bg-status-warning px-3 py-1 text-sm text-white hover:bg-accent-copper"
						>
							Retry Loading Results
						</button>
					</div>
				{:else}
					<p class="text-text-slate">No results available</p>
				{/if}
			</div>
		</div>
	{:else}
		<p class="p-4 text-text-silver">Select an analysis to view results</p>
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
	}
</style>
