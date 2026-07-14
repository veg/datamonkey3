<!-- src/lib/ExportPanel.svelte -->
<script>
	import { exportData } from './utils/exportUtils';
	import { analysisStore } from '../stores/analyses';
	import { persistentFileStore } from '../stores/fileInfo';
	import LogDownloader from './LogDownloader.svelte';
	import { ChevronUp, ChevronDown, Download } from '$lib/icons';
	import { trackEvent } from './utils/analytics.js';

	// Props
	export let analysisId;

	// Internal state
	let analysis = null;
	let file = null;
	let showExportOptions = false;
	let exportStatus = '';
	let showPreview = false;
	let previewContent = '';
	let includeMetadata = true;
	let exportFilename = '';

	// Load analysis data
	$: if (analysisId) {
		loadAnalysisData(analysisId);
	}

	async function loadAnalysisData(id) {
		try {
			// Get analysis details
			analysis = $analysisStore.analyses.find((a) => a.id === id);

			if (!analysis) {
				analysis = await analysisStore.getAnalysis(id);
			}

			if (!analysis) {
				throw new Error('Analysis not found');
			}

			// Get associated file
			file = $persistentFileStore.files.find((f) => f.id === analysis.fileId);

			// Generate default filename
			updateExportFilename();
		} catch (error) {
			console.error('Error loading analysis data:', error);
		}
	}

	// Update export filename when analysis changes
	$: if (analysis) {
		updateExportFilename();
	}

	function updateExportFilename() {
		if (!analysis) return;

		const method = analysis.method.toUpperCase();
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
		exportFilename = `${method}_analysis_${timestamp}.json`;
	}

	// Toggle export options
	function toggleExportOptions() {
		showExportOptions = !showExportOptions;

		// Generate preview if options are shown
		if (showExportOptions && analysis) {
			generatePreview();
		}
	}

	// Generate preview of export content
	async function generatePreview() {
		if (!analysis) return;

		try {
			// Parse the analysis result if needed
			let resultData;
			try {
				resultData =
					typeof analysis.result === 'string' ? JSON.parse(analysis.result) : analysis.result;
			} catch (e) {
				resultData = { error: 'Could not parse results', raw: analysis.result };
			}

			// Add metadata if needed
			if (includeMetadata) {
				resultData = addMetadata(resultData);
			}

			previewContent = JSON.stringify(resultData, null, 2);

			// Truncate preview for display
			if (previewContent.length > 2000) {
				previewContent = previewContent.substring(0, 2000) + '...\n[Content truncated for preview]';
			}
		} catch (error) {
			console.error('Error generating preview:', error);
			previewContent = 'Error generating preview: ' + error.message;
		}
	}

	// Add metadata to export
	function addMetadata(data) {
		if (!data || typeof data !== 'object') return data;

		return {
			...data,
			exportMetadata: {
				analysisId: analysis.id,
				method: analysis.method,
				createdAt: analysis.createdAt,
				completedAt: analysis.completedAt,
				filename: file?.filename || 'Unknown file',
				exportDate: new Date().toISOString()
			}
		};
	}

	// Export analysis results
	async function exportAnalysisResults() {
		if (!analysis) return;

		try {
			// Parse the analysis result if needed
			let resultData;
			try {
				resultData =
					typeof analysis.result === 'string' ? JSON.parse(analysis.result) : analysis.result;
			} catch (e) {
				resultData = { error: 'Could not parse results', raw: analysis.result };
			}

			// Add metadata if requested
			if (includeMetadata) {
				resultData = addMetadata(resultData);
			}

			// Export the data as JSON
			exportData(resultData, exportFilename, 'json');

			// Track results export
			trackEvent('results-exported', {
				method: analysis?.method || 'unknown',
				format: 'json'
			});

			// Show success message
			exportStatus = 'Exported successfully';
			setTimeout(() => {
				exportStatus = '';
			}, 3000);
		} catch (error) {
			console.error('Error exporting results:', error);
			exportStatus = 'Export failed';
			setTimeout(() => {
				exportStatus = '';
			}, 3000);
		}
	}

	// Toggle preview
	function togglePreview() {
		showPreview = !showPreview;
		if (showPreview) {
			generatePreview();
		}
	}

	// Watch for metadata inclusion changes
	$: if (includeMetadata !== undefined && showPreview) {
		generatePreview();
	}
</script>

<div class="export-panel mb-4 rounded-lg border border-border-subtle bg-white shadow-md">
	<div class="flex items-center justify-between border-b border-border-subtle p-4">
		<h3 class="text-lg font-semibold">Export</h3>
		<button
			on:click={toggleExportOptions}
			class="rounded-full p-1 text-text-silver hover:bg-surface-sunken"
			aria-label={showExportOptions ? 'Hide export options' : 'Show export options'}
		>
			{#if showExportOptions}
				<ChevronUp class="h-5 w-5" />
			{:else}
				<ChevronDown class="h-5 w-5" />
			{/if}
		</button>
	</div>

	{#if showExportOptions}
		<div class="p-4">
			<!-- Export options -->
			<div class="mb-4 rounded-lg border border-border-subtle p-3">
				<!-- Filename input -->
				<div class="mb-3">
					<label class="mb-1 block text-sm font-medium">Filename</label>
					<input
						type="text"
						bind:value={exportFilename}
						class="w-full rounded border border-border-subtle p-2 text-sm"
					/>
				</div>

				<!-- Include metadata checkbox -->
				<div class="mb-3">
					<label class="flex items-center">
						<input
							type="checkbox"
							bind:checked={includeMetadata}
							class="mr-2 h-4 w-4 rounded border-border-subtle text-brand-royal"
						/>
						<span class="text-sm">Include metadata (timestamps, analysis info)</span>
					</label>
				</div>

				<!-- Preview toggle -->
				<div>
					<button on:click={togglePreview} class="text-sm text-brand-royal hover:text-brand-deep">
						{showPreview ? 'Hide Preview' : 'Show Preview'}
					</button>
				</div>
			</div>

			<!-- Preview section -->
			{#if showPreview}
				<div class="mb-4">
					<h4 class="mb-2 font-medium">Preview</h4>
					<div class="max-h-60 overflow-auto rounded border border-border-subtle bg-surface-raised p-3">
						<pre class="text-xs">{previewContent}</pre>
					</div>
					<p class="mt-1 text-xs text-text-silver">Preview shows up to 2000 characters</p>
				</div>
			{/if}

			<!-- Action buttons -->
			<div class="export-actions flex flex-wrap gap-2">
				<button
					on:click={exportAnalysisResults}
					class="flex items-center rounded bg-brand-royal px-4 py-2 font-semibold text-white hover:bg-brand-deep focus:outline-none focus:ring-2 focus:ring-brand-royal focus:ring-offset-2"
					disabled={!analysis}
				>
					<Download class="mr-2 h-5 w-5" />
					Download JSON
				</button>

				<!-- Log Downloader dropdown -->
				<LogDownloader {analysisId} />

				{#if exportStatus}
					<span class="ml-2 self-center text-sm font-medium text-status-success">{exportStatus}</span>
				{/if}
			</div>
		</div>
	{/if}
</div>
