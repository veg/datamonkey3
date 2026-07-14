<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { persistentFileStore } from '../stores/fileInfo';
	import {
		File,
		Clock,
		Loader2,
		RefreshCw,
		AlertCircle,
		CheckCircle,
		Pause,
		Eye,
		XCircle,
		Download,
		Trash2
	} from 'lucide-svelte';

	// Props
	export let analysis = {};
	export let compact = false;
	export let selected = false;

	// Local state
	let file = null;
	let resultPreview = null;
	let isLoading = false;

	const dispatch = createEventDispatcher();

	// Load file info
	$: if (analysis && analysis.fileId && $persistentFileStore.files) {
		file = $persistentFileStore.files.find((f) => f.id === analysis.fileId);
	}

	// Format date for display
	function formatDate(timestamp) {
		if (!timestamp) return 'Unknown';

		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now - date;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		// More consistent time display
		if (diffMins < 1) {
			return 'just now';
		} else if (diffMins < 60) {
			return `${diffMins} min ago`;
		} else if (diffHours < 24) {
			return `${diffHours} hr ago`;
		} else if (diffDays < 7) {
			return `${diffDays} days ago`;
		} else {
			// Full date format for older dates
			return date.toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		}
	}

	// Get method short code for display
	function getMethodCode(method) {
		const codes = {
			fel: 'FEL',
			meme: 'MEME',
			slac: 'SLAC',
			busted: 'BSTD',
			fubar: 'FBAR',
			absrel: 'aBSR',
			relax: 'RELX',
			gard: 'GARD',
			bgm: 'BGM',
			'contrast-fel': 'cFEL',
			'multi-hit': 'MH',
			fade: 'FADE',
			prime: 'PRIM',
			datareader: 'DATA'
		};
		return codes[method] || method?.toUpperCase()?.slice(0, 4) || '?';
	}

	// Generate a simple preview of the analysis result
	async function generateResultPreview() {
		if (!analysis || !analysis.result || analysis.method === 'datareader') {
			return null;
		}

		try {
			isLoading = true;

			// Try to parse the result
			const result =
				typeof analysis.result === 'string' ? JSON.parse(analysis.result) : analysis.result;

			if (!result) return null;

			// Generate different previews based on method
			if (['fel', 'slac', 'meme', 'fubar'].includes(analysis.method)) {
				if (result.tested && result.tested.sites) {
					// Count positively selected sites
					const positiveSites = result.tested.sites.filter(
						(site) => site.p <= 0.05 && (site.beta > site.alpha || site.posterior >= 0.9)
					).length;

					return {
						text: `${positiveSites} positive sites found`,
						type: 'selection'
					};
				}
			} else if (analysis.method === 'busted') {
				if (result.test_results && result.test_results.p) {
					const pValue = result.test_results.p;
					const significant = pValue <= 0.05;

					return {
						text: significant
							? `Positive selection detected (p=${pValue.toExponential(2)})`
							: `No selection detected (p=${pValue.toExponential(2)})`,
						type: 'hypothesis',
						significant
					};
				}
			}

			return {
				text: `${analysis.method.toUpperCase()} results`,
				type: 'generic'
			};
		} catch (error) {
			console.error('Error generating result preview:', error);
			return null;
		} finally {
			isLoading = false;
		}
	}

	// Generate preview on mount
	onMount(async () => {
		resultPreview = await generateResultPreview();
	});

	// Handle card selection
	function selectCard() {
		dispatch('select', { analysisId: analysis.id });
	}

	// Handle view action
	function viewAnalysis() {
		dispatch('view', { analysisId: analysis.id });
	}

	// Handle export action
	function exportAnalysis() {
		dispatch('export', { analysisId: analysis.id });
	}

	// Handle cancel action
	function cancelAnalysis() {
		dispatch('cancel', { analysisId: analysis.id });
	}

	// Handle delete action
	function deleteAnalysis() {
		dispatch('delete', { analysisId: analysis.id });
	}

	// Handle re-run action (for interrupted analyses)
	function rerunAnalysis() {
		dispatch('rerun', { analysisId: analysis.id, method: analysis.method, fileId: analysis.fileId });
	}
</script>

<div
	data-testid="analysis-card"
	class="analysis-card mb-3 rounded-lg border transition-all duration-200 {compact
		? 'p-3'
		: 'p-4'} {selected
		? 'border-blue-500 bg-blue-50 shadow-sm'
		: 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}"
	on:click={selectCard}
>
	<div class="flex items-start">
		<!-- Method and status -->
		<div
			class="mr-3 {compact
				? 'h-8 w-8'
				: 'h-10 w-10'} flex flex-shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-600"
		>
			<span class="font-mono {compact ? 'text-[9px]' : 'text-[10px]'} font-bold leading-none">
				{getMethodCode(analysis.method)}
			</span>
		</div>

		<div class="flex-grow">
			<!-- Header -->
			<div class="flex items-start justify-between">
				<h3 class="font-medium {compact ? 'text-sm' : 'text-base'}">
					{analysis.method ? analysis.method.toUpperCase() : 'Unknown'} Analysis
				</h3>

				<!-- Status badge -->
				<div
					class="{compact
						? 'text-xs'
						: 'text-sm'} inline-flex items-center rounded-full px-2 py-0.5"
					class:bg-green-100={analysis.status === 'completed'}
					class:text-green-800={analysis.status === 'completed'}
					class:bg-yellow-100={analysis.status === 'running' || analysis.status === 'pending'}
					class:text-yellow-800={analysis.status === 'running' || analysis.status === 'pending'}
					class:bg-red-100={analysis.status === 'error'}
					class:text-red-800={analysis.status === 'error'}
					class:bg-orange-100={analysis.status === 'cancelled' || analysis.status === 'interrupted'}
					class:text-orange-800={analysis.status === 'cancelled' || analysis.status === 'interrupted'}
					class:bg-blue-100={analysis.status === 'reconnecting'}
					class:text-blue-800={analysis.status === 'reconnecting'}
					class:bg-amber-100={analysis.status === 'connection_lost'}
					class:text-amber-800={analysis.status === 'connection_lost'}
					class:bg-gray-100={!['completed', 'running', 'pending', 'error', 'cancelled', 'interrupted', 'reconnecting', 'connection_lost'].includes(
						analysis.status
					)}
					class:text-gray-800={!['completed', 'running', 'pending', 'error', 'cancelled', 'interrupted', 'reconnecting', 'connection_lost'].includes(
						analysis.status
					)}
				>
					{#if analysis.status === 'running' || analysis.status === 'pending'}
						<Loader2 class="-ml-0.5 mr-1.5 h-3 w-3 animate-spin" />
					{:else if analysis.status === 'reconnecting'}
						<RefreshCw class="-ml-0.5 mr-1.5 h-3 w-3 animate-pulse" />
					{:else if analysis.status === 'connection_lost'}
						<AlertCircle class="-ml-0.5 mr-1.5 h-3 w-3" />
					{:else if analysis.status === 'completed'}
						<CheckCircle class="-ml-0.5 mr-1.5 h-3 w-3" />
					{:else if analysis.status === 'interrupted'}
						<Pause class="-ml-0.5 mr-1.5 h-3 w-3" />
					{/if}
					<span class="capitalize"
						>{analysis.status === 'completed'
							? 'Completed'
							: analysis.status === 'cancelled'
								? 'Cancelled'
								: analysis.status === 'interrupted'
									? 'Interrupted'
									: analysis.status === 'reconnecting'
										? 'Reconnecting...'
										: analysis.status === 'connection_lost'
											? 'Connection Lost'
											: analysis.status || 'unknown'}</span
					>
				</div>
			</div>

			<!-- Info -->
			<div class="text-gray-500 {compact ? 'mt-0.5 text-xs' : 'mt-1 text-sm'}">
				<div class="flex items-center">
					<File class="mr-1 h-3 w-3" />
					<span class="truncate">{file ? file.filename : 'Unknown file'}</span>
				</div>

				<div class="mt-0.5 flex items-center">
					<Clock class="mr-1 h-3 w-3" />
					<span class="text-gray-600">
						{#if analysis.status === 'completed'}
							Completed {formatDate(analysis.completedAt || analysis.createdAt)}
						{:else}
							Created {formatDate(analysis.createdAt)}
						{/if}
					</span>
				</div>
			</div>

			<!-- Preview (only in full mode) -->
			{#if !compact && resultPreview}
				<div class="mt-3 rounded border border-gray-100 bg-gray-50 p-2 text-sm">
					{#if resultPreview.type === 'selection'}
						<div class="font-medium text-purple-700">
							{resultPreview.text}
						</div>
					{:else if resultPreview.type === 'hypothesis'}
						<div
							class="{resultPreview.significant ? 'text-green-700' : 'text-orange-700'} font-medium"
						>
							{resultPreview.text}
						</div>
					{:else}
						<div class="text-gray-700">
							{resultPreview.text}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Actions (only in full mode) -->
	{#if !compact}
		<div class="actions mt-3 flex justify-end gap-2">
			<!-- View button - always available -->
			<button
				on:click|stopPropagation={viewAnalysis}
				class="inline-flex items-center rounded bg-blue-100 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200"
			>
				<Eye class="mr-1 h-3 w-3" />
				View
			</button>

			<!-- Cancel button - only for pending/running analyses -->
			{#if ['pending', 'running', 'mounting', 'processing', 'saving'].includes(analysis.status)}
				<button
					on:click|stopPropagation={cancelAnalysis}
					class="inline-flex items-center rounded bg-orange-100 px-2.5 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-200"
					title="Cancel this analysis"
				>
					<XCircle class="mr-1 h-3 w-3" />
					Cancel
				</button>
			{/if}

			<!-- Export button - only for completed analyses -->
			{#if analysis.status === 'completed'}
				<button
					on:click|stopPropagation={exportAnalysis}
					class="inline-flex items-center rounded bg-green-100 px-2.5 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-200"
				>
					<Download class="mr-1 h-3 w-3" />
					Export
				</button>
			{/if}

			<!-- Re-run button - for interrupted and connection_lost analyses -->
			{#if analysis.status === 'interrupted' || analysis.status === 'connection_lost'}
				<button
					on:click|stopPropagation={rerunAnalysis}
					class="inline-flex items-center rounded px-2.5 py-1.5 text-xs font-medium transition-colors {analysis.status === 'connection_lost' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}"
					title="Re-run this {analysis.status === 'connection_lost' ? 'disconnected' : 'interrupted'} analysis"
				>
					<RefreshCw class="mr-1 h-3 w-3" />
					Re-run
				</button>
			{/if}

			<!-- Delete button - for completed/error/cancelled/interrupted/connection_lost analyses -->
			{#if ['completed', 'error', 'cancelled', 'interrupted', 'connection_lost'].includes(analysis.status)}
				<button
					on:click|stopPropagation={deleteAnalysis}
					class="inline-flex items-center rounded bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
					title="Delete this analysis"
				>
					<Trash2 class="mr-1 h-3 w-3" />
					Delete
				</button>
			{/if}
		</div>
	{/if}
</div>
