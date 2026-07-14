<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { AlertCircle, AlertTriangle, Info, X, ChevronDown } from 'lucide-svelte';

	// Props
	export let error = null;
	export let level = 'error'; // 'error', 'warning', 'info'
	export let dismissable = true;
	export let autoDismiss = false;
	export let dismissAfter = 5000; // ms
	export let showDetails = true;
	export let suggestions = [];

	// Local state
	let timer = null;
	let isExpanded = true;

	const dispatch = createEventDispatcher();

	// Get appropriate styling based on level
	function getLevelStyles() {
		switch (level) {
			case 'error':
				return {
					container: 'bg-status-error-bg border-status-error-border text-status-error-text',
					icon: 'text-status-error',
					button: 'hover:bg-status-error-border focus:ring-status-error'
				};
			case 'warning':
				return {
					container: 'bg-status-warning-bg border-status-warning-border text-status-warning-text',
					icon: 'text-status-warning',
					button: 'hover:bg-status-warning-border focus:ring-status-warning'
				};
			case 'info':
			default:
				return {
					container: 'bg-status-info-bg border-status-info-border text-status-info-text',
					icon: 'text-status-info',
					button: 'hover:bg-status-info-border focus:ring-status-info'
				};
		}
	}

	// Map level to icon component
	const levelIcons = {
		error: AlertCircle,
		warning: AlertTriangle,
		info: Info
	};

	$: LevelIcon = levelIcons[level] || Info;

	// Handle dismissal
	function dismiss() {
		dispatch('dismiss');
	}

	// Toggle expanded details
	function toggleDetails() {
		isExpanded = !isExpanded;
	}

	// Execute a suggested action
	function executeSuggestion(suggestion) {
		dispatch('suggestion', suggestion);
	}

	// Set up auto-dismiss if enabled
	$: if (autoDismiss && error) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			dismiss();
		}, dismissAfter);
	}

	// Clean up timer on component destroy
	onMount(() => {
		return () => {
			clearTimeout(timer);
		};
	});

	// Format error message
	$: errorMessage = typeof error === 'string' ? error : error?.message || 'An error occurred';
	$: errorDetails = typeof error === 'string' ? null : error?.details || null;
	$: styles = getLevelStyles();
</script>

{#if error}
	<div class="error-handler mb-4 rounded border p-4 shadow-sm {styles.container}" role="alert">
		<div class="flex">
			<div class="mr-3 flex-shrink-0 {styles.icon}">
				<svelte:component this={LevelIcon} class="h-5 w-5" />
			</div>
			<div class="flex-grow">
				<div class="flex items-start justify-between">
					<div>
						<p class="font-medium">{errorMessage}</p>
					</div>

					{#if dismissable}
						<button
							on:click={dismiss}
							class="ml-4 inline-flex rounded p-1.5 transition-colors {styles.button} focus:outline-none focus:ring-2 focus:ring-offset-2"
							aria-label="Dismiss"
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>

				{#if errorDetails && showDetails}
					<div class="mt-2">
						<button
							type="button"
							on:click={toggleDetails}
							class="inline-flex items-center text-sm {styles.button} rounded px-2 py-1 transition-colors focus:outline-none"
						>
							<span>Details</span>
							<ChevronDown
								class="ml-1 h-4 w-4 transform transition-transform {isExpanded ? 'rotate-180' : ''}"
							/>
						</button>

						{#if isExpanded}
							<div class="mt-2 rounded bg-white bg-opacity-50 p-3 text-sm">
								<p>{errorDetails}</p>
							</div>
						{/if}
					</div>
				{/if}

				{#if suggestions && suggestions.length > 0}
					<div class="mt-3">
						<p class="text-sm font-medium">Suggestions:</p>
						<div class="mt-1 flex flex-wrap gap-2">
							{#each suggestions as suggestion}
								<button
									on:click={() => executeSuggestion(suggestion)}
									class="inline-flex items-center rounded border border-current px-2 py-1 text-xs opacity-90 hover:opacity-100"
								>
									{suggestion.label}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
