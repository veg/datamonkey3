<script>
	import { onMount } from 'svelte';
	import { analysisStore } from '../stores/analyses';
	import { Check } from 'lucide-svelte';

	export let activeTab = 'data';
	export let onChange = (tabName) => {};

	// Track if we have any analyses available (to enable/disable the Results step)
	let hasAnalyses = false;
	let hasCompletedAnalyses = false;

	// Subscribe to the analysis store to determine if we have any analyses
	onMount(() => {
		const unsubscribe = analysisStore.subscribe((state) => {
			hasAnalyses = state.analyses.length > 0;
			hasCompletedAnalyses = state.analyses.some((analysis) => analysis.status === 'completed');
		});

		return unsubscribe;
	});

	// Function to handle step clicks with conditional navigation
	function handleStepClick(step) {
		// Step 1 "Prepare Data" is always clickable
		if (step === 'data') {
			onChange('data');
			return;
		}

		// Step 2 "Run Analysis" is always clickable
		if (step === 'analyze') {
			onChange('analyze');
			return;
		}

		// Step 3 "View Results" is only clickable if analyses exist
		if (step === 'results') {
			if (hasAnalyses) {
				onChange('results');
			}
			// No navigation if no analyses exist (disabled state)
		}
	}

	// Function to determine the visual state of each step
	function getStepState(step) {
		// Current step is active
		if (activeTab === step) {
			return 'active';
		}

		// For results, check if it's available
		if (step === 'results' && !hasAnalyses) {
			return 'disabled';
		}

		// For data step, mark as completed if we're past it
		if (step === 'data' && (activeTab === 'analyze' || activeTab === 'results')) {
			return 'completed';
		}

		// For analyze step, mark as completed if we're on results tab and have completed analyses
		if (step === 'analyze' && activeTab === 'results' && hasCompletedAnalyses) {
			return 'completed';
		}

		// Otherwise, it's available but not active
		return 'available';
	}
</script>

<div class="mt-premium-xl flex items-center justify-center">
	<div class="flex items-center">
		<!-- Step 1: Prepare Data -->
		<button
			class="group flex flex-col items-center"
			on:click={() => handleStepClick('data')}
			aria-label="Go to Prepare Data step"
		>
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full font-bold transition-all duration-premium"
				class:bg-brand-royal={getStepState('data') === 'active'}
				class:text-white={getStepState('data') === 'active' || getStepState('data') === 'completed'}
				class:bg-accent-copper={getStepState('data') === 'completed'}
				class:bg-text-silver={getStepState('data') === 'available'}
				class:text-text-rich={getStepState('data') === 'available'}
				class:bg-border-platinum={getStepState('data') === 'disabled'}
				class:text-text-silver={getStepState('data') === 'disabled'}
				class:cursor-not-allowed={getStepState('data') === 'disabled'}
				class:group-hover:bg-brand-muted={getStepState('data') === 'available'}
			>
				{#if getStepState('data') === 'completed'}
					<Check class="h-5 w-5" />
				{:else}
					1
				{/if}
			</div>
		</button>

		<!-- Connector line 1-2 -->
		<div
			class="h-1 w-16 transition-all duration-premium"
			class:bg-accent-copper={getStepState('data') === 'completed'}
			class:bg-brand-gradient={activeTab === 'analyze' && getStepState('data') !== 'completed'}
			class:bg-border-platinum={activeTab === 'data' ||
				(activeTab === 'results' && getStepState('data') !== 'completed')}
		>
			<div
				class="h-full transition-all duration-premium"
				class:bg-accent-copper={getStepState('data') === 'completed'}
				class:bg-brand-gradient={activeTab === 'analyze' && getStepState('data') !== 'completed'}
				style="width: 100%"
			></div>
		</div>

		<!-- Step 2: Run Analysis -->
		<button
			class="group flex flex-col items-center"
			on:click={() => handleStepClick('analyze')}
			aria-label="Go to Run Analysis step"
		>
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full font-bold transition-all duration-premium"
				class:bg-brand-royal={getStepState('analyze') === 'active'}
				class:text-white={getStepState('analyze') === 'active' ||
					getStepState('analyze') === 'completed'}
				class:bg-accent-copper={getStepState('analyze') === 'completed'}
				class:bg-text-silver={getStepState('analyze') === 'available'}
				class:text-text-rich={getStepState('analyze') === 'available'}
				class:bg-border-platinum={getStepState('analyze') === 'disabled'}
				class:text-text-silver={getStepState('analyze') === 'disabled'}
				class:cursor-not-allowed={getStepState('analyze') === 'disabled'}
				class:group-hover:bg-brand-muted={getStepState('analyze') === 'available'}
			>
				{#if getStepState('analyze') === 'completed'}
					<Check class="h-5 w-5" />
				{:else}
					2
				{/if}
			</div>
		</button>

		<!-- Connector line 2-3 -->
		<div
			class="h-1 w-16 transition-all duration-premium"
			class:bg-accent-copper={getStepState('analyze') === 'completed'}
			class:bg-brand-gradient={activeTab === 'results' && getStepState('analyze') !== 'completed'}
			class:bg-border-platinum={activeTab === 'data' || activeTab === 'analyze'}
		>
			<div
				class="h-full transition-all duration-premium"
				class:bg-accent-copper={getStepState('analyze') === 'completed'}
				class:bg-brand-gradient={activeTab === 'results' && getStepState('analyze') !== 'completed'}
				style="width: {activeTab === 'results' ? '100%' : '0%'}"
			></div>
		</div>

		<!-- Step 3: View Results -->
		<button
			class="group flex flex-col items-center"
			on:click={() => handleStepClick('results')}
			aria-label="Go to View Results step"
			title={!hasAnalyses ? 'Complete previous steps first' : ''}
			class:cursor-not-allowed={!hasAnalyses}
		>
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full font-bold transition-all duration-premium"
				class:bg-brand-royal={getStepState('results') === 'active'}
				class:text-white={getStepState('results') === 'active' ||
					getStepState('results') === 'completed'}
				class:bg-accent-copper={getStepState('results') === 'completed'}
				class:bg-text-silver={getStepState('results') === 'available'}
				class:text-text-rich={getStepState('results') === 'available'}
				class:bg-border-platinum={getStepState('results') === 'disabled'}
				class:text-text-silver={getStepState('results') === 'disabled'}
				class:group-hover:bg-brand-muted={getStepState('results') === 'available'}
			>
				3
			</div>
		</button>
	</div>
</div>

<div class="mt-premium-sm flex items-center justify-center text-premium-meta">
	<button
		class="mx-5 text-center transition-all duration-premium"
		class:font-semibold={activeTab === 'data'}
		class:text-brand-royal={activeTab === 'data'}
		class:text-text-rich={getStepState('data') === 'completed'}
		class:text-text-slate={activeTab !== 'data' && getStepState('data') !== 'completed'}
		class:hover:text-brand-royal={activeTab !== 'data'}
		on:click={() => handleStepClick('data')}
	>
		Prepare Data
	</button>

	<button
		class="mx-9 text-center transition-all duration-premium"
		class:font-semibold={activeTab === 'analyze'}
		class:text-brand-royal={activeTab === 'analyze'}
		class:text-text-rich={getStepState('analyze') === 'completed'}
		class:text-text-slate={activeTab !== 'analyze' && getStepState('analyze') !== 'completed'}
		class:hover:text-brand-royal={activeTab !== 'analyze'}
		on:click={() => handleStepClick('analyze')}
	>
		Run Analysis
	</button>

	<button
		class="mx-5 text-center transition-all duration-premium"
		class:font-semibold={activeTab === 'results'}
		class:text-brand-royal={activeTab === 'results'}
		class:text-text-slate={activeTab !== 'results'}
		class:hover:text-brand-royal={activeTab !== 'results' && hasAnalyses}
		class:cursor-not-allowed={!hasAnalyses}
		class:opacity-50={!hasAnalyses}
		on:click={() => handleStepClick('results')}
		title={!hasAnalyses ? 'Complete previous steps first' : ''}
	>
		View Results
	</button>
</div>
