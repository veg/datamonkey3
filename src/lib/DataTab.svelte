<script>
	import { fileMetricsStore, currentFile, alignmentFileStore } from '../stores/fileInfo';
	import { treeStore } from '../stores/tree';
	import DataReaderResults from './dataReaderResults.svelte';
	import FastaValidator from './FastaValidator.svelte';
	import SequenceWarnings from './SequenceWarnings.svelte';
	import FileManager from './FileManager.svelte';
	import ErrorHandler from './ErrorHandler.svelte';
	import DemoFileSelector from './DemoFileSelector.svelte';
	import TabNavigation from './TabNavigation.svelte';
	import FastaExport from './FastaExport.svelte';
	import AlignmentViewer from './AlignmentViewer.svelte';
	import { ArrowRight, AlertTriangle, TreeDeciduous, Info } from 'lucide-svelte';

	// Props
	export let handleFileUpload = () => {};
	export let handleDemoFileSelect = () => {};
	export let validationError = null;
	export let fileMetricsJSON = null;
	export let handleValidated = () => {};
	export let handleUseRepaired = () => {};

	// Tab navigation
	export let activeTab = 'data';
	export let onChange = (tab) => {};

	// Computed props
	$: hasFileMetrics = !!fileMetricsJSON && Object.keys(fileMetricsJSON).length > 0;
	$: hasTree = $treeStore && ($treeStore.nj || $treeStore.usertree);
	$: isReadyForAnalysis = hasFileMetrics && hasTree;

	// Check if error is tree-related (show as warning instead of error)
	$: isTreeError = validationError?.code?.startsWith('TREE') ||
		validationError?.message?.toLowerCase().includes('tree') ||
		validationError?.details?.toLowerCase().includes('tree');
	$: errorLevel = isTreeError ? 'warning' : 'error';
</script>

<div class="data-tab">
	<div class="mb-premium-xl">
		<h2 class="mb-premium-md text-premium-header font-semibold text-text-rich">Data Input</h2>

		<div class="flex flex-wrap gap-premium-md">
			<div class="min-w-[300px] flex-grow">
				<label
					for="file-upload"
					class="mb-premium-xs block text-premium-body font-medium text-text-slate"
					>Upload Sequence File:</label
				>
				<input
					id="file-upload"
					type="file"
					on:change={handleFileUpload}
					class="file-input w-full"
				/>
			</div>

			<div class="min-w-[300px] flex-grow">
				<DemoFileSelector
					on:selectFile={handleDemoFileSelect}
					on:error={(e) => (validationError = { message: e.detail.message })}
				/>
			</div>
		</div>

		<!-- File limits info -->
		<div class="mt-premium-md flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
			<Info class="mt-0.5 h-4 w-4 flex-shrink-0" />
			<div>
				<span class="font-medium">File limits:</span>
				Max 5,000 sequences, 12,000 alignment sites.
				Files with &gt;500 sequences require an embedded tree.
			</div>
		</div>

		<!-- Error display (tree errors show as warning, others as error) -->
		<ErrorHandler
			error={validationError}
			level={errorLevel}
			on:dismiss={() => (validationError = null)}
		/>
	</div>

	<!-- File Management Section -->
	<div class="mb-premium-xl">
		<FileManager onSelectFile={handleFileUpload} />
	</div>

	<!-- File Information Section -->
	{#if hasFileMetrics}
		<div class="mb-premium-xl">
			<h2 class="mb-premium-md text-premium-header font-semibold text-text-rich">
				Sequence Data Information
			</h2>
			<div
				class="rounded-premium border border-border-platinum bg-white p-premium-lg shadow-premium"
			>
				<DataReaderResults {fileMetricsJSON} />
			</div>
		</div>

		<!-- Sequence Warnings Section -->
		<div class="mb-premium-xl">
			<SequenceWarnings {fileMetricsJSON} />
		</div>

		<!-- Alignment Viewer -->
		{#if $alignmentFileStore}
			<div class="mb-premium-xl">
				<h2 class="mb-premium-md text-premium-header font-semibold text-text-rich">
					Alignment Viewer
				</h2>
				<div class="rounded-premium border border-border-platinum bg-white shadow-premium overflow-hidden">
					<AlignmentViewer alignmentFile={$alignmentFileStore} {fileMetricsJSON} />
				</div>
			</div>
		{/if}

		<!-- Sequence Export Section -->
		{#if $alignmentFileStore}
			<div class="mb-premium-xl">
				<FastaExport alignmentFile={$alignmentFileStore} />
			</div>
		{/if}

		<!-- Phylogenetic Tree Status Section -->
		<div class="mb-premium-xl">
			<h2 class="mb-premium-md text-premium-header font-semibold text-text-rich">
				Phylogenetic Tree Status
			</h2>
			<div class="rounded-premium border border-border-platinum bg-white p-premium-lg shadow-premium">
				{#if $treeStore?.usertree}
					<!-- User tree found -->
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
							<TreeDeciduous class="h-5 w-5 text-green-600" />
						</div>
						<div>
							<p class="font-semibold text-green-800">Tree detected in file</p>
							<p class="text-sm text-green-600">Using the phylogenetic tree from your uploaded file</p>
						</div>
					</div>
				{:else if $treeStore?.nj}
					<!-- NJ tree inferred -->
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
							<Info class="h-5 w-5 text-blue-600" />
						</div>
						<div>
							<p class="font-semibold text-blue-800">Using inferred neighbor-joining tree</p>
							<p class="text-sm text-blue-600">No tree was found in your file. A tree has been inferred from the sequence data.</p>
						</div>
					</div>
				{:else}
					<!-- No tree available -->
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
							<AlertTriangle class="h-5 w-5 text-yellow-600" />
						</div>
						<div>
							<p class="font-semibold text-yellow-800">No phylogenetic tree available</p>
							<p class="text-sm text-yellow-600">Please upload a tree file in the Analyze tab to proceed.</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div
			class="relative my-premium-xl overflow-hidden rounded-2xl border border-border-platinum p-8 text-center shadow-sm"
		>
			<div
				class="absolute -inset-32 opacity-30"
				style="background: url('/img/mascot-pattern.png'); background-size: 180px; background-repeat: repeat; transform: rotate(-12deg);"
			></div>
			<div class="absolute inset-0 bg-gradient-to-br from-white/90 via-white/80 to-brand-whisper/90"></div>
			<div class="relative z-10 py-12">
				<p class="text-lg font-medium text-text-rich">
					Upload or select a file to get started
				</p>
			</div>
		</div>
	{/if}

	<!-- Continue to Analysis CTA -->
	{#if isReadyForAnalysis}
		<div class="continue-cta mb-premium-xl">
			<div class="rounded-premium border border-green-200 bg-green-50 p-premium-lg">
				<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
							<svg
								class="h-5 w-5 text-green-600"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>
						<div>
							<p class="font-semibold text-green-800">Data ready for analysis</p>
							<p class="text-sm text-green-600">
								Your sequence data and phylogenetic tree are loaded
							</p>
						</div>
					</div>
					<button
						on:click={() => onChange('analyze')}
						class="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-semibold text-white shadow-sm transition-all hover:bg-green-700 hover:shadow-md"
					>
						Continue to Analysis
						<ArrowRight class="h-5 w-5" />
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Tab Navigation -->
	<TabNavigation {activeTab} {onChange} />
</div>

<style>
	.file-input {
		border: 1px solid var(--tw-border-platinum, #f1f5f9);
		padding: 0.75rem;
		border-radius: 0.5rem;
		background-color: white;
	}
</style>
