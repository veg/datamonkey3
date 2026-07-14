<script>
	import { onMount } from 'svelte';
	import { persistentFileStore, currentFile } from '../stores/fileInfo';
	import { analysisStore } from '../stores/analyses';
	import FileCard from './FileCard.svelte';
	import { Search, Trash2, Loader2, File } from '$lib/icons';
	import { trackEvent } from './utils/analytics.js';

	// Props
	export let onSelectFile = () => {};

	// Local state
	let filePreviews = new Map();
	let expandedFiles = new Set();
	let sortBy = 'date';
	let sortDirection = 'desc';
	let filterText = '';
	let isLoading = true;
	let isClearingFiles = false;

	// Computed properties
	$: sortedFiles = sortFiles($persistentFileStore.files, sortBy, sortDirection);
	$: filteredFiles = filterFiles(sortedFiles, filterText);

	// Load files on mount
	onMount(async () => {
		isLoading = true;
		try {
			await persistentFileStore.loadFiles();
			await loadFilePreviews();
		} catch (error) {
			console.error('Error loading files:', error);
		} finally {
			isLoading = false;
		}
	});

	// Load previews for all files
	async function loadFilePreviews() {
		for (const file of $persistentFileStore.files) {
			if (!filePreviews.has(file.id)) {
				try {
					const fileObj = await persistentFileStore.getFile(file.id);
					const preview = await generatePreview(fileObj);
					filePreviews.set(file.id, preview);
				} catch (error) {
					console.error(`Error loading preview for ${file.filename}:`, error);
					filePreviews.set(file.id, 'Preview unavailable');
				}
			}
		}
	}

	// Generate a preview of the file contents
	async function generatePreview(fileObj) {
		try {
			const text = await fileObj.text();
			// Show first few lines
			const lines = text.split('\n').slice(0, 5);
			return lines.join('\n');
		} catch (error) {
			console.error('Error generating preview:', error);
			return 'Preview unavailable';
		}
	}

	// Sort files based on selected criteria
	function sortFiles(files, sortBy, direction) {
		if (!files || !files.length) return [];

		return [...files].sort((a, b) => {
			let comparison = 0;

			switch (sortBy) {
				case 'name':
					comparison = (a.filename || '').localeCompare(b.filename || '');
					break;
				case 'size':
					comparison = (a.size || 0) - (b.size || 0);
					break;
				case 'date':
				default:
					comparison = (a.createdAt || 0) - (b.createdAt || 0);
					break;
			}

			return direction === 'desc' ? -comparison : comparison;
		});
	}

	// Filter files by name
	function filterFiles(files, filterText) {
		if (!filterText) return files;

		const search = filterText.toLowerCase();
		return files.filter((file) => (file.filename || '').toLowerCase().includes(search));
	}

	// Change sort criteria
	function changeSorting(criteria) {
		if (sortBy === criteria) {
			// Toggle direction if clicking the same criteria
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			// Default to descending for new criteria
			sortBy = criteria;
			sortDirection = 'desc';
		}
	}

	// Toggle file details visibility
	function toggleFileDetails(fileId) {
		if (expandedFiles.has(fileId)) {
			expandedFiles.delete(fileId);
		} else {
			expandedFiles.add(fileId);
		}
		expandedFiles = expandedFiles; // Trigger reactivity
	}

	// Handle file selection
	async function selectFile(fileId) {
		try {
			// Set the current file in the store
			persistentFileStore.setCurrentFile(fileId);

			// Notify that file was selected, but don't trigger a re-analysis
			// by passing an event with a special flag
			const file = await persistentFileStore.getFile(fileId);

			// Create a custom event object that indicates this is a selection, not an upload
			onSelectFile({
				isSelection: true,
				fileId: fileId,
				file: file
			});
		} catch (error) {
			console.error('Error selecting file:', error);
		}
	}

	// Handle file deletion
	async function deleteFile(fileId) {
		try {
			// First delete any analyses associated with this file
			const fileAnalyses = $analysisStore.analyses.filter((a) => a.fileId === fileId);
			for (const analysis of fileAnalyses) {
				await analysisStore.deleteAnalysis(analysis.id);
			}

			// Then delete the file
			await persistentFileStore.deleteFile(fileId);

			// Track single file deletion
			trackEvent('file-deleted', { fileCount: 1 });

			// Remove from previews map
			filePreviews.delete(fileId);
			filePreviews = filePreviews; // Trigger reactivity
		} catch (error) {
			console.error('Error deleting file:', error);
		}
	}

	// Handle clearing all files
	async function clearAllFiles() {
		try {
			if (
				confirm(
					'Are you sure you want to delete ALL files and their analyses? This cannot be undone.'
				)
			) {
				// Get all file IDs
				const fileIds = $persistentFileStore.files.map((file) => file.id);
				const fileCount = fileIds.length;

				// Show a loading state specifically for clearing
				isClearingFiles = true;

				// Process deletions in smaller batches to avoid timeouts
				const batchSize = 5;
				for (let i = 0; i < fileIds.length; i += batchSize) {
					const batch = fileIds.slice(i, i + batchSize);

					// Process each batch in parallel
					await Promise.all(
						batch.map(async (fileId) => {
							try {
								// Delete analyses for this file
								const fileAnalyses = $analysisStore.analyses.filter((a) => a.fileId === fileId);
								await Promise.all(
									fileAnalyses.map((analysis) =>
										analysisStore
											.deleteAnalysis(analysis.id)
											.catch((err) => console.error(`Error deleting analysis ${analysis.id}:`, err))
									)
								);

								// Delete the file
								await persistentFileStore.deleteFile(fileId);
							} catch (error) {
								console.error(`Error deleting file ${fileId}:`, error);
								// Continue with other files even if one fails
							}
						})
					);

					// Small delay between batches to prevent overwhelming the system
					if (i + batchSize < fileIds.length) {
						await new Promise((resolve) => setTimeout(resolve, 100));
					}
				}

				// Clear the previews map
				filePreviews = new Map();

				// Force a reload of files
				await persistentFileStore.loadFiles();

				// Clear the current file
				persistentFileStore.setCurrentFile(null);

				// Track bulk file deletion
				trackEvent('file-deleted', { fileCount });

				isClearingFiles = false;
			}
		} catch (error) {
			console.error('Error clearing all files:', error);
			isClearingFiles = false;
			alert('An error occurred while clearing files. Some files may not have been deleted.');
		}
	}
</script>

<div class="file-manager">
	<div class="mb-3 sm:mb-premium-md">
		<div class="mb-2 flex items-center justify-between sm:mb-premium-sm">
			<h2 class="text-base font-semibold text-text-rich sm:text-premium-header">Saved Files</h2>

			<!-- Clear All Files button -->
			{#if $persistentFileStore.files.length > 0}
				<button
					on:click={clearAllFiles}
					disabled={isClearingFiles}
					class="flex min-h-[40px] items-center rounded-lg bg-accent-warm px-2.5 py-1.5 text-xs font-medium text-white transition-all duration-premium hover:bg-accent-copper focus:outline-none focus:ring-2 focus:ring-accent-warm focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[44px] sm:rounded-premium-sm sm:px-3 sm:py-2 sm:text-sm"
					title={isClearingFiles ? 'Clearing files...' : 'Delete all files and their analyses'}
				>
					{#if isClearingFiles}
						<Loader2 class="mr-1 h-4 w-4 animate-spin" />
					{:else}
						<Trash2 class="mr-1 h-4 w-4" />
					{/if}
					{isClearingFiles ? 'Clearing...' : 'Clear All Files'}
				</button>
			{/if}
		</div>

		<div class="mb-3 flex flex-col gap-2 sm:mb-premium-sm sm:flex-row sm:items-center">
			<!-- Search input -->
			<div class="relative flex-grow">
				<input
					type="text"
					placeholder="Search files..."
					bind:value={filterText}
					class="min-h-[44px] w-full rounded-lg border border-border-platinum py-2 pl-10 pr-3 text-sm focus:border-brand-royal focus:outline-none focus:ring-2 focus:ring-brand-royal sm:rounded-premium-sm"
				/>
				<Search class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-silver" />
			</div>

			<!-- Sort options -->
			<div
				class="flex flex-shrink-0 overflow-hidden rounded-lg border border-border-platinum text-xs sm:rounded-premium-sm sm:text-sm"
			>
				<button
					class="min-h-[40px] flex-1 px-2 py-2 transition-all duration-premium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-royal sm:min-h-[44px] sm:flex-none sm:px-3"
					class:bg-brand-royal={sortBy === 'name'}
					class:text-white={sortBy === 'name'}
					class:text-text-slate={sortBy !== 'name'}
					class:hover:bg-brand-whisper={sortBy !== 'name'}
					class:hover:text-brand-royal={sortBy !== 'name'}
					on:click={() => changeSorting('name')}
				>
					Name {sortBy === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
				</button>
				<button
					class="min-h-[40px] flex-1 border-l border-border-platinum px-2 py-2 transition-all duration-premium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-royal sm:min-h-[44px] sm:flex-none sm:px-3"
					class:bg-brand-royal={sortBy === 'size'}
					class:text-white={sortBy === 'size'}
					class:text-text-slate={sortBy !== 'size'}
					class:hover:bg-brand-whisper={sortBy !== 'size'}
					class:hover:text-brand-royal={sortBy !== 'size'}
					on:click={() => changeSorting('size')}
				>
					Size {sortBy === 'size' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
				</button>
				<button
					class="min-h-[40px] flex-1 border-l border-border-platinum px-2 py-2 transition-all duration-premium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-royal sm:min-h-[44px] sm:flex-none sm:px-3"
					class:bg-brand-royal={sortBy === 'date'}
					class:text-white={sortBy === 'date'}
					class:text-text-slate={sortBy !== 'date'}
					class:hover:bg-brand-whisper={sortBy !== 'date'}
					class:hover:text-brand-royal={sortBy !== 'date'}
					on:click={() => changeSorting('date')}
				>
					Date {sortBy === 'date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
				</button>
			</div>
		</div>
	</div>

	<!-- File list -->
	<div
		class="files-container relative max-h-96 overflow-y-auto rounded-premium border border-border-platinum"
	>
		{#if isClearingFiles}
			<!-- Loading overlay while clearing files -->
			<div class="absolute inset-0 z-10 flex items-center justify-center bg-white bg-opacity-90">
				<div class="text-center">
					<Loader2 class="mx-auto mb-2 h-8 w-8 animate-spin text-accent-warm" />
					<p class="text-premium-body text-text-slate">Clearing all files...</p>
					<p class="mt-1 text-premium-meta text-text-silver">This may take a moment</p>
				</div>
			</div>
		{/if}

		{#if isLoading}
			<div class="flex items-center justify-center p-premium-md text-text-slate">
				<Loader2 class="mr-premium-sm h-5 w-5 animate-spin text-brand-royal" />
				<span class="text-premium-body">Loading files...</span>
			</div>
		{:else if filteredFiles.length === 0}
			<div class="flex flex-col items-center justify-center p-premium-xl text-center">
				{#if filterText}
					<!-- No search results state -->
					<div class="mb-premium-md rounded-full bg-brand-whisper p-premium-md">
						<Search class="h-8 w-8 text-brand-muted" />
					</div>
					<p class="text-premium-body font-medium text-text-rich">No matching files</p>
					<p class="mt-premium-xs text-premium-meta text-text-silver">
						Try adjusting your search term
					</p>
				{:else}
					<!-- Empty state with illustration -->
					<div class="mb-premium-md rounded-full bg-brand-ghost p-premium-lg">
						<File class="h-10 w-10 text-brand-muted" />
					</div>
					<p class="text-premium-body font-semibold text-text-rich">No saved files yet</p>
					<p class="mt-premium-xs max-w-xs text-premium-meta text-text-silver">
						Upload a sequence file or try a sample file above to begin your analysis
					</p>
				{/if}
			</div>
		{:else}
			{#each filteredFiles as file (file.id)}
				<FileCard
					{file}
					isActive={file.id === $currentFile?.id}
					showDetails={expandedFiles.has(file.id)}
					preview={filePreviews.get(file.id)}
					on:select={({ detail }) => selectFile(detail.id)}
					on:delete={({ detail }) => deleteFile(detail.id)}
				/>
			{/each}
		{/if}
	</div>
</div>
