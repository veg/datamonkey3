<script>
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { aioliStore } from '../stores/aioli';
	import {
		alignmentFileStore,
		fileMetricsStore,
		persistentFileStore,
		currentFile
	} from '../stores/fileInfo';
	import {
		analysisStore,
		currentAnalysis,
		activeAnalysisProgress,
		activeAnalyses
	} from '../stores/analyses';
	import { backendAnalysisRunner } from '../lib/services/BackendAnalysisRunner.js';
	import { treeStore, addTree, updateTaggedTree, resetTrees } from '../stores/tree';
	import { syncDescriptorStoresForFile as syncDescriptorStores } from '../lib/utils/descriptorSync.js';
	import { trackEvent } from '../lib/utils/analytics.js';
	import Aioli from '@biowasm/aioli';
	import TreeSelector from '../lib/TreeSelector.svelte';
	import ErrorHandler from '../lib/ErrorHandler.svelte';
	import DemoFileSelector from '../lib/DemoFileSelector.svelte';
	import { X, FlaskConical, ExternalLink } from 'lucide-svelte';

	// New tabbed structure components
	import DataTab from '../lib/DataTab.svelte';
	import AnalyzeTab from '../lib/AnalyzeTab.svelte';
	import ResultsTab from '../lib/ResultsTab.svelte';
	import PremiumTabNavigation from '../lib/PremiumTabNavigation.svelte';
	import SmartTabNavigation from '../lib/SmartTabNavigation.svelte';
	import StepNavigation from '../lib/StepNavigation.svelte';

	// Import HyPhy dependencies
	import dataReader from '../data/datareader.bf?raw';
	import HyPhyGlobals from '../data/shared/HyPhyGlobals.ibf?raw';
	import chooseGeneticCode from '../data/shared/chooseGeneticCode.def?raw';
	import ReadDelimitedFiles from '../data/shared/ReadDelimitedFiles.bf?raw';
	import TreeTools from '../data/shared/TreeTools.ibf?raw';
	import NJ from '../data/shared/NJ.bf?raw';
	import PartitionReader from '../data/shared/PartitionReader.ibf?raw';
	import GrabBag from '../data/shared/GrabBag.bf?raw';

	let hyphyOut = '';
	let jsonOut;
	let jsonData;
	let trees = {};
	let loading = true;
	let cliObj;
	let result;
	let fileMetricsJSON;
	let selectedAnalysisId = null;
	let showAllHistory = false;
	let activeTab = 'data'; // 'data', 'analyze', or 'results'
	let selectedTree = 'nj';
	let selectedMethod = 'FEL'; // Default selected method for configuration
	let treeData = {};
	let showBatchExport = false;
	let analysisStartTime = null; // Track analysis start time for duration calculation

	// Engine-load state. The HyPhy WASM engine is a ~6.4 MB download and the whole app is replaced by
	// a spinner until it lands. Previously nothing caught a failure, so a mangled .wasm MIME type, a
	// dropped connection or a partial cache all produced the same spinner that never ended, with no
	// text to search for and no reason to retry. See issue #190.
	let engineError = null;
	let engineSlow = false;
	let engineWatchdog = null;
	let primeCardDismissed = false;

	// Handle URL query parameter for tab navigation (e.g., /?tab=results)
	$: {
		const tabParam = $page.url.searchParams.get('tab');
		if (tabParam && ['data', 'analyze', 'results'].includes(tabParam)) {
			activeTab = tabParam;
		}
	}

	// Consolidating methods and hyphyCommands with descriptions
	const methodConfig = {
		// AxoMEME is NOT a HyPhy method, and the fields below are shaped for one. It has no hyphy
		// command and writes no HyPhy JSON, so `command` and `outputSuffix` are null rather than
		// invented — anything that dispatches on them will fail loudly instead of running the wrong
		// binary. It is served by AxomemeAnalysisRunner, which evaluates an ONNX graph in the browser.
		AxoMEME: {
			command: null,
			outputSuffix: null,
			url: 'axomeme',
			args: [],
			runner: 'axomeme',
			// Drives the UI: no execution-mode toggle (there is no server-side AxoMEME) and no genetic
			// code selector (the model's tokenizer bakes in the universal table). A control that cannot
			// reach the model is worse than no control, because it implies a capability.
			browserOnly: true,
			description:
				'Predicts what MEME would report for each site, in seconds rather than hours. A neural surrogate, not a substitute for the full analysis.'
		},
		aBSREL: {
			command: 'absrel',
			outputSuffix: 'ABSREL.json',
			url: 'absrel',
			args: [],
			description: 'A method for assessing the presence of positive selection.'
		},
		BGM: {
			command: 'bgm',
			outputSuffix: 'BGM.json',
			url: 'bgm',
			args: [],
			description: 'Bayesian graphical models for comparative analysis.'
		},
		BUSTED: {
			command: 'busted',
			outputSuffix: 'BUSTED.json',
			url: 'busted',
			args: [],
			description: 'A method for testing positive selection in gene families.'
		},
		'Contrast-FEL': {
			command: 'contrast-fel',
			outputSuffix: 'CFEL.json',
			url: 'contrast-fel',
			args: [],
			description: 'Estimates selection pressure on branches.'
		},
		FADE: {
			command: 'fade',
			outputSuffix: 'FADE.json',
			url: 'fade',
			args: [],
			description: 'Detects positive selection and adaptive evolution.'
		},
		FEL: {
			command: 'fel',
			outputSuffix: 'FEL.json',
			url: 'fel',
			args: [],
			description: 'Fixed Effects Likelihood for testing selection.'
		},
		'B-STILL': {
			command: 'b-still',
			outputSuffix: 'FUBAR-inv.json',
			url: 'fubar',
			args: [],
			description: 'Detects invariant sites using Bayesian inference.'
		},
		FUBAR: {
			command: 'fubar',
			outputSuffix: 'FUBAR.json',
			url: 'fubar',
			args: [],
			description: 'Identifies positively selected sites.'
		},
		GARD: {
			command: 'gard',
			outputSuffix: 'GARD.json',
			url: 'gard',
			args: [],
			description: 'Detects recombination in sequences.'
		},
		MEME: {
			command: 'meme',
			outputSuffix: 'MEME.json',
			url: 'meme',
			args: [],
			description: 'Identifies episodic evolution.'
		},
		'MULTI-HIT': {
			command: 'fmm',
			outputSuffix: 'FMM.json',
			url: 'multhit',
			args: [],
			description: 'Analyzes multiple hits in evolution.'
		},
		NRM: {
			command: null,
			outputSuffix: 'NRM.json',
			url: 'nrm',
			args: [],
			description: 'Nonstationary rate mixture model.'
		},
		PRIME: {
			command: 'prime',
			outputSuffix: 'PRIME.json',
			url: 'prime',
			args: [],
			description: 'Tests for property-dependent selection at individual sites.'
		},
		RELAX: {
			command: 'relax',
			outputSuffix: 'RELAX.json',
			url: 'relax',
			args: [],
			description: 'Tests for heterogeneous selection.'
		},
		SLAC: {
			command: 'slac',
			outputSuffix: 'SLAC.json',
			url: 'slac',
			args: [],
			description: 'Estimation of selection pressure.'
		}
	};

	// Select an analysis to view
	function selectAnalysis(analysisId) {
		selectedAnalysisId = analysisId;
		analysisStore.setCurrentAnalysis(analysisId);
	}

	// Run or rerun an analysis method
	async function runMethod(method, options = null) {
		try {
			// Extract the method name and options
			const methodName = typeof method === 'string' ? method : 'unknown';

			// Get method configuration
			const methodInfo = methodConfig[methodName];
			if (!methodInfo) {
				hyphyOut = `Error: Method ${methodName} is not found in configuration`;
				return;
			}

			const { command, outputSuffix } = methodInfo;

			if (!command) {
				hyphyOut = `Error: Method ${methodName} is not implemented yet`;
				return;
			}

			// Create an analysis record for tracking
			const currentFileId = $currentFile?.id;
			if (!currentFileId) {
				hyphyOut = 'Error: No file selected for analysis';
				return;
			}

			// Get the current file content
			file = await persistentFileStore.getFile(currentFileId);
			if (!file) {
				hyphyOut = 'Error: Unable to retrieve file content';
				return;
			}

			// Create a new analysis record
			const analysisId = await analysisStore.createAnalysis(currentFileId, methodName);
			console.log(`Created analysis ${analysisId} for method ${methodName}`);
			selectAnalysis(analysisId); // Select the new analysis immediately

			// Track analysis start time for duration calculation
			analysisStartTime = Date.now();

			// Switch to the analysis tab to show the analysis in progress
			changeTab('analyze');

			// Initialize progress tracking
			analysisStore.startAnalysisProgress(
				analysisId,
				`Initializing ${methodName} analysis...`,
				methodName,
				{ executionMode: 'wasm' }
			);

			// Add method-specific data if needed
			analysisStore.updateAnalysisProgressById(
				analysisId,
				'mounting',
				10,
				`Preparing files for ${methodName} analysis...`
			);
			let methodDependencies = getMethodDependencies(methodName);

			let inputFiles = await cliObj.mount([
				{ name: 'user.nex', data: await file.text() },
				...methodDependencies.map((dep) => ({ name: dep.name, data: dep.data }))
			]);

			// Show preparation message
			analysisStore.updateAnalysisProgressById(
				analysisId,
				'running',
				20,
				`Running ${methodName} analysis...`
			);

			// Prepare additional command line arguments if options are provided
			let cmdArgs = inputFiles[0];
			if (options && typeof options === 'object') {
				// Log the options for debugging
				console.log('Running with options:', options);

				// Add each option as a command line argument
				Object.entries(options).forEach(([key, value]) => {
					// Skip null or undefined values
					if (value === null || value === undefined) return;

					// Skip method-specific metadata
					if (key === 'method' || key === 'executionMode') return;

					// Map parameter names to HyPhy expected names
					let paramName = key;
					if (key === 'geneticCode') {
						paramName = 'code';
					}

					// Handle boolean values
					if (typeof value === 'boolean') {
						if (value) {
							cmdArgs += ` --${paramName}`;
						}
					} else {
						cmdArgs += ` --${paramName} ${value}`;
					}
				});
			}

			// Mounting input files for HyPhy execution
			const fullCommand = `hyphy LIBPATH=/res/ ${command} ${cmdArgs}`;
			console.log('Executing command:', fullCommand);
			result = await cliObj.exec(fullCommand);
			hyphyOut = await result.stdout;

			// Process log output to update progress indicators
			const lines = hyphyOut.split('\n');
			let progressEstimate = 20; // Start at 20%

			for (const line of lines) {
				// Increase progress based on line count, capped at 80%
				progressEstimate = Math.min(80, progressEstimate + 0.5);

				// Special progress markers
				if (line.includes('Phase 1')) {
					analysisStore.updateAnalysisProgressById(
						analysisId,
						'running',
						30,
						'Phase 1: Model fitting...'
					);
				} else if (line.includes('Phase 2')) {
					analysisStore.updateAnalysisProgressById(
						analysisId,
						'running',
						50,
						'Phase 2: Site-by-site analysis...'
					);
				} else if (line.includes('writing')) {
					analysisStore.updateAnalysisProgressById(
						analysisId,
						'processing',
						75,
						'Processing results...'
					);
				} else if (line.includes('error') || line.includes('Error')) {
					analysisStore.updateAnalysisProgressById(
						analysisId,
						'error',
						progressEstimate,
						`Error: ${line}`
					);
				}
			}

			// Handle JSON output
			analysisStore.updateAnalysisProgressById(
				analysisId,
				'processing',
				85,
				'Retrieving results...'
			);
			const outputFile = `/shared/data/user.nex.${outputSuffix}`;
			const jsonBlob = await cliObj.download(outputFile);
			const response = await fetch(jsonBlob);
			const blob = await response.blob();
			jsonOut = await blob.text();

			try {
				jsonData = JSON.parse(jsonOut);
				analysisStore.updateAnalysisProgressById(
					analysisId,
					'saving',
					95,
					'Saving analysis results...'
				);
			} catch (error) {
				analysisStore.updateAnalysisProgressById(
					analysisId,
					'error',
					85,
					'Failed to parse results'
				);
				throw new Error('Failed to parse analysis results');
			}

			// Save the analysis result to IndexedDB with completed status
			const completionTimestamp = new Date().getTime();
			await analysisStore.updateAnalysis(analysisId, {
				status: 'completed', // Set status to completed
				result: jsonOut,
				completedAt: completionTimestamp,
				options: options // Save the options used for this analysis
			});

			// Make sure to update the analysis in the store directly for immediate UI refresh
			analysisStore.update((state) => {
				const updatedAnalyses = state.analyses.map((a) =>
					a.id === analysisId
						? {
								...a,
								status: 'completed',
								result: jsonOut,
								completedAt: completionTimestamp,
								options: options
							}
						: a
				);

				return {
					...state,
					analyses: updatedAnalyses
				};
			});

			// Complete progress tracking
			analysisStore.completeAnalysisProgress(
				true,
				`${methodName} analysis completed successfully.`
			);
			console.log(`Analysis ${analysisId} for method ${methodName} completed successfully`);

			// Track analysis completion
			trackEvent('analysis-completed', {
				method: methodName,
				executionMode: 'wasm',
				durationMs: analysisStartTime ? Date.now() - analysisStartTime : 0
			});

			// Switch to results tab when analysis completes
			changeTab('results');
		} catch (error) {
			console.error(
				`Error running method ${typeof method === 'string' ? method : 'unknown'}:`,
				error
			);
			hyphyOut = `Error: ${error.message}`;

			// Track analysis failure
			trackEvent('analysis-failed', {
				method: typeof method === 'string' ? method : 'unknown',
				executionMode: 'wasm',
				errorType: error.message?.substring(0, 50) || 'Unknown error'
			});

			// Update analysis with error. currentAnalysisId lives inside the store's
			// state (createAnalysisStore returns an object literal that never surfaces
			// it as a property), so read it via get() rather than off the store object.
			const failedAnalysisId = get(analysisStore).currentAnalysisId;
			if (failedAnalysisId) {
				await analysisStore.updateAnalysis(failedAnalysisId, {
					status: 'error',
					result: JSON.stringify({ error: error.message })
				});

				// Update progress tracking
				analysisStore.completeAnalysisProgress(false, `Error: ${error.message}`);
			}
		}
	}

	// Get method-specific dependencies
	function getMethodDependencies(method) {
		switch (method) {
			case 'FEL':
			case 'BUSTED':
			case 'SLAC':
				return [];
			default:
				return [];
		}
	}

	// Track HyPhy progress from console output
	function updateHyphyProgress(payload) {
		if (payload.type === 'print') {
			// Update the console output
			console.log(payload.text);

			// Update progress indicator if we have an active analysis
			if ($activeAnalysisProgress.id && $activeAnalysisProgress.status === 'running') {
				// Extract meaningful messages
				const text = payload.text.trim();
				if (text && text.length > 5) {
					// Ignore short messages
					// Estimate progress based on various cues
					let progressUpdate = null;

					if (text.includes('Fitting')) {
						progressUpdate = { progress: 30, message: 'Fitting models...' };
					} else if (text.includes('Optimizing')) {
						progressUpdate = { progress: 40, message: 'Optimizing parameters...' };
					} else if (text.includes('Computing')) {
						progressUpdate = { progress: 60, message: 'Computing site rates...' };
					} else if (text.includes('Writing')) {
						progressUpdate = { progress: 80, message: 'Writing results...' };
					}

					// Update the progress if we found a meaningful message
					if (progressUpdate) {
						analysisStore.updateAnalysisProgressById(
							$activeAnalysisProgress.id,
							'running',
							progressUpdate.progress,
							progressUpdate.message
						);
					}

					// For all console output, add to the log
					analysisStore.updateAnalysisProgressById(
						$activeAnalysisProgress.id,
						$activeAnalysisProgress.status,
						$activeAnalysisProgress.progress,
						text
					);
				}
			}
		}
	}

	/**
	 * Load the HyPhy WASM engine. Returns true on success.
	 *
	 * Both the Aioli construction and the version exec are inside the try: the second is just as
	 * capable of rejecting as the first, and an unhandled rejection anywhere here used to skip the
	 * `loading = false` at the end of onMount and leave the spinner up permanently.
	 */
	async function initHyphyEngine() {
		engineError = null;
		engineSlow = false;
		clearTimeout(engineWatchdog);

		// The download continues; this only stops the user staring at an unlabelled spinner with no
		// idea whether anything is still happening.
		engineWatchdog = setTimeout(() => {
			engineSlow = true;
		}, 45000);

		try {
			cliObj = await new Aioli(
				{
					tool: 'hyphy',
					version: '2.5.98',
					urlPrefix: `${window.location.origin}/wasm/hyphy/2.5.98`
				},
				{
					printInterleaved: false,
					callback: updateHyphyProgress
				}
			);

			aioliStore.set(cliObj);

			// Get HyPhy version
			result = await cliObj.exec('hyphy --version');
			hyphyOut = result.stdout;
			return true;
		} catch (err) {
			engineError = err instanceof Error ? err : new Error(String(err));
			console.error('Failed to load the HyPhy WASM engine:', err);
			return false;
		} finally {
			clearTimeout(engineWatchdog);
		}
	}

	/**
	 * Clear the browser caches holding the engine, then reload.
	 *
	 * A partial or corrupted cached copy reproduces the identical dead spinner, and a plain retry
	 * would fetch the same bad bytes -- so this is offered as a separate action rather than folded
	 * into the first retry, which would clear caches nobody needed cleared.
	 */
	async function retryEngineLoad({ clearCache = false } = {}) {
		if (clearCache && typeof caches !== 'undefined') {
			try {
				const keys = await caches.keys();
				await Promise.all(keys.map((k) => caches.delete(k)));
			} catch (err) {
				console.error('Could not clear cached engine:', err);
			}
		}
		window.location.reload();
	}

	onMount(async () => {
		const engineReady = await initHyphyEngine();
		if (!engineReady) {
			// Show the error card rather than the spinner. Nothing below can work without the engine.
			loading = false;
			return;
		}

		// Load any previously saved files from browser storage
		if (browser) {
			try {
				// Clean up any WASM analyses that were interrupted by a previous page refresh
				await analysisStore.cleanupInterruptedAnalyses();

				await persistentFileStore.loadFiles();
				await analysisStore.loadAnalyses();

				// Attempt to reconnect to any backend jobs that were running before page refresh
				const backendToReconnect = await analysisStore.attemptBackendReconnection();
				if (backendToReconnect && backendToReconnect.length > 0) {
					console.log(`🔄 Attempting to reconnect to ${backendToReconnect.length} backend job(s)`);
					await backendAnalysisRunner.reconnectToJobs(backendToReconnect);
				}

				// If there are analyses, select the most recent one
				if ($analysisStore.analyses.length > 0) {
					const mostRecent = [...$analysisStore.analyses].sort(
						(a, b) => b.createdAt - a.createdAt
					)[0];
					selectAnalysis(mostRecent.id);

					// Also load the alignment file for the current file if available
					if (mostRecent.fileId) {
						try {
							const alignmentFile = await persistentFileStore.getFile(mostRecent.fileId);
							if (alignmentFile) {
								alignmentFileStore.set(alignmentFile);

								// Also load the file metrics if we have a datareader result
								const datareaderAnalysis = $analysisStore.analyses.find(
									(a) =>
										a.fileId === mostRecent.fileId &&
										a.method === 'datareader' &&
										a.status === 'completed'
								);
								if (datareaderAnalysis?.result) {
									const metrics = JSON.parse(datareaderAnalysis.result);
									fileMetricsStore.set(metrics);
								}
							}
						} catch (err) {
							console.error('Error loading alignment file on mount:', err);
						}
					}
				}

				// Load tree data from the store if available
				const storedTrees = $treeStore;
				if (storedTrees && Object.keys(storedTrees).length > 0) {
					trees = { ...storedTrees };
					treeData = { ...storedTrees };
				}
			} catch (error) {
				console.error('Error loading saved data:', error);
			}
		}

		loading = false;
	});

	let file;
	let isStdOutVisible = false; // State for toggling stdout visibility
	let validationError = null;

	async function handleFileUpload(event) {
		// Track which entry point fired this call and which awaited step we're on,
		// so the file-validation-error catch can include both in telemetry.
		const source = event.isSelection
			? 'reselect'
			: event.isDemo
				? 'demo'
				: event.isRepaired
					? 'repair'
					: 'upload';
		let currentStage = 'init';
		try {
			// Reset tree state at the start of every file load. addTree only ever adds
			// keys, so without this a usertree extracted from a previous alignment would
			// survive into a different file that has no tree of its own (issue #167).
			trees = {};
			treeData = resetTrees();

			// Check if this is a file selection event (from FileManager)
			if (event.isSelection) {
				console.log('File selected from FileManager:', event.fileId);

				// Set the file from the event
				file = event.file;

				// Try to find existing DATAREADER analysis for this file
				const existingAnalyses = $analysisStore.analyses.filter(
					(a) => a.fileId === event.fileId && a.method === 'datareader' && a.status === 'completed'
				);

				if (existingAnalyses.length > 0) {
					// Use the most recent completed analysis
					const mostRecentAnalysis = existingAnalyses.sort((a, b) => b.createdAt - a.createdAt)[0];
					console.log('Using existing DATAREADER analysis:', mostRecentAnalysis.id);

					// Load the file metrics from the existing analysis
					if (mostRecentAnalysis.result) {
						try {
							fileMetricsJSON = JSON.parse(mostRecentAnalysis.result);

							// Set the file and its metrics in the store
							fileMetricsStore.set(fileMetricsJSON);
							alignmentFileStore.set(file);

							// Extract trees
							trees['nj'] = fileMetricsJSON.FILE_INFO?.nj;
							trees['usertree'] = fileMetricsJSON?.FILE_PARTITION_INFO?.['0']?.usertree;

							// Save extracted trees in treeData and update the tree store
							if (trees['nj']) {
								treeData = addTree('nj', trees['nj'], treeData);
							}
							if (trees['usertree']) {
								treeData = addTree('usertree', trees['usertree'], treeData);
							}

							// Select the existing analysis
							selectAnalysis(mostRecentAnalysis.id);

							// Switch to the data tab to show the file information
							changeTab('data');

							return; // Exit early since we've loaded existing analysis
						} catch (error) {
							console.error('Error parsing existing analysis:', error);
							// Continue with new analysis if parsing fails
						}
					}
				}

				// If we get here, either there was no existing analysis or there was an error loading it
				// Proceed with a new analysis using the selected file
			} else if (event.target && event.target.files) {
				// This is a new file upload
				file = event.target.files[0];
			}

			if (!file) return; // No file selected

			// Clear any previous errors
			validationError = null;

			// For new uploads, save the file to browser storage
			// For selections, this is already done
			let fileId;
			if (!event.isSelection) {
				// Pass any metadata from demo files
				const metadata = event.isDemo ? event.metadata : {};
				currentStage = 'storage';
				fileId = await persistentFileStore.uploadFile(file, metadata);
			} else {
				fileId = event.fileId;
			}

			// Check if there's already a DATAREADER analysis for this file
			const existingDatareaderAnalyses = $analysisStore.analyses.filter(
				(a) => a.fileId === fileId && a.method === 'datareader' && a.status === 'completed'
			);

			let analysisId;

			if (existingDatareaderAnalyses.length > 0 && event.isSelection) {
				// Use the existing analysis
				analysisId = existingDatareaderAnalyses[0].id;
				console.log('Using existing DATAREADER analysis:', analysisId);

				// Load the file metrics from the existing analysis
				const existingAnalysis = await analysisStore.getAnalysis(analysisId);
				if (existingAnalysis && existingAnalysis.result) {
					fileMetricsJSON = JSON.parse(existingAnalysis.result);

					// Set the file and its metrics in the store
					fileMetricsStore.set(fileMetricsJSON);
					alignmentFileStore.set(file);

					// Extract trees
					trees['nj'] = fileMetricsJSON.FILE_INFO?.nj;
					trees['usertree'] = fileMetricsJSON?.FILE_PARTITION_INFO?.['0']?.usertree;

					// Save extracted trees in treeData and update the tree store
					if (trees['nj']) {
						treeData = addTree('nj', trees['nj'], treeData);
					}
					if (trees['usertree']) {
						treeData = addTree('usertree', trees['usertree'], treeData);
					}

					// Select the existing analysis
					selectAnalysis(analysisId);

					// Switch to the data tab to show the file information
					changeTab('data');

					return; // Exit early since we've loaded existing analysis
				}
			}

			// Create a new analysis record and start progress tracking
			currentStage = 'storage';
			analysisId = await analysisStore.createAnalysis(fileId, 'datareader');
			analysisStore.startAnalysisProgress(analysisId, 'Initializing file analysis...');

			trackEvent('file-validation-started');

			// Mount the file for analysis
			analysisStore.updateAnalysisProgressById(
				analysisId,
				'mounting',
				20,
				'Mounting files for analysis...'
			);
			currentStage = 'mount';
			let inputFiles = await cliObj.mount([
				{ name: 'user.nex', data: await file.text() },
				{ name: 'datareader.bf', data: dataReader },
				{ name: 'HyPhyGlobals.ibf', data: HyPhyGlobals },
				{ name: 'chooseGeneticCode.def', data: chooseGeneticCode },
				{ name: 'ReadDelimitedFiles.bf', data: ReadDelimitedFiles },
				{ name: 'TreeTools.ibf', data: TreeTools },
				{ name: 'NJ.bf', data: NJ },
				{ name: 'PartitionReader.ibf', data: PartitionReader },
				{ name: 'GrabBag.bf', data: GrabBag }
			]);

			// Run the datareader analysis
			analysisStore.updateAnalysisProgressById(
				analysisId,
				'running',
				40,
				'Analyzing file structure...'
			);
			currentStage = 'exec';
			result = await cliObj.exec('hyphy LIBPATH=/res/ ' + inputFiles[1]);
			hyphyOut = await result.stdout;

			// Extract meaningful error from HyPhy stdout for better error reporting
			let hyphyError = null;
			if (hyphyOut) {
				const lines = hyphyOut.split('\n').filter((l) => l.trim());
				const errorPatterns = [
					/Expected \d+ sites?, but found \d+/,
					/stop codons? found/i,
					/not a valid/i,
					/divisible by 3/i,
					/at least 3 unique sequences/i,
					/too large/i
				];
				for (const line of lines) {
					if (errorPatterns.some((p) => p.test(line))) {
						hyphyError = line.trim();
						break;
					}
				}
				if (!hyphyError) {
					const errorLine = lines.find((l) => /^Error:/i.test(l.trim()));
					if (errorLine) {
						hyphyError = errorLine.trim().replace(/^Error:\s*/i, '');
					}
				}
			}

			// Check for tree-related messages in datareader output (not an error, just informational)
			const hasTreeParsingMessage =
				hyphyOut.includes('Illegal right hand side in call to Topology') ||
				hyphyOut.includes('tree string is invalid') ||
				hyphyOut.includes('Newick tree spec');

			if (hasTreeParsingMessage) {
				console.log('ℹ️ No valid tree found in file - will use inferred NJ tree');
			}

			// Log any error-like messages for debugging (but don't fail)
			if (hyphyOut.includes('Error') || hyphyOut.includes('error')) {
				const errorLines = hyphyOut
					.split('\n')
					.filter((line) => line.toLowerCase().includes('error'));
				if (errorLines.length > 0) {
					console.warn('HyPhy datareader messages:', errorLines);
				}
			}

			// Process results
			analysisStore.updateAnalysisProgressById(
				analysisId,
				'processing',
				80,
				'Processing file information...'
			);

			let jsonBlob;
			try {
				currentStage = 'download';
				jsonBlob = await cliObj.download('/shared/data/results.json');
			} catch (downloadError) {
				console.error('Failed to download results.json:', downloadError);
				throw new Error(
					hyphyError ||
						'File analysis failed. The file may be in an unsupported format or contain invalid data.'
				);
			}
			const response = await fetch(jsonBlob);
			const blob = await response.blob();
			jsonOut = await blob.text();

			// Validate that we got JSON, not an error page
			if (jsonOut.trim().startsWith('<!') || jsonOut.trim().startsWith('<html')) {
				console.error('Received HTML instead of JSON:', jsonOut.substring(0, 200));
				throw new Error(
					hyphyError ||
						'File analysis failed. Please check that your file is a valid FASTA or NEXUS alignment.'
				);
			}

			try {
				currentStage = 'parse';
				fileMetricsJSON = JSON.parse(jsonOut);
			} catch (parseError) {
				console.error(
					'Failed to parse results JSON:',
					parseError,
					'Content:',
					jsonOut.substring(0, 500)
				);
				throw new Error(
					hyphyError ||
						'File analysis produced invalid results. Please ensure your file is a valid sequence alignment.'
				);
			}

			// If datareader returned an error in JSON, surface it
			if (fileMetricsJSON?.error) {
				currentStage = 'datareader-error';
				fileMetricsStore.set(fileMetricsJSON);
				// Clean up legacy references to "detailed report below" from datareader.bf
				const cleanedError = fileMetricsJSON.error.replace(/\s*\(detailed report below\)/gi, '');
				throw new Error(cleanedError);
			}

			// Datareader.bf always emits a canonical FASTA alongside its JSON so the
			// JS layer can submit a known format downstream regardless of what the
			// user uploaded (PHYLIP, MEGA, CLUSTAL, NEXUS, FASTA). Download and
			// attach it to fileMetricsJSON so it survives IndexedDB caching.
			try {
				const fastaBlobPath = await cliObj.download('/shared/data/user.fasta');
				if (fastaBlobPath && typeof fastaBlobPath === 'string') {
					const fastaResponse = await fetch(fastaBlobPath);
					const fastaBlob = await fastaResponse.blob();
					const canonicalFasta = await fastaBlob.text();
					const trimmed = canonicalFasta?.trim().toLowerCase() ?? '';
					if (canonicalFasta && !trimmed.startsWith('<!') && !trimmed.startsWith('<html')) {
						fileMetricsJSON.canonicalFasta = canonicalFasta;
					}
				}
			} catch (canonicalErr) {
				// Non-fatal: older cached files or a failed write just means downstream
				// code falls back to reading the user's original blob.
				console.warn('Failed to read canonical FASTA from datareader output:', canonicalErr);
			}

			// Set the file and its metrics in the store
			fileMetricsStore.set(fileMetricsJSON);
			alignmentFileStore.set(file);

			trackEvent('file-validation-success', {
				format:
					fileMetricsJSON.FILE_INFO?.gencodeid >= 0
						? 'codon'
						: fileMetricsJSON.FILE_INFO?.gencodeid === -1
							? 'nucleotide'
							: 'protein',
				sequenceCount: fileMetricsJSON.FILE_INFO?.sequences || 0,
				siteCount: fileMetricsJSON.FILE_INFO?.sites || 0
			});

			// Extract trees
			trees['nj'] = fileMetricsJSON.FILE_INFO?.nj;
			// Guard the zero-key partition dereference: a present-but-empty or
			// differently-keyed FILE_PARTITION_INFO must not throw mid-upload after
			// stores were already set (issue #181).
			trees['usertree'] = fileMetricsJSON?.FILE_PARTITION_INFO?.['0']?.usertree;

			// Save extracted trees in treeData and update the tree store
			if (trees['nj']) {
				treeData = addTree('nj', trees['nj'], treeData);
			}
			if (trees['usertree']) {
				treeData = addTree('usertree', trees['usertree'], treeData);
			}

			// Save the file metrics as an analysis result in IndexedDB
			analysisStore.updateAnalysisProgressById(
				analysisId,
				'saving',
				90,
				'Saving file information...'
			);
			const completionTimestamp = new Date().getTime();
			await analysisStore.updateAnalysis(analysisId, {
				status: 'completed',
				result: JSON.stringify(fileMetricsJSON),
				completedAt: completionTimestamp
			});

			// Make sure to update the analysis in the store directly for immediate UI refresh
			analysisStore.update((state) => {
				const updatedAnalyses = state.analyses.map((a) =>
					a.id === analysisId
						? {
								...a,
								status: 'completed',
								result: JSON.stringify(fileMetricsJSON),
								completedAt: completionTimestamp
							}
						: a
				);

				return {
					...state,
					analyses: updatedAnalyses
				};
			});

			// Complete progress tracking
			analysisStore.completeAnalysisProgress(true, 'File analysis completed successfully.');

			// Select the new analysis
			selectAnalysis(analysisId);

			// Switch to the data tab to show the file information
			changeTab('data');
		} catch (error) {
			console.error('Error handling file upload:', error);
			hyphyOut = `Error: ${error.message}`;

			// Update progress tracking
			analysisStore.completeAnalysisProgress(false, `Error: ${error.message}`);

			// Determine error type and provide appropriate message
			const errorMsg = error.message || '';
			const isTreeError = /Tree|tree|Topology|Newick/.test(errorMsg);

			const errorType = isTreeError
				? 'invalid-tree'
				: errorMsg.includes('divisible by 3')
					? 'not-codon-aligned'
					: errorMsg.includes('stop codon')
						? 'stop-codons'
						: /nucleotide alignment|protein alignment|character states/.test(errorMsg)
							? 'wrong-alphabet'
							: /too large|must include prebuilt/.test(errorMsg)
								? 'dataset-too-large'
								: /at least \d+ unique sequences|No sequences found|No MATRIX block/.test(errorMsg)
									? 'insufficient-sequences'
									: /Aioli|not a valid value for parameter|Invalid parameter choice/.test(errorMsg)
										? 'runtime-error'
										: /format|valid alignment|valid FASTA|valid NEXUS|valid sequence|FASTA data is empty|partition specification|Sequence data found before header|File is empty/i.test(
													errorMsg
											  )
											? 'invalid-format'
											: 'unknown';
			const eventPayload = { errorType, stage: currentStage, source };
			if (errorType === 'unknown' || errorType === 'invalid-format') {
				// Defensive fallback: 338/342 unknown events had no message field in
				// telemetry because error.message was falsy (bare throw, throw {},
				// throw new Error() with no arg). Keep digging until we find a string.
				const fallback = errorMsg || error?.name || error?.toString() || 'No message available';
				eventPayload.message = String(fallback).slice(0, 500);
			}
			trackEvent('file-validation-error', eventPayload);

			// Set validation error for display
			validationError = {
				code: isTreeError ? 'TREE-001' : 'FASTA-999',
				message: isTreeError ? 'Tree parsing issue' : 'File processing error',
				details: error.message,
				type: {
					code: isTreeError ? 'TREE-001' : 'FASTA-999',
					message: isTreeError ? 'Tree parsing issue' : 'File processing error'
				}
			};
		}
	}

	// Toggle the stdout visibility
	const toggleStdOut = () => {
		isStdOutVisible = !isStdOutVisible;
	};

	// Toggle showing all history vs. just current file
	const toggleHistoryView = () => {
		showAllHistory = !showAllHistory;
	};

	// Toggle batch export view
	const toggleBatchExport = () => {
		showBatchExport = !showBatchExport;
	};

	// Handle validation results
	function handleValidated(event) {
		const results = event.detail;

		if (!results.valid && results.errors.length > 0) {
			validationError = results.errors[0];
		} else {
			validationError = null;
		}
	}

	// Handle using repaired FASTA file
	function handleUseRepaired(event) {
		const { content, name } = event.detail;

		if (content) {
			// Create a new file object from the repaired content
			const repairedFile = new File([content], name, {
				type: 'application/octet-stream'
			});

			// Process the repaired file
			file = repairedFile;
			handleFileUpload({ target: { files: [repairedFile] }, isRepaired: true });
		}
	}

	// Handle demo file selection
	function handleDemoFileSelect(event) {
		const { file, metadata } = event.detail;

		if (file) {
			// Process the demo file
			handleFileUpload({
				target: { files: [file] },
				isSelection: false,
				isDemo: true,
				metadata
			});
		}
	}

	// Handle tree selection changes
	function handleTreeChange(newTreeId, taggedNewick) {
		selectedTree = newTreeId;

		// Update tree data in store if we have a tagged Newick
		if (taggedNewick) {
			treeData = updateTaggedTree(newTreeId, taggedNewick, treeData);
		}
	}

	// Track tab changes with analytics
	function changeTab(newTab) {
		if (newTab !== activeTab) {
			trackEvent('tab-changed', { from_tab: activeTab, to_tab: newTab });
			activeTab = newTab;
		}
	}

	// Resync the descriptor stores (alignment/metrics/trees) to a given file so they describe the file
	// that currentFile now points at. Used by the re-run path, which otherwise only flips currentFile
	// and leaves the descriptor stores holding a different file's fasta+tree (issue #168).
	//
	// The body lives in lib/utils/descriptorSync.js so it can be tested. As a local function here it
	// had no seam a unit test could reach, which left the most dangerous of the state findings
	// unverified.
	async function syncDescriptorStoresForFile(fileId) {
		const synced = await syncDescriptorStores(fileId, {
			loadFile: (id) => persistentFileStore.getFile(id),
			analyses: $analysisStore.analyses
		});
		if (synced.file) file = synced.file;
		if (synced.metrics) fileMetricsJSON = synced.metrics;
		trees = synced.trees;
		treeData = synced.treeData;
	}

	// Handle tab switching events from child components
	async function handleSwitchTab(event) {
		if (event.detail && event.detail.tabName) {
			changeTab(event.detail.tabName);

			// If we have an analysis ID, select it
			if (event.detail.analysisId) {
				selectAnalysis(event.detail.analysisId);
			}

			// Handle re-run: set the method and file for the Analyze tab
			if (event.detail.rerun && event.detail.tabName === 'analyze') {
				// Set the method if provided
				if (event.detail.method) {
					selectedMethod = event.detail.method.toUpperCase();
				}

				// Set the current file if provided, and resync the descriptor stores so
				// alignment/metrics/tree describe the re-run file rather than the
				// previously-loaded one (issue #168).
				if (event.detail.fileId) {
					persistentFileStore.setCurrentFile(event.detail.fileId);
					await syncDescriptorStoresForFile(event.detail.fileId);
				}
			}
		}
	}

	// Handle page unload warning for running analyses
	function handleBeforeUnload(event) {
		// Check if there are any running analyses (WASM or backend)
		let hasRunningWasmAnalyses = false;
		let hasRunningBackendAnalyses = false;
		const unsubscribe = activeAnalyses.subscribe((active) => {
			hasRunningWasmAnalyses = active.some(
				(a) =>
					a.metadata?.executionMode === 'wasm' &&
					!['completed', 'error', 'cancelled', 'interrupted'].includes(a.status)
			);
			hasRunningBackendAnalyses = active.some(
				(a) =>
					a.metadata?.executionMode === 'backend' &&
					!['completed', 'error', 'cancelled', 'interrupted', 'connection_lost'].includes(a.status)
			);
		});
		unsubscribe();

		if (hasRunningWasmAnalyses) {
			// Standard way to trigger browser's leave confirmation dialog
			event.preventDefault();
			// Modern browsers require returnValue to be set
			event.returnValue = 'You have running analyses that will be interrupted if you leave.';
			return event.returnValue;
		}

		// For backend analyses, show a less severe warning (they can be reconnected)
		if (hasRunningBackendAnalyses) {
			event.preventDefault();
			event.returnValue =
				'You have backend analyses running. They will continue on the server, but you may need to wait for reconnection.';
			return event.returnValue;
		}
	}

	// Handle navigation from toast action (analysis completion)
	function handleNavigateToResults() {
		changeTab('results');
	}

	// Set up beforeunload handler
	if (browser) {
		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('navigate-to-results', handleNavigateToResults);
	}

	// Clean up event handlers on component destroy
	onDestroy(() => {
		if (browser) {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('navigate-to-results', handleNavigateToResults);
		}
	});
</script>

<svelte:window on:switchTab={handleSwitchTab} />

<div class="container mx-auto min-h-screen bg-brand-ghost">
	{#if loading}
		<div class="flex h-screen flex-col items-center justify-center px-4 text-center">
			<div class="loader mb-premium-md"></div>
			<p class="text-lg font-semibold text-brand-royal sm:text-premium-header">
				Loading the HyPhy analysis engine
			</p>
			<!-- Name the cost. It is a 6.4 MB download and the whole app is blocked on it; a bare
			     spinner makes a normal wait indistinguishable from a hang. -->
			<p class="text-text-muted mt-2 max-w-md text-sm">
				About 6 MB, downloaded once and cached in your browser after this.
			</p>
			{#if engineSlow}
				<p class="mt-4 max-w-md text-sm text-amber-700">
					This is taking longer than usual. The download is still running — on a slow connection it
					can take a few minutes. If it never finishes, reload the page to start over.
				</p>
			{/if}
		</div>
	{:else if engineError}
		<div class="flex h-screen flex-col items-center justify-center px-4">
			<div class="max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<h2 class="mb-2 text-lg font-semibold text-red-800">
					Couldn't load the HyPhy analysis engine
				</h2>
				<p class="mb-4 text-sm text-red-700">
					The engine is a 6.4 MB download that runs the analyses in your browser. Check your
					connection, and note that some institutional networks block or rewrite <code
						class="rounded bg-red-100 px-1">.wasm</code
					> files.
				</p>
				<p
					class="mb-4 break-words rounded bg-white/70 p-2 text-left font-mono text-xs text-red-900"
				>
					{engineError.message}
				</p>
				<div class="flex flex-wrap justify-center gap-3">
					<button
						class="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
						onclick={() => retryEngineLoad()}
					>
						Try again
					</button>
					<!-- Second path on purpose: a partial or corrupted cached copy reproduces the same
					     failure, and a plain retry would fetch the same bad bytes. -->
					<button
						class="rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
						onclick={() => retryEngineLoad({ clearCache: true })}
					>
						Clear cached engine and retry
					</button>
				</div>
			</div>
		</div>
	{:else}
		<div class="pb-6 sm:pb-premium-xl">
			<h1
				class="mb-4 text-xl font-bold tracking-premium-tight text-text-rich sm:mb-premium-xl sm:text-premium-headline"
			>
				Sequence Analysis Platform
			</h1>

			<!-- PRIME Feature Card -->
			{#if !primeCardDismissed}
				<div class="prime-card">
					<button
						class="prime-card-close"
						onclick={() => (primeCardDismissed = true)}
						aria-label="Dismiss"
					>
						<X size={14} />
					</button>
					<div class="prime-card-inner">
						<div class="prime-card-icon">
							<FlaskConical size={24} />
						</div>
						<div class="prime-card-content">
							<h3 class="prime-card-title">Introducing PRIME</h3>
							<p class="prime-card-subtitle">Property-Informed Models of Evolution</p>
							<p class="prime-card-desc">
								Characterize physicochemical selection in protein evolution. PRIME incorporates
								amino acid properties like molecular volume, hydropathy, and structural propensities
								to resolve the biophysical basis of selective constraint.
							</p>
							<div class="prime-card-actions">
								<a
									href="https://www.biorxiv.org/content/10.64898/2026.03.09.710461v1"
									target="_blank"
									rel="noopener noreferrer"
									class="prime-card-btn-preprint"
								>
									Read the preprint <ExternalLink size={13} />
								</a>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Main Tabbed Interface with Smart Navigation -->
			<SmartTabNavigation {activeTab} onChange={changeTab} />

			<!-- Tab Content with Progressive Enhancement -->
			{#if activeTab === 'data'}
				<!-- Data Tab -->
				<DataTab
					{handleFileUpload}
					{handleDemoFileSelect}
					{validationError}
					{fileMetricsJSON}
					{handleValidated}
					{handleUseRepaired}
					{activeTab}
					onChange={changeTab}
				/>
			{:else if activeTab === 'analyze'}
				<!-- Analyze Tab -->
				<AnalyzeTab
					{methodConfig}
					{runMethod}
					{selectedMethod}
					{hyphyOut}
					{isStdOutVisible}
					{toggleStdOut}
					{showAllHistory}
					{selectAnalysis}
					{activeTab}
					onChange={changeTab}
				/>
			{:else if activeTab === 'results'}
				<!-- Results Tab -->
				<ResultsTab
					{selectedAnalysisId}
					{selectAnalysis}
					{showAllHistory}
					{showBatchExport}
					{toggleBatchExport}
					{activeTab}
					onChange={changeTab}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	.loader {
		border: 16px solid var(--tw-border-platinum, #f1f5f9);
		border-top: 16px solid var(--tw-brand-royal, #7c3aed);
		border-radius: 50%;
		width: 120px;
		height: 120px;
		animation: spin 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	/* PRIME Feature Card */
	.prime-card {
		position: relative;
		margin-bottom: 1rem;
		border-radius: 12px;
		border: 1px solid #e9d5ff;
		background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 50%, #ede9fe 100%);
		overflow: hidden;
	}

	.prime-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, #7c3aed, #c2410c);
	}

	.prime-card-close {
		position: absolute;
		top: 10px;
		right: 10px;
		padding: 4px;
		border-radius: 6px;
		color: #9ca3af;
		cursor: pointer;
		transition: all 200ms;
	}

	.prime-card-close:hover {
		color: #6b7280;
		background: rgba(0, 0, 0, 0.05);
	}

	.prime-card-inner {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 20px 24px;
	}

	.prime-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 12px;
		background: linear-gradient(135deg, #7c3aed, #6d28d9);
		color: white;
		flex-shrink: 0;
	}

	.prime-card-content {
		flex: 1;
		min-width: 0;
	}

	.prime-card-title {
		font-size: 16px;
		font-weight: 700;
		color: #111827;
		margin: 0;
		line-height: 1.2;
	}

	.prime-card-subtitle {
		font-size: 13px;
		font-weight: 500;
		color: #7c3aed;
		margin: 2px 0 0;
	}

	.prime-card-desc {
		font-size: 13px;
		color: #475569;
		margin: 8px 0 0;
		line-height: 1.5;
	}

	.prime-card-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 12px;
		flex-wrap: wrap;
	}

	.prime-card-btn-preprint {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 14px;
		font-size: 13px;
		font-weight: 600;
		color: white;
		background: #7c3aed;
		border-radius: 6px;
		text-decoration: none;
		transition: background 200ms;
	}

	.prime-card-btn-preprint:hover {
		background: #6d28d9;
	}

	@media (max-width: 639px) {
		.prime-card-inner {
			padding: 16px;
		}

		.prime-card-icon {
			display: none;
		}

		.prime-card-desc {
			display: none;
		}
	}
</style>
