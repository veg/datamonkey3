<!-- src/lib/AnalysisTimingEstimate.svelte -->
<script>
	import { currentFile, fileMetricsStore } from '../stores/fileInfo';
	import { calculateRuntimeEstimate, SPEED_CATEGORIES } from './utils/timingEstimates.js';
	import { Zap, Clock, Turtle, Snail } from 'lucide-svelte';

	// Props
	export let method = null;
	export let methodOptions = {};
	export let geneticCode = 'Universal';
	export let executionMode = 'backend'; // 'backend' or 'wasm'

	// Get sequence and site data from the appropriate store
	$: fileMetrics = $fileMetricsStore;
	$: sequences = fileMetrics?.FILE_INFO?.sequences || $currentFile?.sequences || 10;
	$: sites = fileMetrics?.FILE_INFO?.sites || $currentFile?.sites || 1000;

	// Calculate timing estimate using data-driven equations
	$: hasValidData = sequences > 0 && sites > 0;
	$: estimatedTime =
		method && hasValidData
			? calculateRuntimeEstimate(method, sequences, sites, executionMode, methodOptions)
			: null;

	// Get dataset info for display
	$: datasetInfo =
		$currentFile || fileMetrics
			? {
					sequences: sequences,
					sites: sites,
					filename: $currentFile?.filename || 'Unknown'
				}
			: null;

	// Map category to icon component
	const categoryIcons = {
		'very-fast': Zap,
		'fast': Zap,
		'medium': Clock,
		'slow': Turtle,
		'very-slow': Snail
	};

	$: SpeedIcon = estimatedTime ? categoryIcons[estimatedTime.category] || Clock : Clock;
	$: isVeryFast = estimatedTime?.category === 'very-fast';
</script>

{#if estimatedTime && estimatedTime.minutes !== null}
	<div
		class="timing-estimate {SPEED_CATEGORIES[estimatedTime.category].bgColor} {SPEED_CATEGORIES[
			estimatedTime.category
		].borderColor} rounded-md border p-3"
	>
		<div class="timing-header">
			<span class="timing-icon flex items-center gap-0.5 {SPEED_CATEGORIES[estimatedTime.category].color}">
				<svelte:component this={SpeedIcon} class="h-4 w-4" />
				{#if isVeryFast}
					<svelte:component this={SpeedIcon} class="h-4 w-4" />
				{/if}
			</span>
			<span class="timing-label {SPEED_CATEGORIES[estimatedTime.category].color}">
				{SPEED_CATEGORIES[estimatedTime.category].label}
			</span>
			<span class="timing-value {SPEED_CATEGORIES[estimatedTime.category].color}">
				{estimatedTime.description}
			</span>
		</div>

		{#if datasetInfo}
			<div class="dataset-info">
				<span class="dataset-details">
					{datasetInfo.sequences} sequences × {datasetInfo.sites} sites
				</span>
				{#if executionMode === 'wasm'}
					<span class="execution-mode">Local WASM</span>
					{#if estimatedTime.scalingFactor}
						<span class="scaling-factor" title="WASM performance scaling factor">
							{estimatedTime.scalingFactor}x scaling
						</span>
					{/if}
				{/if}
				{#if estimatedTime.reliability}
					<span class="reliability" title="Model R² value: {estimatedTime.reliability.toFixed(3)}">
						R² = {estimatedTime.reliability.toFixed(2)}
					</span>
				{/if}
			</div>
		{/if}

	</div>
{:else if method}
	<div class="timing-estimate rounded-md border border-gray-200 bg-gray-50 p-3">
		<div class="timing-header">
			<span class="timing-icon text-gray-500">
				<Clock class="h-4 w-4" />
			</span>
			<span class="timing-label text-gray-600"> Timing Estimate </span>
			<span class="timing-value text-gray-600">
				{($currentFile || fileMetrics) && !hasValidData
					? 'Analyzing file...'
					: 'Upload file to estimate'}
			</span>
		</div>
	</div>
{/if}

<style>
	.timing-estimate {
		font-size: 13px;
		transition: all 0.2s ease;
	}

	.timing-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.timing-icon {
		font-size: 14px;
	}

	.timing-label {
		font-weight: 500;
	}

	.timing-value {
		font-weight: 600;
		margin-left: auto;
	}

	.dataset-info {
		margin-top: 4px;
		padding-left: 22px; /* Align with text after icon */
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.dataset-details {
		color: #64748b;
		font-size: 12px;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
	}

	.execution-mode {
		font-size: 10px;
		padding: 1px 4px;
		background-color: #e0f2fe;
		color: #0369a1;
		border-radius: 3px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.reliability {
		font-size: 10px;
		padding: 1px 4px;
		background-color: #f0fdf4;
		color: #166534;
		border-radius: 3px;
		font-weight: 500;
		cursor: help;
	}

	.scaling-factor {
		font-size: 10px;
		padding: 1px 4px;
		background-color: #fef3c7;
		color: #92400e;
		border-radius: 3px;
		font-weight: 500;
		cursor: help;
	}

</style>
