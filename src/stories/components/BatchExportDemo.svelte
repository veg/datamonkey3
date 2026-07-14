<script>
	import { Loader2, FileArchive } from 'lucide-svelte';

	// Props - mock data passed in directly
	export let analyses = [];
	export let files = [];

	// Internal state
	let selectedAnalyses = new Set();
	let isExporting = false;
	let exportStatus = '';
	let isSelectAll = false;
	let filterMethod = 'all';
	let filterFile = 'all';

	// Build available filters (excluding datareader)
	$: filteredInputAnalyses = analyses.filter((a) => a.method !== 'datareader');
	$: availableMethods = ['all', ...new Set(filteredInputAnalyses.map((a) => a.method))];
	$: {
		const fileIds = new Set(filteredInputAnalyses.map((a) => a.fileId));
		const fileOptions = files
			.filter((f) => fileIds.has(f.id))
			.map((f) => ({ id: f.id, name: f.filename }));
		availableFiles = [{ id: 'all', name: 'All Files' }, ...fileOptions];
	}

	let availableFiles = [{ id: 'all', name: 'All Files' }];

	// Filter analyses based on selected filters
	$: filteredAnalyses = filteredInputAnalyses.filter((analysis) => {
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

	// Mock export function
	async function exportSelectedAnalyses() {
		if (selectedAnalyses.size === 0) return;

		isExporting = true;
		exportStatus = 'Preparing export...';

		// Simulate export delay
		await new Promise((resolve) => setTimeout(resolve, 1000));

		exportStatus = `Exported ${selectedAnalyses.size} analyses to analysis_results.zip`;
		isExporting = false;

		setTimeout(() => {
			exportStatus = '';
		}, 5000);
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
