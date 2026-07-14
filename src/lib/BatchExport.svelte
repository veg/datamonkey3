<script>
	import { onMount } from 'svelte';
	import { analysisStore } from '../stores/analyses';
	import { persistentFileStore } from '../stores/fileInfo';
	import JSZip from 'jszip';
	import { Loader2, Download, FileArchive } from 'lucide-svelte';
	import { trackEvent } from './utils/analytics.js';

	// Internal state
	let analyses = [];
	let files = [];
	let selectedAnalyses = new Set();
	let isExporting = false;
	let exportStatus = '';
	let isSelectAll = false;
	let filterMethod = 'all';
	let filterFile = 'all';
	let availableMethods = ['all'];
	let availableFiles = ['all'];

	// Load analyses on mount
	onMount(async () => {
		await loadAnalyses();
	});

	// Load analyses
	async function loadAnalyses() {
		try {
			// Load analyses and files if needed
			if ($analysisStore.analyses.length === 0) {
				await analysisStore.loadAnalyses();
			}

			if ($persistentFileStore.files.length === 0) {
				await persistentFileStore.loadFiles();
			}

			// Get completed analyses (excluding datareader)
			analyses = $analysisStore.analyses
				.filter((a) => a.status === 'completed' && a.method !== 'datareader')
				.sort((a, b) => b.createdAt - a.createdAt);

			files = $persistentFileStore.files;

			// Build available filters
			availableMethods = ['all', ...new Set(analyses.map((a) => a.method))];

			const fileIds = new Set(analyses.map((a) => a.fileId));
			const fileOptions = files
				.filter((f) => fileIds.has(f.id))
				.map((f) => ({ id: f.id, name: f.filename }));

			availableFiles = [{ id: 'all', name: 'All Files' }, ...fileOptions];
		} catch (error) {
			console.error('Error loading analyses for batch export:', error);
		}
	}

	// Filter analyses based on selected filters
	$: filteredAnalyses = analyses.filter((analysis) => {
		const methodMatch = filterMethod === 'all' || analysis.method === filterMethod;
		const fileMatch = filterFile === 'all' || analysis.fileId === filterFile;
		return methodMatch && fileMatch;
	});

	// Toggle select all
	function toggleSelectAll() {
		if (isSelectAll) {
			selectedAnalyses = new Set();
		} else {
			selectedAnalyses = new Set(filteredAnalyses.map((a) => a.id));
		}
		isSelectAll = !isSelectAll;
	}

	// Toggle selection for an analysis
	function toggleSelection(analysisId) {
		if (selectedAnalyses.has(analysisId)) {
			selectedAnalyses.delete(analysisId);
		} else {
			selectedAnalyses.add(analysisId);
		}
		selectedAnalyses = selectedAnalyses;

		isSelectAll =
			filteredAnalyses.length > 0 && filteredAnalyses.every((a) => selectedAnalyses.has(a.id));
	}

	// Format date for display
	function formatDate(timestamp) {
		if (!timestamp) return 'Unknown';
		return new Date(timestamp).toLocaleString();
	}

	// Get file name for an analysis
	function getFileName(fileId) {
		const file = files.find((f) => f.id === fileId);
		return file ? file.filename : 'Unknown file';
	}

	// Get base filename without extension
	function getBaseFileName(fileId) {
		const filename = getFileName(fileId);
		return filename.replace(/\.[^/.]+$/, '');
	}

	// Export selected analyses as a ZIP file
	async function exportSelectedAnalyses() {
		if (selectedAnalyses.size === 0) return;

		// Track batch export start
		trackEvent('batch-export-started', { analysisCount: selectedAnalyses.size });

		isExporting = true;
		exportStatus = 'Preparing export...';

		try {
			const zip = new JSZip();
			const analysesToExport = analyses.filter((a) => selectedAnalyses.has(a.id));

			if (analysesToExport.length === 0) {
				exportStatus = 'No analyses selected';
				return;
			}

			exportStatus = `Exporting ${analysesToExport.length} analyses...`;

			// Add each analysis as a JSON file in the zip
			for (const analysis of analysesToExport) {
				const fullAnalysis = await analysisStore.getAnalysis(analysis.id);
				const baseFileName = getBaseFileName(analysis.fileId);
				const method = analysis.method.toUpperCase();
				const timestamp = new Date(analysis.createdAt)
					.toISOString()
					.replace(/[:.]/g, '-')
					.substring(0, 19);

				// Parse the result if it's a string
				let resultData;
				try {
					resultData =
						typeof fullAnalysis.result === 'string'
							? JSON.parse(fullAnalysis.result)
							: fullAnalysis.result;
				} catch {
					resultData = fullAnalysis.result;
				}

				const filename = `${baseFileName}_${method}_${timestamp}.json`;
				zip.file(filename, JSON.stringify(resultData, null, 2));
			}

			// Generate the zip file
			const zipBlob = await zip.generateAsync({ type: 'blob' });

			// Create download link
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
			const zipFilename = `analysis_results_${timestamp}.zip`;

			const url = URL.createObjectURL(zipBlob);
			const a = document.createElement('a');
			a.href = url;
			a.download = zipFilename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			exportStatus = `Exported ${analysesToExport.length} analyses to ${zipFilename}`;
			setTimeout(() => {
				exportStatus = '';
			}, 5000);
		} catch (error) {
			console.error('Error exporting analyses:', error);
			exportStatus = `Export failed: ${error.message}`;
		} finally {
			isExporting = false;
		}
	}
</script>

<div class="batch-export">
	<!-- Filter controls -->
	<div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div>
			<label class="mb-1 block text-sm font-medium">Method:</label>
			<select
				bind:value={filterMethod}
				class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
			>
				{#each availableMethods as method}
					<option value={method}>{method === 'all' ? 'All Methods' : method.toUpperCase()}</option>
				{/each}
			</select>
		</div>

		<div>
			<label class="mb-1 block text-sm font-medium">File:</label>
			<select
				bind:value={filterFile}
				class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
			>
				{#if Array.isArray(availableFiles)}
					{#each availableFiles as fileOption}
						<option value={fileOption.id}>{fileOption.name}</option>
					{/each}
				{:else}
					<option value="all">All Files</option>
				{/if}
			</select>
		</div>
	</div>

	<!-- Analysis selection table -->
	<div class="mb-4">
		<div class="mb-2 flex items-center justify-between">
			<h4 class="font-medium">Select Analyses to Export</h4>
			<label class="flex cursor-pointer items-center text-sm">
				<input type="checkbox" checked={isSelectAll} on:change={toggleSelectAll} class="mr-1" />
				Select All
			</label>
		</div>

		<div class="max-h-64 overflow-y-auto rounded border border-border-subtle">
			{#if filteredAnalyses.length === 0}
				<p class="p-3 text-center text-sm text-text-silver">
					No completed analyses available for export
				</p>
			{:else}
				<table class="w-full table-auto text-sm">
					<thead class="sticky top-0 bg-surface-sunken">
						<tr>
							<th class="w-10 p-2"></th>
							<th class="p-2 text-left">Method</th>
							<th class="p-2 text-left">File</th>
							<th class="p-2 text-left">Date</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredAnalyses as analysis (analysis.id)}
							<tr
								class="cursor-pointer border-t border-border-subtle hover:bg-surface-raised"
								on:click={() => toggleSelection(analysis.id)}
							>
								<td class="p-2 text-center">
									<input
										type="checkbox"
										checked={selectedAnalyses.has(analysis.id)}
										on:change={() => toggleSelection(analysis.id)}
										on:click|stopPropagation
										class="h-4 w-4 cursor-pointer"
									/>
								</td>
								<td class="p-2 font-medium">{analysis.method.toUpperCase()}</td>
								<td class="truncate p-2">{getFileName(analysis.fileId)}</td>
								<td class="p-2 text-text-slate">{formatDate(analysis.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<p class="mt-1 text-right text-sm text-text-slate">
			{selectedAnalyses.size} of {filteredAnalyses.length} analyses selected
		</p>
	</div>

	<!-- Export button -->
	<div class="export-actions flex items-center gap-3">
		<button
			on:click={exportSelectedAnalyses}
			disabled={selectedAnalyses.size === 0 || isExporting}
			class="flex items-center rounded bg-brand-royal px-4 py-2 font-medium text-white hover:bg-brand-deep disabled:bg-surface-sunken disabled:text-text-silver"
		>
			{#if isExporting}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				Exporting...
			{:else}
				<FileArchive class="mr-2 h-4 w-4" />
				Download as ZIP
			{/if}
		</button>

		{#if exportStatus}
			<p
				class="text-sm"
				class:text-green-600={!exportStatus.includes('failed')}
				class:text-red-600={exportStatus.includes('failed')}
			>
				{exportStatus}
			</p>
		{/if}
	</div>

	<p class="mt-3 text-xs text-text-silver">
		Each analysis will be exported as a separate JSON file in the ZIP archive.
	</p>
</div>
