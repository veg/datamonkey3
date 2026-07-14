<script>
	import { writable } from 'svelte/store';
	import { calculateRuntimeEstimate, SPEED_CATEGORIES } from '../lib/utils/timingEstimates.js';
	import { Zap, Clock, Turtle, Snail } from 'lucide-svelte';

	// Props
	export let method = 'fel';
	export let methodOptions = {};
	export let geneticCode = 'Universal';
	export let datasetSize = 'medium';
	export let executionMode = 'backend'; // 'backend' or 'wasm'

	// Mock file data for different dataset sizes
	const mockFileData = {
		small: {
			id: 'small-dataset',
			filename: 'small_alignment.fasta',
			size: 1024 * 50, // 50KB
			sequences: 10,
			sites: 500,
			partitions: [],
			createdAt: Date.now()
		},
		medium: {
			id: 'medium-dataset',
			filename: 'medium_alignment.fasta',
			size: 1024 * 500, // 500KB
			sequences: 50,
			sites: 2000,
			partitions: [],
			createdAt: Date.now()
		},
		large: {
			id: 'large-dataset',
			filename: 'large_alignment.fasta',
			size: 1024 * 2000, // 2MB
			sequences: 200,
			sites: 5000,
			partitions: [],
			createdAt: Date.now()
		}
	};

	// Create a mock currentFile store for this component instance
	const mockCurrentFile = writable(datasetSize ? mockFileData[datasetSize] : null);

	// Update when datasetSize changes
	$: mockCurrentFile.set(datasetSize ? mockFileData[datasetSize] : null);

	// Calculate timing estimate using data-driven equations
	$: estimatedTime =
		method && $mockCurrentFile
			? calculateRuntimeEstimate(
					method,
					$mockCurrentFile.sequences || 10,
					$mockCurrentFile.sites || 1000,
					executionMode,
					methodOptions
				)
			: null;

	// Get dataset info for display
	$: datasetInfo = $mockCurrentFile
		? {
				sequences: $mockCurrentFile.sequences || 0,
				sites: $mockCurrentFile.sites || 0,
				filename: $mockCurrentFile.filename || 'Unknown'
			}
		: null;

	// Map category to icon component
	const categoryIcons = {
		'very-fast': Zap,
		fast: Zap,
		medium: Clock,
		slow: Turtle,
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
				{$mockCurrentFile ? 'Calculating...' : 'Upload file to estimate'}
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
		padding-left: 22px;
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

</style>
