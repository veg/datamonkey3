<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { persistentFileStore } from '../stores/fileInfo';
	import { isStaleRun } from './utils/fileIdentity.js';
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

	// A same-name re-upload replaces a file's contents in place and keeps its id, so every earlier
	// run stays filed under a name that now means different bytes. Nothing distinguished them.
	$: staleRun = isStaleRun(analysis, file);

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
		dispatch('rerun', {
			analysisId: analysis.id,
			method: analysis.method,
			fileId: analysis.fileId
		});
	}
</script>

<div
	data-testid="analysis-card"
	class="analysis-card mb-3 rounded-premium border transition-all duration-200 {compact
		? 'p-3'
		: 'p-4'} {selected
		? 'border-brand-royal bg-brand-whisper shadow-sm'
		: 'border-border-platinum bg-white hover:border-border-subtle hover:shadow-sm'}"
	on:click={selectCard}
>
	<div class="flex items-start">
		<!-- Method and status -->
		<div
			class="mr-3 {compact
				? 'h-8 w-8'
				: 'h-10 w-10'} flex flex-shrink-0 items-center justify-center rounded-premium-sm bg-brand-whisper text-brand-royal"
		>
			<span class="font-mono {compact ? 'text-[9px]' : 'text-[10px]'} font-bold leading-none">
				{getMethodCode(analysis.method)}
			</span>
		</div>

		<div class="flex-grow">
			<!-- Header -->
			<div class="flex items-start justify-between">
				<h3 class="font-medium {compact ? 'text-premium-body' : 'text-premium-brand'}">
					{analysis.method ? analysis.method.toUpperCase() : 'Unknown'} Analysis
				</h3>

				<!-- Status badge -->
				<div
					class="{compact
						? 'text-premium-caption'
						: 'text-premium-meta'} inline-flex items-center rounded-full px-2 py-0.5"
					class:bg-status-success-bg={analysis.status === 'completed'}
					class:text-status-success-text={analysis.status === 'completed'}
					class:bg-status-warning-bg={analysis.status === 'running' ||
						analysis.status === 'pending' ||
						analysis.status === 'connection_lost'}
					class:text-status-warning-text={analysis.status === 'running' ||
						analysis.status === 'pending' ||
						analysis.status === 'connection_lost'}
					class:bg-status-error-bg={analysis.status === 'error'}
					class:text-status-error-text={analysis.status === 'error'}
					class:bg-accent-cream={analysis.status === 'cancelled' ||
						analysis.status === 'interrupted'}
					class:text-accent-copper={analysis.status === 'cancelled' ||
						analysis.status === 'interrupted'}
					class:bg-status-info-bg={analysis.status === 'reconnecting'}
					class:text-status-info-text={analysis.status === 'reconnecting'}
					class:bg-surface-sunken={![
						'completed',
						'running',
						'pending',
						'error',
						'cancelled',
						'interrupted',
						'reconnecting',
						'connection_lost'
					].includes(analysis.status)}
					class:text-slate={![
						'completed',
						'running',
						'pending',
						'error',
						'cancelled',
						'interrupted',
						'reconnecting',
						'connection_lost'
					].includes(analysis.status)}
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
			<div class="text-slate {compact ? 'mt-0.5 text-premium-caption' : 'mt-1 text-premium-meta'}">
				<div class="flex items-center">
					<File class="mr-1 h-3 w-3" />
					<span class="truncate">{file ? file.filename : 'Unknown file'}</span>
				</div>

				{#if staleRun}
					<div
						class="mt-0.5 flex items-center text-status-warning-text"
						data-testid="stale-run-badge"
					>
						<AlertCircle class="mr-1 h-3 w-3 flex-shrink-0" />
						<span>Run on an earlier version of this file</span>
					</div>
				{/if}

				<div class="mt-0.5 flex items-center">
					<Clock class="mr-1 h-3 w-3" />
					<span class="text-silver">
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
				<div
					class="mt-3 rounded-premium-sm border border-border-platinum bg-surface-raised p-2 text-premium-meta"
				>
					{#if resultPreview.type === 'selection'}
						<div class="font-medium text-brand-royal">
							{resultPreview.text}
						</div>
					{:else if resultPreview.type === 'hypothesis'}
						<div
							class="{resultPreview.significant
								? 'text-status-success-text'
								: 'text-status-warning-text'} font-medium"
						>
							{resultPreview.text}
						</div>
					{:else}
						<div class="text-slate">
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
				class="inline-flex items-center rounded-premium-sm bg-brand-royal px-2.5 py-1.5 text-premium-caption font-medium text-white transition-colors hover:bg-brand-deep"
			>
				<Eye class="mr-1 h-3 w-3" />
				View
			</button>

			<!-- Cancel button - only for pending/running analyses -->
			{#if ['pending', 'running', 'mounting', 'processing', 'saving'].includes(analysis.status)}
				<button
					on:click|stopPropagation={cancelAnalysis}
					class="inline-flex items-center rounded-premium-sm bg-accent-cream px-2.5 py-1.5 text-premium-caption font-medium text-accent-copper transition-colors hover:bg-accent-soft"
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
					class="inline-flex items-center rounded-premium-sm bg-status-success-bg px-2.5 py-1.5 text-premium-caption font-medium text-status-success-text transition-colors hover:bg-status-success-border"
				>
					<Download class="mr-1 h-3 w-3" />
					Export
				</button>
			{/if}

			<!-- Re-run button - for any run that ended without results. 'error' was excluded, which left a
			     failed analysis with no way forward at all: no detail, no export, and nothing to click. -->
			{#if analysis.status === 'error' || analysis.status === 'interrupted' || analysis.status === 'connection_lost'}
				<button
					on:click|stopPropagation={rerunAnalysis}
					class="inline-flex items-center rounded-premium-sm px-2.5 py-1.5 text-premium-caption font-medium transition-colors {analysis.status ===
					'connection_lost'
						? 'bg-status-warning-bg text-status-warning-text hover:bg-status-warning-border'
						: 'bg-accent-cream text-accent-copper hover:bg-accent-soft'}"
					title="Re-run this {analysis.status === 'connection_lost'
						? 'disconnected'
						: 'interrupted'} analysis"
				>
					<RefreshCw class="mr-1 h-3 w-3" />
					Re-run
				</button>
			{/if}

			<!-- Delete button - for completed/error/cancelled/interrupted/connection_lost analyses -->
			{#if ['completed', 'error', 'cancelled', 'interrupted', 'connection_lost'].includes(analysis.status)}
				<button
					on:click|stopPropagation={deleteAnalysis}
					class="inline-flex items-center rounded-premium-sm bg-status-error-bg px-2.5 py-1.5 text-premium-caption font-medium text-status-error-text transition-colors hover:bg-status-error-border"
					title="Delete this analysis"
				>
					<Trash2 class="mr-1 h-3 w-3" />
					Delete
				</button>
			{/if}
		</div>
	{/if}
</div>
