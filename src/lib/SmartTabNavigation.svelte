<script>
	import { persistentFileStore, currentFile } from '../stores/fileInfo';
	import { analysisStore } from '../stores/analyses';

	export let activeTab = 'data';
	export let onChange = (tabName) => {};

	// Reactive variables to track state conditions
	$: hasFiles = $persistentFileStore?.files?.length > 0;
	$: hasAnalyses = $analysisStore?.analyses?.length > 0;

	// Track when user last viewed the Results tab to clear badge
	// Initialize to current time so existing analyses don't show as "new" on page load
	let lastResultsViewTime = Date.now();

	// Update lastResultsViewTime when user navigates to Results tab
	$: if (activeTab === 'results') {
		lastResultsViewTime = Date.now();
	}

	// Count analyses completed AFTER the user last viewed Results tab
	// Exclude datareader results since those are automatic file parsing, not user-initiated analyses
	$: unviewedCompletedCount = ($analysisStore?.analyses || []).filter((a) => {
		if (a.status !== 'completed' || !a.completedAt) return false;
		if (a.method === 'datareader') return false;
		return a.completedAt > lastResultsViewTime;
	}).length;

	// Show badge only if there are unviewed completions and not currently on Results tab
	$: showResultsBadge = activeTab !== 'results' && unviewedCompletedCount > 0;

	// Logic to determine if a tab should be disabled
	$: isAnalyzeDisabled = !hasFiles;
	$: isResultsDisabled = !hasAnalyses;

	// Function to handle tab clicks with context-aware behavior
	function handleTabClick(tabName) {
		// Data tab is always accessible
		if (tabName === 'data') {
			onChange(tabName);
			return;
		}

		// Analyze tab requires at least one file
		if (tabName === 'analyze') {
			if (!isAnalyzeDisabled) {
				onChange(tabName);
			}
			return;
		}

		// Results tab requires at least one analysis
		if (tabName === 'results') {
			if (!isResultsDisabled) {
				onChange(tabName);
			}
			return;
		}
	}
</script>

<div class="mb-4 sm:mb-premium-xl">
	<div class="rounded-premium bg-brand-ghost p-1 sm:p-premium-xs">
		<div class="flex border-b border-border-platinum">
			<!-- Data Tab - Always Enabled -->
			<button
				class="relative min-h-[48px] flex-1 px-2 py-3 text-xs font-semibold transition-all duration-premium sm:flex-none sm:px-premium-xl sm:py-premium-lg sm:text-premium-brand"
				class:text-brand-royal={activeTab === 'data'}
				class:text-text-rich={activeTab !== 'data'}
				class:hover:text-brand-royal={activeTab !== 'data'}
				class:hover:bg-brand-whisper={activeTab !== 'data'}
				on:click={() => handleTabClick('data')}
				title="Manage sequence data"
			>
				<span class="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
					<div
						class="step-indicator flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-all"
						class:bg-brand-royal={activeTab === 'data'}
						class:text-white={activeTab === 'data'}
						class:border-brand-royal={activeTab === 'data'}
						class:bg-white={activeTab !== 'data'}
						class:text-text-rich={activeTab !== 'data'}
						class:border-text-slate={activeTab !== 'data'}
						class:active-step={activeTab === 'data'}
					>
						<span class="text-xs font-bold sm:text-sm">1</span>
					</div>
					<span class="text-[10px] sm:text-sm">Data</span>
				</span>
				{#if activeTab === 'data'}
					<div class="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-copper"></div>
				{/if}
			</button>

			<!-- Analyze Tab - Disabled until data is available -->
			<button
				class="relative min-h-[48px] flex-1 px-2 py-3 text-xs font-semibold transition-all duration-premium sm:flex-none sm:px-premium-xl sm:py-premium-lg sm:text-premium-brand"
				class:text-brand-royal={activeTab === 'analyze' && !isAnalyzeDisabled}
				class:text-text-rich={activeTab !== 'analyze' && !isAnalyzeDisabled}
				class:text-text-silver={isAnalyzeDisabled}
				class:hover:text-brand-royal={activeTab !== 'analyze' && !isAnalyzeDisabled}
				class:hover:bg-brand-whisper={activeTab !== 'analyze' && !isAnalyzeDisabled}
				class:cursor-not-allowed={isAnalyzeDisabled}
				class:opacity-60={isAnalyzeDisabled}
				on:click={() => handleTabClick('analyze')}
				title={isAnalyzeDisabled ? 'Upload data first' : 'Run analysis on selected data'}
				aria-disabled={isAnalyzeDisabled}
			>
				<span class="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
					<div
						class="step-indicator flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-all"
						class:bg-brand-royal={activeTab === 'analyze' && !isAnalyzeDisabled}
						class:text-white={activeTab === 'analyze' && !isAnalyzeDisabled}
						class:border-brand-royal={activeTab === 'analyze' && !isAnalyzeDisabled}
						class:bg-white={activeTab !== 'analyze' && !isAnalyzeDisabled}
						class:text-text-rich={activeTab !== 'analyze' && !isAnalyzeDisabled}
						class:border-text-slate={activeTab !== 'analyze' && !isAnalyzeDisabled}
						class:bg-gray-100={isAnalyzeDisabled}
						class:text-text-silver={isAnalyzeDisabled}
						class:border-gray-200={isAnalyzeDisabled}
						class:active-step={activeTab === 'analyze'}
					>
						<span class="text-xs font-bold sm:text-sm">2</span>
					</div>
					<span class="text-[10px] sm:text-sm">Analyze</span>
				</span>
				{#if activeTab === 'analyze' && !isAnalyzeDisabled}
					<div class="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-copper"></div>
				{/if}
			</button>

			<!-- Results Tab - Disabled until analyses exist -->
			<button
				class="relative min-h-[48px] flex-1 px-2 py-3 text-xs font-semibold transition-all duration-premium sm:flex-none sm:px-premium-xl sm:py-premium-lg sm:text-premium-brand"
				class:text-brand-royal={activeTab === 'results' && !isResultsDisabled}
				class:text-text-rich={activeTab !== 'results' && !isResultsDisabled}
				class:text-text-silver={isResultsDisabled}
				class:hover:text-brand-royal={activeTab !== 'results' && !isResultsDisabled}
				class:hover:bg-brand-whisper={activeTab !== 'results' && !isResultsDisabled}
				class:cursor-not-allowed={isResultsDisabled}
				class:opacity-60={isResultsDisabled}
				on:click={() => handleTabClick('results')}
				title={isResultsDisabled ? 'Run analysis first' : 'View analysis results'}
				aria-disabled={isResultsDisabled}
			>
				<span class="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
					<div
						class="relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border"
						class:bg-brand-royal={activeTab === 'results' && !isResultsDisabled}
						class:text-white={activeTab === 'results' && !isResultsDisabled}
						class:border-brand-royal={activeTab === 'results' && !isResultsDisabled}
						class:bg-white={activeTab !== 'results' && !isResultsDisabled}
						class:text-text-rich={activeTab !== 'results' && !isResultsDisabled}
						class:border-text-slate={activeTab !== 'results' && !isResultsDisabled}
						class:bg-gray-100={isResultsDisabled}
						class:text-text-silver={isResultsDisabled}
						class:border-gray-200={isResultsDisabled}
					>
						<span class="text-xs font-bold sm:text-sm">3</span>
						<!-- Badge for recently completed analyses -->
						{#if showResultsBadge}
							<span class="results-badge">{unviewedCompletedCount}</span>
						{/if}
					</div>
					<span class="text-[10px] sm:text-sm">Results</span>
				</span>
				{#if activeTab === 'results' && !isResultsDisabled}
					<div class="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-copper"></div>
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	/* Active step indicator - slightly larger and with shadow */
	.step-indicator.active-step {
		transform: scale(1.15);
		box-shadow: 0 2px 8px rgba(124, 58, 237, 0.3);
	}

	/* Badge for new results notification */
	.results-badge {
		position: absolute;
		top: -6px;
		right: -6px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background-color: #10b981;
		color: white;
		font-size: 10px;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
		border-radius: 9999px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
		animation: badge-pulse 2s ease-in-out infinite;
	}

	@keyframes badge-pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}

	/* Add styles for custom tooltip on hover */
	button[title]:hover::after {
		content: attr(title);
		position: absolute;
		bottom: -30px;
		left: 50%;
		transform: translateX(-50%);
		background-color: var(--tw-text-rich, #111827);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		white-space: nowrap;
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		animation: fadeIn 0.2s ease-in-out forwards;
	}

	@keyframes fadeIn {
		to {
			opacity: 1;
		}
	}
</style>
