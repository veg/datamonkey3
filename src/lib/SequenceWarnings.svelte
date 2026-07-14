<!-- src/lib/SequenceWarnings.svelte -->
<script>
	import { AlertCircle, AlertTriangle, Info } from 'lucide-svelte';

	export let fileMetricsJSON = null;

	// State for managing warnings
	let warnings = [];
	let showAllWarnings = false;

	// Watch for changes in fileMetricsJSON
	$: if (fileMetricsJSON) {
		generateWarnings(fileMetricsJSON);
	}

	// Generate warnings based on file metrics
	function generateWarnings(data) {
		warnings = [];

		if (!data || !data.FILE_INFO) return;

		// Check for duplicate sequences
		if (data.FILE_INFO.duplicate_sequences && data.FILE_INFO.duplicate_sequences > 0) {
			warnings.push({
				type: 'warning',
				title: 'Duplicate Sequences Detected',
				message: `Found ${data.FILE_INFO.duplicate_sequences} duplicate sequence${data.FILE_INFO.duplicate_sequences === 1 ? '' : 's'} in your alignment.`,
				details:
					'Duplicate sequences can affect the accuracy of selection analysis. Consider removing duplicates for more reliable results.',
				action: null
			});
		}

		// Check for short alignment
		if (data.FILE_INFO.sites && data.FILE_INFO.sites < 30) {
			warnings.push({
				type: 'info',
				title: 'Short Alignment',
				message: `Your alignment has only ${data.FILE_INFO.sites} sites, which is relatively short.`,
				details:
					'Short alignments may have limited statistical power for detecting selection. Consider adding more sequences or sites if possible.',
				action: null
			});
		}

		// Check for small number of sequences
		if (data.FILE_INFO.sequences && data.FILE_INFO.sequences < 8) {
			warnings.push({
				type: 'info',
				title: 'Small Sample Size',
				message: `Your alignment has only ${data.FILE_INFO.sequences} sequences, which is a small sample.`,
				details:
					'Selection analyses generally perform better with larger samples. Consider adding more sequences if possible.',
				action: null
			});
		}

		// Check for ambiguous characters
		if (data.FILE_INFO.ambiguous_sites && data.FILE_INFO.ambiguous_sites > 0) {
			warnings.push({
				type: 'warning',
				title: 'Ambiguous Characters',
				message: `Found ${data.FILE_INFO.ambiguous_sites} ambiguous character${data.FILE_INFO.ambiguous_sites === 1 ? '' : 's'} in your alignment.`,
				details:
					'Ambiguous characters (like N, X, etc.) may cause issues with some analyses. Consider resolving these ambiguities if possible.',
				action: null
			});
		}

		// Check for stop codons
		if (data.FILE_INFO.stop_codons && data.FILE_INFO.stop_codons > 0) {
			warnings.push({
				type: 'error',
				title: 'Stop Codons Detected',
				message: `Found ${data.FILE_INFO.stop_codons} stop codon${data.FILE_INFO.stop_codons === 1 ? '' : 's'} in your alignment.`,
				details:
					'Stop codons within the alignment may indicate frame shifts, sequencing errors, or pseudogenes. Verify your alignment and genetic code selection.',
				action: null
			});
		}

		// Check for frameshift issues (uneven codon count)
		if (data.FILE_INFO.rawsites && data.FILE_INFO.rawsites % 3 !== 0) {
			warnings.push({
				type: 'error',
				title: 'Alignment Length Not Divisible by 3',
				message: `Your alignment length (${data.FILE_INFO.rawsites}) is not divisible by 3.`,
				details:
					'Codon-based analyses require sequence lengths to be multiples of 3. Check for frameshifts or alignment errors.',
				action: null
			});
		}
	}

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
		These warnings are meant to help you improve your analysis results. Minor issues may not
		significantly affect results.
	</p>
{/if}
