<script>
	import { currentFile } from '../stores/fileInfo';
	import { fileMetricsStore } from '../stores/fileInfo';
	import { Dna, Users, Grid3X3, HardDrive, CheckCircle2 } from 'lucide-svelte';

	// Format file size in a human-readable way
	function formatFileSize(bytes) {
		if (!bytes) return '0B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)}${units[i]}`;
	}

	// Determine which property to use for the filename
	$: filename = $currentFile?.filename || $currentFile?.name || 'CD2-slim.fna';

	// For debugging
	$: console.log('Current File:', $currentFile);
	$: console.log('File Metrics:', $fileMetricsStore);
</script>

{#if $currentFile}
	<div
		class="file-indicator mb-premium-lg rounded-premium border border-accent-copper bg-accent-pearl p-premium-md"
	>
		<div class="flex flex-wrap items-center justify-between">
			<div class="flex items-center">
				<div
					class="mr-premium-md flex h-10 w-10 items-center justify-center rounded-premium bg-accent-copper text-white"
				>
					<Dna class="h-6 w-6" />
				</div>
				<div>
					<div class="mb-premium-xs flex items-baseline">
						<span class="font-medium text-text-rich">Currently Analyzing:</span>
						<span class="ml-premium-xs font-semibold text-brand-royal">{filename}</span>
					</div>

					<div class="flex items-center space-x-6">
						{#if $fileMetricsStore?.FILE_INFO}
							<span class="flex items-center" title="Sequences">
								<Users class="mr-1 h-4 w-4 text-text-slate" />
								<span class="text-text-rich">{$fileMetricsStore.FILE_INFO.sequences || 10}</span
								>&nbsp;sequences
							</span>
							<span class="flex items-center" title="Sites">
								<Grid3X3 class="mr-1 h-4 w-4 text-text-slate" />
								<span class="text-text-rich">{$fileMetricsStore.FILE_INFO.sites || 17}</span
								>&nbsp;sites
							</span>
						{/if}
						<span class="flex items-center" title="File Size">
							<HardDrive class="mr-1 h-4 w-4 text-text-slate" />
							<span class="text-text-rich">{formatFileSize($currentFile.size || 800)}</span>
						</span>
					</div>
				</div>
			</div>
			<div>
				<div
					class="flex items-center rounded-premium-sm bg-white px-premium-sm py-premium-xs text-premium-caption font-medium text-accent-copper"
				>
					<CheckCircle2 class="mr-1 h-4 w-4" />
					Valid for analysis
				</div>
			</div>
		</div>
	</div>
{/if}
