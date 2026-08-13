<!-- src/lib/SequenceWarnings.svelte -->
<script>
	import { AlertCircle, AlertTriangle, Info } from 'lucide-svelte';
	import { buildWarnings } from './utils/datareaderWarnings.js';

	export let fileMetricsJSON = null;

	// State for managing warnings
	let warnings = [];
	let showAllWarnings = false;

	// The generator lives in datareaderWarnings.js: the copy is the whole point of these warnings,
	// and inside a component there was no seam a test could reach it through.
	$: warnings = buildWarnings(fileMetricsJSON?.FILE_INFO);

	// How many names to show inline before collapsing the rest into a count. Long enough to be
	// useful on a hand-curated alignment, short enough not to bury the message.
	const MAX_LISTED_NAMES = 10;

	// Get the color class based on warning type
	function getWarningColorClass(type) {
		switch (type) {
			case 'error':
				return 'bg-red-50 border-red-300 text-red-800';
			case 'warning':
				return 'bg-yellow-50 border-yellow-300 text-yellow-800';
			case 'info':
			default:
				return 'bg-blue-50 border-blue-300 text-blue-800';
		}
	}

	// Map warning type to icon component and color
	const warningIcons = {
		error: { component: AlertCircle, color: 'text-red-500' },
		warning: { component: AlertTriangle, color: 'text-yellow-500' },
		info: { component: Info, color: 'text-blue-500' }
	};

	function getWarningIcon(type) {
		return warningIcons[type] || warningIcons.info;
	}

	// Toggle showing all warnings
	function toggleShowAllWarnings() {
		showAllWarnings = !showAllWarnings;
	}

	// Calculate warnings to display
	$: displayedWarnings = showAllWarnings ? warnings : warnings.slice(0, 2);
</script>

{#if warnings.length > 0}
	<div class="flex items-center justify-between">
		<h2 class="mb-premium-md text-premium-header font-semibold text-text-rich">
			Sequence Warnings ({warnings.length})
		</h2>

		{#if warnings.length > 2}
			<button class="text-sm text-blue-600 hover:text-blue-800" on:click={toggleShowAllWarnings}>
				{showAllWarnings ? 'Show Fewer' : 'Show All'}
			</button>
		{/if}
	</div>

	<div class="space-y-2">
		{#each displayedWarnings as warning}
			<div class={`rounded-md border p-3 ${getWarningColorClass(warning.type)}`}>
				<div class="flex items-start">
					<div class="mr-2 flex-shrink-0" style="margin-top: 2px;">
						<svelte:component
							this={getWarningIcon(warning.type).component}
							class="h-4 w-4 {getWarningIcon(warning.type).color}"
						/>
					</div>

					<div class="flex-1">
						<h4 class="text-sm font-semibold">{warning.title}</h4>
						<p class="text-sm">{warning.message}</p>

						{#if warning.items && warning.items.length > 0}
							<ul class="mt-1.5 space-y-0.5 font-mono text-xs opacity-90">
								{#each warning.items.slice(0, MAX_LISTED_NAMES) as item}
									<li class="break-all">{item}</li>
								{/each}
							</ul>
							{#if warning.items.length > MAX_LISTED_NAMES || warning.truncated}
								<p class="mt-1 text-xs opacity-70">
									+{warning.items.length -
										Math.min(warning.items.length, MAX_LISTED_NAMES) +
										(warning.truncated || 0)} more not listed
								</p>
							{/if}
						{/if}

						{#if warning.details}
							<p class="mt-1 text-xs opacity-80">{warning.details}</p>
						{/if}

						{#if warning.action}
							<button
								class="mt-1 rounded bg-white bg-opacity-50 px-3 py-1 text-xs font-medium hover:bg-opacity-70"
								on:click={warning.actionHandler}
							>
								{warning.action}
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/each}

		{#if !showAllWarnings && warnings.length > 2}
			<div class="text-center">
				<p class="text-sm text-gray-500">
					+{warnings.length - 2} more {warnings.length - 2 === 1 ? 'warning' : 'warnings'}
				</p>
			</div>
		{/if}
	</div>

	<p class="mt-2 text-xs text-text-silver">
		These notes describe what your file contained and what the reader did with it before analysis.
		They are not errors, and none of them changed the file you uploaded.
	</p>
{/if}
