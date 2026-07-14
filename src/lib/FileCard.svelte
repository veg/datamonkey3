<script>
	import { createEventDispatcher } from 'svelte';
	import { Dna, FileSpreadsheet, FileJson, FileCode, FileText, File, ChevronUp, ChevronDown, Trash2, Check } from '$lib/icons';

	// Props
	export let file = {};
	export let isActive = false;
	export let showDetails = false;
	export let preview = null;

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Map file extensions to Lucide icon components
	const fileIconMap = {
		// Sequence files - use Dna icon
		fasta: Dna,
		fa: Dna,
		fna: Dna,
		fastq: Dna,
		fq: Dna,
		nex: Dna,
		nexus: Dna,
		phy: Dna,
		phylip: Dna,
		// Tabular data
		csv: FileSpreadsheet,
		tsv: FileSpreadsheet,
		// Structured data
		json: FileJson,
		xml: FileCode,
		// Text
		txt: FileText
	};

	// Get file icon component based on extension
	function getFileIcon(filename) {
		const ext = filename?.split('.').pop()?.toLowerCase() || '';
		return fileIconMap[ext] || File;
	}

	// Format date for display
	function formatDate(timestamp) {
		if (!timestamp) return 'Unknown';

		const date = new Date(timestamp);
		const now = new Date();

		// Same day
		if (date.toDateString() === now.toDateString()) {
			return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		}

		// Yesterday
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (date.toDateString() === yesterday.toDateString()) {
			return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
		}

		// Within the last week
		const oneWeekAgo = new Date(now);
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
		if (date > oneWeekAgo) {
			const options = { weekday: 'long', hour: '2-digit', minute: '2-digit' };
			return date.toLocaleString([], options);
		}

		// Default date format
		return date.toLocaleString([], {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Format file size
	function formatFileSize(bytes) {
		if (!bytes) return 'Unknown';

		if (bytes < 1024) return bytes + ' B';
		else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	// Get file type color based on file type
	function getFileTypeColor(filename) {
		const fileExtension = filename ? filename.split('.').pop().toLowerCase() : '';

		// Define file type color categories
		const colorMap = {
			// Sequence files - warm copper/cream
			fasta: 'bg-accent-cream text-accent-copper',
			fa: 'bg-accent-cream text-accent-copper',
			fastq: 'bg-accent-cream text-accent-copper',
			fq: 'bg-accent-cream text-accent-copper',
			nex: 'bg-accent-cream text-accent-copper',
			nexus: 'bg-accent-cream text-accent-copper',
			phy: 'bg-accent-cream text-accent-copper',
			phylip: 'bg-accent-cream text-accent-copper',
			// Tabular - green tint
			csv: 'bg-green-100 text-green-700',
			tsv: 'bg-green-100 text-green-700',
			// Structured - blue/purple tints
			json: 'bg-blue-100 text-blue-700',
			xml: 'bg-purple-100 text-purple-700',
			// Text - neutral
			txt: 'bg-brand-whisper text-text-slate'
		};

		return colorMap[fileExtension] || 'bg-brand-whisper text-brand-royal';
	}

	// Get time ago string
	function getTimeAgo(timestamp) {
		if (!timestamp) return '';

		const now = new Date();
		const date = new Date(timestamp);
		const seconds = Math.floor((now - date) / 1000);

		let interval = Math.floor(seconds / 31536000);
		if (interval >= 1) {
			return interval === 1 ? '1 year ago' : `${interval} years ago`;
		}

		interval = Math.floor(seconds / 2592000);
		if (interval >= 1) {
			return interval === 1 ? '1 month ago' : `${interval} months ago`;
		}

		interval = Math.floor(seconds / 86400);
		if (interval >= 1) {
			return interval === 1 ? '1 day ago' : `${interval} days ago`;
		}

		interval = Math.floor(seconds / 3600);
		if (interval >= 1) {
			return interval === 1 ? '1 hour ago' : `${interval} hours ago`;
		}

		interval = Math.floor(seconds / 60);
		if (interval >= 1) {
			return interval === 1 ? '1 minute ago' : `${interval} minutes ago`;
		}

		return seconds < 10 ? 'just now' : `${Math.floor(seconds)} seconds ago`;
	}

	// Get file type label
	function getFileTypeLabel(filename, contentType) {
		if (!filename) return 'Unknown';

		const fileExtension = filename.split('.').pop().toLowerCase();

		const typeMap = {
			fasta: 'FASTA Sequence',
			fa: 'FASTA Sequence',
			fastq: 'FASTQ Sequence',
			fq: 'FASTQ Sequence',
			nex: 'NEXUS Format',
			nexus: 'NEXUS Format',
			phy: 'PHYLIP Format',
			phylip: 'PHYLIP Format',
			txt: 'Text File',
			csv: 'CSV Data',
			tsv: 'TSV Data',
			json: 'JSON Data',
			xml: 'XML Data'
		};

		return typeMap[fileExtension] || contentType || 'File';
	}

	// Get file type info based on the file
	$: FileIcon = getFileIcon(file.filename);
	$: fileTypeColor = getFileTypeColor(file.filename);
	$: fileTypeLabel = getFileTypeLabel(file.filename, file.contentType);
	$: timeAgo = getTimeAgo(file.createdAt);

	// Toggle details visibility
	function toggleDetails(event) {
		event.stopPropagation();
		showDetails = !showDetails;
	}

	// Select the file
	function selectFile() {
		dispatch('select', { id: file.id });
	}

	// Delete the file
	function deleteFile(event) {
		event.stopPropagation();
		if (confirm(`Are you sure you want to delete "${file.filename}"?`)) {
			dispatch('delete', { id: file.id });
		}
	}
</script>

<div
	class="file-card mb-2 overflow-hidden rounded-lg border bg-white shadow-sm transition-all duration-premium hover:shadow-premium active:scale-[0.99] sm:mb-premium-sm sm:rounded-premium sm:shadow-premium"
	class:border-brand-royal={isActive}
	class:ring-1={isActive}
	class:ring-brand-muted={isActive}
>
	<div class="cursor-pointer p-3 sm:p-premium-md" on:click={selectFile}>
		<div class="flex items-center justify-between gap-2">
			<div class="flex min-w-0 flex-1 items-center">
				<!-- File icon based on type -->
				<div
					class="mr-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg sm:mr-premium-md sm:h-10 sm:w-10 sm:rounded-premium-sm {fileTypeColor}"
				>
					<svelte:component this={FileIcon} class="h-5 w-5 sm:h-6 sm:w-6" />
				</div>

				<!-- File info -->
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-1.5 sm:gap-premium-sm">
						<h3 class="truncate text-sm font-medium text-text-rich sm:text-premium-body">
							{file.filename || 'Unnamed File'}
						</h3>
						<span
							class="hidden flex-shrink-0 rounded-full bg-brand-whisper px-1.5 py-0.5 text-[10px] text-text-slate xs:inline sm:rounded-premium-xl sm:px-premium-sm sm:text-premium-caption"
							>{fileTypeLabel}</span
						>
					</div>
					<div class="flex items-center text-[11px] text-text-silver sm:text-premium-caption">
						<span>{formatFileSize(file.size)}</span>
						<span class="mx-1">•</span>
						<span title={formatDate(file.createdAt)}>{timeAgo}</span>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex flex-shrink-0 items-center gap-0.5 sm:gap-1">
				<button
					on:click={toggleDetails}
					class="flex h-9 w-9 items-center justify-center rounded-lg text-text-slate transition-all duration-premium hover:bg-brand-whisper hover:text-brand-royal focus:outline-none focus:ring-2 focus:ring-brand-royal focus:ring-offset-1 sm:h-11 sm:w-11 sm:rounded-premium-sm"
					title={showDetails ? 'Hide details' : 'Show details'}
					aria-label={showDetails ? 'Hide details' : 'Show details'}
				>
					{#if showDetails}
						<ChevronUp class="h-4 w-4 sm:h-5 sm:w-5" />
					{:else}
						<ChevronDown class="h-4 w-4 sm:h-5 sm:w-5" />
					{/if}
				</button>

				<button
					on:click={deleteFile}
					class="flex h-9 w-9 items-center justify-center rounded-lg text-text-slate transition-all duration-premium hover:bg-status-error-bg hover:text-status-error focus:outline-none focus:ring-2 focus:ring-status-error focus:ring-offset-1 sm:h-11 sm:w-11 sm:rounded-premium-sm"
					title="Delete file"
					aria-label="Delete file"
				>
					<Trash2 class="h-4 w-4 sm:h-5 sm:w-5" />
				</button>
			</div>
		</div>

		<!-- Details panel (conditional) -->
		{#if showDetails}
			<div class="details-panel mt-premium-md rounded-premium bg-brand-whisper p-premium-md">
				<!-- File preview, if available -->
				{#if preview}
					<div class="mb-premium-md">
						<h4 class="mb-premium-xs text-premium-meta font-medium text-text-rich">Preview</h4>
						<div
							class="preview-content max-h-28 overflow-y-auto rounded-premium border border-border-platinum bg-white p-premium-sm text-premium-caption"
						>
							<pre class="whitespace-pre-wrap">{preview}</pre>
						</div>
					</div>
				{/if}

				<!-- File metadata -->
				<div class="metadata">
					<h4 class="mb-premium-xs text-premium-meta font-medium text-text-rich">File Details</h4>
					<div class="grid grid-cols-2 gap-premium-sm text-premium-caption">
						<div class="text-text-slate">File Name:</div>
						<div class="truncate font-medium text-text-rich">{file.filename}</div>

						<div class="text-text-slate">File Type:</div>
						<div class="font-medium text-text-rich">{fileTypeLabel}</div>

						<div class="text-text-slate">Size:</div>
						<div class="font-medium text-text-rich">{formatFileSize(file.size)}</div>

						<div class="text-text-slate">MIME Type:</div>
						<div class="font-medium text-text-rich">{file.contentType || 'Unknown'}</div>

						<div class="text-text-slate">Upload Date:</div>
						<div class="font-medium text-text-rich">{formatDate(file.createdAt)}</div>

						<div class="text-text-slate">ID:</div>
						<div class="font-mono text-[10px] text-text-silver opacity-70">{file.id}</div>
					</div>
				</div>

				<!-- File actions -->
				<div class="mt-premium-md flex justify-end">
					<button
						on:click={selectFile}
						class="flex min-h-[44px] items-center rounded-premium-sm bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-premium hover:bg-brand-deep focus:outline-none focus:ring-2 focus:ring-brand-royal focus:ring-offset-2"
					>
						<Check class="mr-2 h-4 w-4" />
						Select File
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
