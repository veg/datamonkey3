<script>
	import { onMount } from 'svelte';
	import { currentFile, fileMetricsStore, persistentFileStore } from '../stores/fileInfo';
	import { analysisStore, activeAnalysisProgress } from '../stores/analyses';
	import { treeStore } from '../stores/tree';
	import { toastStore } from '../stores/toast';
	import {
		backendConnectivity,
		initializeBackendConnectivity
	} from '../stores/backendConnectivity.js';
	import MethodSelector from './MethodSelector.svelte';
	import FileIndicator from './FileIndicator.svelte';
	import TabNavigation from './TabNavigation.svelte';
	import TreeSourceSelector from './TreeSourceSelector.svelte';
	import { treeHasBranchLengths } from './services/prescreen/scope.js';
	import backendAnalysisRunner from './services/BackendAnalysisRunner.js';
	import wasmAnalysisRunner from './services/WasmAnalysisRunner.js';
	import { ChevronDown, TreeDeciduous } from '$lib/icons';
	import { trackEvent } from './utils/analytics.js';

	// Wrap toggleStdOut to add analytics
	function handleToggleStdOut() {
		toggleStdOut();
		// Track after toggle so we capture the new state
		trackEvent('console-toggled', { visible: !isStdOutVisible });
	}

	// Props
	export let methodConfig = {};
	export let runMethod = () => {};
	export let selectedMethod = 'FEL'; // Default method for configuration
	export let hyphyOut = '';
	export let isStdOutVisible = false;
	export let toggleStdOut = () => {};

	// Tab navigation
	export let activeTab = 'analyze';
	export let onChange = (tab) => {};

	// Local state
	let analysisSectionExpanded = true;

	// Tree detection
	$: hasTree = $treeStore && ($treeStore.nj || $treeStore.usertree);

	// Handle method selection changes from MethodSelector
	function handleMethodChange(event) {
		// Event contains method, options, geneticCode, executionMode
		// Currently used for logging/debugging, timing estimate is now inside MethodSelector
		const { method } = event.detail;
		console.log('Method changed:', method);
	}

	/**
	 * Strip embedded trees from alignment data
	 * Both NEXUS and FASTA files can contain embedded trees that take precedence over separate tree files
	 */
	function stripEmbeddedTrees(alignmentData) {
		console.log('🌳 Checking for embedded trees in alignment data...');
		let cleaned = alignmentData;

		// Handle NEXUS format - look for TREES blocks
		if (alignmentData.toLowerCase().includes('#nexus')) {
			const treesBlockRegex = /begin\s+trees\s*;.*?end\s*;/gis;
			const hasTreesBlock = treesBlockRegex.test(alignmentData);

			if (hasTreesBlock) {
				console.log('🌳 Found embedded TREES block in NEXUS file, removing it...');
				cleaned = alignmentData.replace(treesBlockRegex, '');
				console.log('🌳 Stripped TREES block from NEXUS file');
			}
		}

		// Handle FASTA format - look for Newick trees appended at the end
		// Trees typically start with "(" and end with ";" after the sequences
		const lines = cleaned.split('\n');
		const filteredLines = [];
		let inSequence = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			// Sequence header
			if (line.startsWith('>')) {
				inSequence = true;
				filteredLines.push(lines[i]);
				continue;
			}

			// Empty line
			if (!line) {
				filteredLines.push(lines[i]);
				continue;
			}

			// Check if this looks like a Newick tree (starts with parenthesis, contains colons and semicolon)
			if (line.startsWith('(') && line.includes(':') && line.includes(';')) {
				console.log('🌳 Found appended Newick tree in FASTA file, removing it...');
				console.log('🌳 Removed tree:', line.substring(0, 100) + '...');
				// Skip this line (don't add to filtered)
				continue;
			}

			// Regular sequence data
			filteredLines.push(lines[i]);
		}

		const result = filteredLines.join('\n');

		if (result !== alignmentData) {
			console.log('🌳 Stripped embedded tree from alignment file');
		} else {
			console.log('🌳 No embedded trees found');
		}

		return result;
	}

	// Enhanced runMethod that handles both local and backend execution
	async function enhancedRunMethod(method, config) {
		// Show "analysis started" toast
		const methodName = method.toUpperCase();
		const executionModeLabel = config.executionMode === 'backend' ? 'server' : 'local';
		toastStore.info(`${methodName} analysis started (${executionModeLabel})`, {
			duration: 3000
		});

		// Track analysis started event
		trackEvent('analysis-started', {
			method: methodName,
			executionMode: config.executionMode
		});

		try {
			// AxoMEME is dispatched BEFORE the backend/WASM split, because it belongs to neither. It is
			// not a HyPhy analysis: no hyphy.wasm invocation, no server job, no HyPhy JSON. It runs an
			// ONNX graph in this tab and returns in seconds. The executionMode toggle does not apply —
			// there is no server-side AxoMEME yet — so it is deliberately ignored rather than silently
			// routing a browser-only method through a socket that has no handler for it.
			if (method.toLowerCase() === 'axomeme') {
				if (!$currentFile || !$currentFile.id) {
					throw new Error('No file selected for analysis');
				}

				// Same source-of-truth order the other two branches use: prefer the canonical FASTA
				// datareader.bf emits on upload, which has already collapsed PHYLIP / MEGA / CLUSTAL /
				// NEXUS / FASTA to one shape, and only strip embedded trees from a raw user blob.
				// AxoMEME cares about this more than most: a trailing newick line left in the FASTA
				// would be appended to the last sequence and quietly corrupt that taxon's codons.
				let alignment = $fileMetricsStore?.canonicalFasta;
				if (!alignment) {
					const fullFileData = await persistentFileStore.getFile($currentFile.id);
					if (!fullFileData) {
						throw new Error('Unable to load file data');
					}
					alignment = await fullFileData.text();
					if (!alignment || !alignment.trim()) {
						throw new Error('No sequence data available in selected file');
					}
					alignment = stripEmbeddedTrees(alignment);
				}

				// A tree with BRANCH LENGTHS is not optional here, unlike for some HyPhy methods. The
				// model reads a patristic distance matrix; a topology-only tree yields all-zero
				// distances and an all-zero embedding, and the model would return confident numbers
				// computed from nothing.
				const tree = getSelectedTreeData();
				if (!tree) {
					throw new Error(
						'AxoMEME needs a phylogenetic tree. Infer one or upload your own before running it.'
					);
				}
				// A non-empty string is not enough, and the comment above already said so. A
				// topology-only tree — `(a,(b,c));` — or one whose lengths are all zero is truthy,
				// reaches prepareAlignment, and yields an all-zero distance matrix and an all-zero
				// embedding. The model then returns confident-looking numbers computed from nothing,
				// and inspectBranchLengths reports `ok: true` for the all-zero case, so no warning
				// fires either. treeHasBranchLengths is the predicate that actually answers this.
				if (!treeHasBranchLengths(tree)) {
					throw new Error(
						'AxoMEME needs a tree with branch lengths — it reads them as evolutionary distances. ' +
							'This tree has none, so every pair of sequences would look equally related. Infer a ' +
							'neighbor-joining tree or upload one with branch lengths.'
					);
				}

				const { axomemeAnalysisRunner } = await import('./services/AxomemeAnalysisRunner.js');
				const result = await axomemeAnalysisRunner.runAnalysis(
					method,
					config,
					alignment,
					tree,
					$currentFile.id
				);
				toastStore.success('AxoMEME prediction complete', { duration: 3000 });
				return result;
			}

			if (config.executionMode === 'backend') {
				// Backend execution
				if (!$backendConnectivity.isConnected) {
					throw new Error('Backend server is not connected');
				}

				// Check if we have a current file selected
				if (!$currentFile || !$currentFile.id) {
					throw new Error('No file selected for analysis');
				}

				// Prefer the canonical FASTA emitted by datareader.bf on upload. It
				// collapses PHYLIP, MEGA, CLUSTAL, NEXUS, FASTA all to a single
				// known shape, so downstream submission and validation don't have
				// to handle the matrix of formats. Fall back to reading the user's
				// original blob if the canonical wasn't cached (older analyses).
				let fastaData = $fileMetricsStore?.canonicalFasta;
				if (!fastaData) {
					const fullFileData = await persistentFileStore.getFile($currentFile.id);
					if (!fullFileData) {
						throw new Error('Unable to load file data');
					}
					fastaData = await fullFileData.text();
					if (!fastaData || !fastaData.trim()) {
						throw new Error('No sequence data available in selected file');
					}
					// Only the user's raw upload can have embedded trees; the
					// canonical FASTA from datareader is already clean.
					fastaData = stripEmbeddedTrees(fastaData);
				}

				// Get tree data based on user's selection
				let treeData = getSelectedTreeData();
				console.log('🌳 Tree selection for analysis:', {
					source: selectedTreeSource,
					treePreview: treeData ? treeData.substring(0, 100) + '...' : 'none'
				});

				// Check if we have interactive branch selection with tagged tree
				if (config.branchesToTest === 'Interactive' && config.interactiveTree) {
					treeData = config.interactiveTree;
					console.log('🌳 Using interactive tree instead:', treeData.substring(0, 100) + '...');
				}
				if (!treeData) {
					if (selectedTreeSource === 'inferred') {
						throw new Error(
							'No neighbor-joining tree was inferred for this alignment. Please upload your own tree file.'
						);
					}
					const treeSourceName =
						selectedTreeSource === 'uploaded' ? 'uploaded tree' : 'uploaded tree file';
					throw new Error(
						`No ${treeSourceName} available. Please select a different tree source or upload a tree.`
					);
				}

				const result = await backendAnalysisRunner.runAnalysis(
					method,
					config,
					fastaData,
					treeData,
					$currentFile?.id
				);
			} else {
				// Local WASM execution
				if (!$currentFile || !$currentFile.id) {
					throw new Error('No file selected for analysis');
				}

				// Prefer the canonical FASTA emitted by datareader.bf on upload. It
				// collapses PHYLIP, MEGA, CLUSTAL, NEXUS, FASTA all to a single
				// known shape, so downstream submission and validation don't have
				// to handle the matrix of formats. Fall back to reading the user's
				// original blob if the canonical wasn't cached (older analyses).
				let fastaData = $fileMetricsStore?.canonicalFasta;
				if (!fastaData) {
					const fullFileData = await persistentFileStore.getFile($currentFile.id);
					if (!fullFileData) {
						throw new Error('Unable to load file data');
					}
					fastaData = await fullFileData.text();
					if (!fastaData || !fastaData.trim()) {
						throw new Error('No sequence data available in selected file');
					}
					// Only the user's raw upload can have embedded trees; the
					// canonical FASTA from datareader is already clean.
					fastaData = stripEmbeddedTrees(fastaData);
				}

				// Get tree data based on user's selection
				let treeData = getSelectedTreeData();

				// Check if we have interactive branch selection with tagged tree
				if (config.branchesToTest === 'Interactive' && config.interactiveTree) {
					treeData = config.interactiveTree;
				}

				if (!treeData) {
					if (selectedTreeSource === 'inferred') {
						throw new Error(
							'No neighbor-joining tree was inferred for this alignment. Please upload your own tree file.'
						);
					}
					const treeSourceName =
						selectedTreeSource === 'uploaded' ? 'uploaded tree' : 'uploaded tree file';
					throw new Error(
						`No ${treeSourceName} available. Please select a different tree source or upload a tree.`
					);
				}

				const result = await wasmAnalysisRunner.runAnalysis(
					method,
					config,
					fastaData,
					treeData,
					$currentFile?.id
				);
			}
		} catch (error) {
			console.error('❌ Analysis execution failed:', error);

			trackEvent('analysis-start-blocked', {
				reason: error.message
			});

			// Show error toast instead of alert
			toastStore.error(`Analysis failed: ${error.message}`, {
				duration: 8000
			});
		}
	}

	// Initialize backend connectivity on mount
	onMount(() => {
		initializeBackendConnectivity();
	});

	// Handle tree source change from TreeSourceSelector
	function handleTreeSourceChange(event) {
		const { treeSource, hasUploadedTree, hasInferredTree, uploadedFile } = event.detail;
		console.log('Tree source changed:', {
			treeSource,
			hasUploadedTree,
			hasInferredTree,
			uploadedFile
		});
		selectedTreeSource = treeSource;

		// If there's an uploaded file in the event, store it
		if (uploadedFile) {
			uploadedTreeFile = { content: null, file: uploadedFile };
		}
	}

	// Handle file upload from TreeSourceSelector
	async function handleFileUploaded(event) {
		const { file, treeSource } = event.detail;
		console.log('Tree file uploaded:', { file, treeSource });

		try {
			// Read the file content
			const content = await file.text();
			uploadedTreeFile = { content, file };
			selectedTreeSource = 'upload-new';
			console.log('Tree file content loaded:', content.substring(0, 100) + '...');
		} catch (error) {
			console.error('Failed to read tree file:', error);
			alert('Failed to read tree file. Please ensure it is a valid Newick format file.');
		}
	}

	// Tree source selection state
	let selectedTreeSource = 'inferred'; // 'uploaded' | 'inferred' | 'upload-new'
	let uploadedTreeFile = null;

	// Calculate tree state for TreeSourceSelector
	$: hasUploadedTree = $treeStore && $treeStore.usertree;
	$: hasInferredTree = $treeStore && $treeStore.nj;

	// If datareader didn't produce an NJ tree (FILE_INFO.nj missing), the
	// 'inferred' radio is disabled in the UI but selectedTreeSource defaults
	// to 'inferred', so users hit "No NJ tree available" when they click Run.
	// Switch to whichever option is actually available — but only AFTER
	// datareader has finished. Gating on $fileMetricsStore avoids the mount-time
	// race where treeStore is briefly empty and we'd switch away from 'inferred'
	// before the file even loads.
	$: if ($fileMetricsStore && selectedTreeSource === 'inferred' && !hasInferredTree) {
		selectedTreeSource = hasUploadedTree ? 'uploaded' : 'upload-new';
	}

	// Get tree data based on user's selection
	function getSelectedTreeData() {
		switch (selectedTreeSource) {
			case 'uploaded':
				return $treeStore?.usertree || '';
			case 'inferred':
				return $treeStore?.nj || '';
			case 'upload-new':
				return uploadedTreeFile?.content || '';
			default:
				return '';
		}
	}

	// Toggle analysis section
	function toggleAnalysisSection() {
		analysisSectionExpanded = !analysisSectionExpanded;
	}
</script>

<div class="analyze-tab">
	<!-- File Indicator (visible when a file is selected) -->
	<FileIndicator />

	<!-- Tree Source Selector -->
	{#if $currentFile}
		<div class="mb-premium-xl">
			<h2 class="mb-premium-md flex items-center text-premium-header font-semibold text-text-rich">
				<TreeDeciduous class="mr-2 h-5 w-5 text-green-600" /> Phylogenetic Tree
			</h2>

			<div
				class="rounded-premium border border-border-platinum bg-white p-premium-lg shadow-premium"
			>
				<TreeSourceSelector
					{hasUploadedTree}
					{hasInferredTree}
					bind:treeSource={selectedTreeSource}
					disabled={false}
					uploadedTreeNewick={$treeStore?.usertree || ''}
					inferredTreeNewick={$treeStore?.nj || ''}
					on:treeSourceChange={handleTreeSourceChange}
					on:fileUploaded={handleFileUploaded}
				/>
			</div>
		</div>
	{/if}

	<!-- Analysis Section (expanded by default) -->
	<div class="mb-premium-xl rounded-premium border border-border-platinum bg-white shadow-premium">
		<div
			class="flex cursor-pointer items-center justify-between rounded-t-premium bg-brand-whisper p-premium-md transition-all duration-premium hover:bg-brand-ghost"
			on:click={toggleAnalysisSection}
		>
			<h2 class="text-premium-header font-semibold text-text-rich">Analysis</h2>
			<div class="flex items-center">
				{#if $currentFile}
					<button
						on:click={(e) => {
							e.stopPropagation();
							handleToggleStdOut();
						}}
						class="mr-premium-md rounded-premium-sm bg-brand-royal px-premium-md py-premium-xs text-premium-meta font-medium text-white transition-all duration-premium hover:bg-brand-deep"
					>
						{isStdOutVisible ? 'Hide Console' : 'Show Console'}
					</button>
				{/if}
				<ChevronDown
					class="h-6 w-6 text-brand-royal transition-transform duration-premium {analysisSectionExpanded
						? 'rotate-180'
						: ''}"
				/>
			</div>
		</div>

		{#if analysisSectionExpanded}
			<div class="p-premium-lg">
				{#if $currentFile}
					<!-- Method Selector (includes timing estimate) -->
					<MethodSelector
						{methodConfig}
						runMethod={enhancedRunMethod}
						on:methodChange={handleMethodChange}
					/>

					<!-- Console output (conditionally shown) -->
					{#if isStdOutVisible}
						<div class="mt-premium-md">
							<h3 class="mb-premium-sm text-premium-title font-semibold text-text-rich">
								Console Output
							</h3>
							<pre
								class="code-output h-48 overflow-auto rounded-premium bg-text-rich p-premium-md text-premium-meta text-white text-opacity-90">{hyphyOut}</pre>
						</div>
					{/if}
				{:else if $persistentFileStore && $persistentFileStore.files && $persistentFileStore.files.length > 0}
					<div
						class="rounded-premium border border-border-platinum bg-brand-whisper p-premium-xl text-center"
					>
						<p class="text-premium-body text-text-slate">
							Select a file from the list to run analyses
						</p>
					</div>
				{:else}
					<div
						class="rounded-premium border border-border-platinum bg-brand-whisper p-premium-xl text-center"
					>
						<p class="text-premium-body text-text-slate">
							Upload a file in the Data tab to run analyses
						</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Tab Navigation -->
	<TabNavigation {activeTab} {onChange} />
</div>

<style>
	.code-output {
		font-family: monospace;
		font-size: 0.875rem;
		line-height: 1.5;
	}
</style>
