/**
 * WASM Analysis Runner - Handles client-side analysis execution via WebAssembly
 * Uses the Aioli library to run HyPhy analyses locally in the browser
 */

import { BaseAnalysisRunner } from './BaseAnalysisRunner.js';
import { aioliStore } from '../../stores/aioli.js';
import { get } from 'svelte/store';
import { getCachedOrCompute, generateAnalysisKey } from '../utils/cacheUtils.js';
import { sanitizeSequenceNames } from '../utils/fastaValidation.js';
import { safeParseJSON } from '../utils/jsonUtils.js';

/**
 * hyphy-analyses custom analyses that are NOT packed into the WASM /res/ image.
 * These `.bf` files are vendored under static/hyphy-analyses/ and mounted into the
 * WASM filesystem at runtime (their libv3/SelectionAnalyses/TemplateModels
 * dependencies are already present in the packed image). Keyed by lowercased method.
 */
const CUSTOM_ANALYSIS_BATCH_FILES = {
	nrm: {
		url: '/hyphy-analyses/NucleotideNonREV/NRM.bf',
		fileName: 'NRM.bf'
	}
};

/**
 * Strip embedded trees from alignment data
 * Both NEXUS and FASTA files can contain embedded trees that take precedence over separate tree files
 */
function stripEmbeddedTrees(alignmentData) {
	console.log('🌳 WASM: Checking for embedded trees in alignment data...');
	let cleaned = alignmentData;

	// Handle NEXUS format - look for TREES blocks
	if (alignmentData.toLowerCase().includes('#nexus')) {
		const treesBlockRegex = /begin\s+trees\s*;.*?end\s*;/gis;
		const hasTreesBlock = treesBlockRegex.test(alignmentData);

		if (hasTreesBlock) {
			console.log('🌳 WASM: Found embedded TREES block in NEXUS file, removing it...');
			cleaned = alignmentData.replace(treesBlockRegex, '');
			console.log('🌳 WASM: Stripped TREES block from NEXUS file');
		}
	}

	// Handle FASTA format - look for Newick trees appended at the end
	const lines = cleaned.split('\n');
	const filteredLines = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Check if this looks like a Newick tree (starts with parenthesis, contains colons and semicolon)
		if (line.startsWith('(') && line.includes(':') && line.includes(';')) {
			console.log('🌳 WASM: Found appended Newick tree in FASTA file, removing it...');
			// Skip this line
			continue;
		}

		// Keep all other lines
		filteredLines.push(lines[i]);
	}

	const result = filteredLines.join('\n');

	if (result !== alignmentData) {
		console.log('🌳 WASM: Stripped embedded tree from alignment file');
	}

	return result;
}

class WasmAnalysisRunner extends BaseAnalysisRunner {
	constructor() {
		super();
		this.isInitialized = false;
	}

	/**
	 * Initialize WASM environment
	 */
	async initialize() {
		if (this.isInitialized) return;

		const cliObj = get(aioliStore);
		if (!cliObj) {
			throw new Error('Aioli CLI object not available. Please initialize WASM first.');
		}

		this.isInitialized = true;
	}

	/**
	 * Run analysis using WebAssembly
	 */
	async runAnalysis(method, config, fastaData, treeData, fileId = null) {
		console.log('🚀 WasmAnalysisRunner.runAnalysis called with:', {
			method,
			fastaDataLength: fastaData?.length || 0,
			treeDataLength: treeData?.length || 0,
			configKeys: Object.keys(config || {}),
			config: config
		});

		console.log('🌳 TREE DEBUG - Input tree data:');
		console.log('Tree data length:', treeData?.length || 0);
		if (treeData) {
			console.log(
				'Tree preview:',
				treeData.substring(0, 300) + (treeData.length > 300 ? '...' : '')
			);
			console.log('Tree contains {FG} tags:', treeData.includes('{FG}'));
		} else {
			console.log('No tree data provided');
		}

		// Validate input using base class method (includes codon alignment check)
		this.validateInput(fastaData, treeData, method, config);

		// Ensure WASM is initialized
		await this.initialize();

		// Create analysis entry in store
		const analysisId = await this.createAnalysis(fileId, method.toUpperCase());
		const jobId = this.generateJobId(method);

		// Track this analysis
		this.activeAnalyses.set(jobId, analysisId);

		try {
			// Build arguments preview for tracking (before actual execution)
			const argsPreview = this.buildArgumentsPreview(method, config, treeData);

			// Start analysis tracking using base class method
			this.startAnalysisTracking(analysisId, method, 'wasm', null, argsPreview);

			// Generate cache key for this analysis
			const cacheKey = generateAnalysisKey(
				method,
				`${fastaData.length}_${treeData.length}`,
				config
			);

			// Try to get result from cache or compute it
			const result = await getCachedOrCompute(
				cacheKey,
				() => this.executeWasmAnalysis(analysisId, method, config, fastaData, treeData),
				30 * 60 * 1000 // 30 minute cache
			);

			// Complete the analysis
			await this.completeAnalysis(analysisId, true, result.json || result);
			this.activeAnalyses.delete(jobId);

			console.log(
				`Analysis ${method} completed successfully${result.cached ? ' (from cache)' : ''}`
			);

			return {
				analysisId,
				jobId,
				message: `Analysis completed ${result.cached ? '(from cache)' : ''}`
			};
		} catch (error) {
			console.error('❌ WASM analysis execution failed:', error);
			await this.completeAnalysis(analysisId, false, null, error.message);
			this.activeAnalyses.delete(jobId);
			throw error;
		}
	}

	/**
	 * Execute the actual WASM analysis
	 */
	async executeWasmAnalysis(analysisId, method, config, fastaData, treeData) {
		const cliObj = get(aioliStore);

		this.updateProgress(analysisId, 'mounting', 10, 'Preparing analysis files...');

		// Strip any embedded trees from alignment data (NEXUS or FASTA)
		const cleanedFastaData = stripEmbeddedTrees(fastaData);

		// Sanitize sequence names to remove characters invalid in Newick format
		const { sanitizedFasta, sanitizedTree } = sanitizeSequenceNames(
			cleanedFastaData,
			treeData
		);

		// Create temporary file from cleaned FASTA data
		const inputFile = new File([sanitizedFasta], 'user.nex', { type: 'text/plain' });

		// Prepare files to mount
		const filesToMount = [{ name: 'user.nex', data: sanitizedFasta }];

		// Add tree file if provided
		if (sanitizedTree && sanitizedTree.trim()) {
			console.log('🌳 TREE DEBUG - Tree data being mounted:');
			console.log('Tree length:', sanitizedTree.length);
			console.log(
				'Tree content (first 200 chars):',
				sanitizedTree.substring(0, 200) + (sanitizedTree.length > 200 ? '...' : '')
			);
			console.log('Tree has {FG} tags:', sanitizedTree.includes('{FG}'));
			console.log('🌳🔥 FULL TREE FILE CONTENTS BEING WRITTEN TO /shared/data/user.tree:');
			console.log('=== START TREE FILE ===');
			console.log(sanitizedTree);
			console.log('=== END TREE FILE ===');
			filesToMount.push({ name: 'user.tree', data: sanitizedTree });
		}

		// Some analyses (e.g. NRM) are hyphy-analyses custom batch files that are NOT
		// packed into the WASM /res/ image. Vendor them under static/hyphy-analyses/
		// and mount the required one at runtime. All of their LoadFunctionLibrary
		// dependencies (libv3/*, SelectionAnalyses/modules/*, TemplateModels/*) ARE
		// already in /res/, so only the top-level .bf needs mounting.
		const customAnalysisPath = CUSTOM_ANALYSIS_BATCH_FILES[method.toLowerCase()];
		let mountedCustomBatchFile = null;
		if (customAnalysisPath) {
			const bfResponse = await fetch(customAnalysisPath.url);
			if (!bfResponse.ok) {
				throw new Error(
					`Failed to fetch custom analysis batch file for ${method}: ${customAnalysisPath.url} (${bfResponse.status})`
				);
			}
			const bfText = await bfResponse.text();
			filesToMount.push({ name: customAnalysisPath.fileName, data: bfText });
		}

		// Mount the files
		const inputFiles = await cliObj.mount(filesToMount);

		// The custom batch file (if any) is the last entry we pushed onto filesToMount.
		if (customAnalysisPath) {
			mountedCustomBatchFile = inputFiles[inputFiles.length - 1];
		}

		this.updateProgress(analysisId, 'running', 20, 'Building analysis command...');

		// Build arguments
		const args = [];
		args.push(`--alignment ${inputFiles[0]}`);

		// Add tree argument if tree data was provided
		if (sanitizedTree && sanitizedTree.trim()) {
			args.push(`--tree ${inputFiles[1]}`);
		}

		// NRM (nucleotide non-reversibility) writes its JSON to <alignment>.NRM.json by
		// default; pass --output explicitly so the result path matches what we download
		// below, regardless of how the batch file derives its default.
		if (method.toLowerCase() === 'nrm') {
			args.push(`--output ${inputFiles[0]}.NRM.json`);
		}

		// Map configuration parameters to HyPhy command line arguments
		for (const [key, value] of Object.entries(config)) {
			if (
				key !== 'tree' &&
				key !== 'method' &&
				key !== 'executionMode' &&
				key !== 'interactiveTree' &&
				key !== 'selectedBranchCount' &&
				key !== 'selectedBranchNames' &&
				key !== 'branchSet1' &&
				key !== 'branchSet2' &&
				key !== 'testBranches' &&
				key !== 'referenceBranches' &&
				key !== 'variant'
			) {
				// Handle specific FEL parameter mappings
				if (key === 'branchesToTest') {
					// Handle branch selection - convert Interactive to FG for HyPhy
					// EXCEPT for Contrast-FEL which uses --branch-set parameters instead
					if (value === 'Interactive') {
						if (method.toLowerCase() === 'contrast-fel') {
							console.log(
								'🌳 WASM - Skipping --branches FG for Contrast-FEL (uses --branch-set instead)'
							);
							// Skip - Contrast-FEL uses --branch-set parameters
						} else if (method.toLowerCase() === 'relax') {
							console.log(
								'🌳 WASM - Skipping --branches FG for RELAX (uses --test and --reference instead)'
							);
							// Skip - RELAX uses --test and --reference parameters
						} else {
							console.log('🌳 WASM - Converting Interactive to FG for HyPhy');
							args.push(`--branches FG`);
						}
					} else {
						// Always pass --branches explicitly (including 'All') to avoid
						// stale state issues with Emscripten's callMain between invocations
						args.push(`--branches ${value || 'All'}`);
					}
				} else if (key === 'propertySet') {
					// PRIME property set parameter
					args.push(`--property-set ${value}`);
				} else if (key === 'imputeStates') {
					// PRIME impute states parameter
					args.push(`--impute-states ${value}`);
				} else if (key === 'geneticCode') {
					// Pass the descriptive string value (HyPhy WASM does not accept the
					// numeric code id on the CLI). Known limitation: aioli's exec() does
					// a plain command.split(' '), so multi-word names like
					// 'Vertebrate mitochondrial' get split into '--code Vertebrate' +
					// stray 'mitochondrial' and HyPhy rejects the truncated value. The
					// proper fix is to refactor args into an array passed to
					// cliObj.exec(cmd, argsArray) — tracked separately.
					console.log('🧬 WASM - Using genetic code:', value);
					args.push(`--code ${value}`);
				} else if (key === 'srv') {
					// Synonymous rate variation
					args.push(`--srv ${value}`);
				} else if (key === 'multipleHits') {
					// Multiple hits parameter
					if (value !== 'None') {
						args.push(`--multiple-hits ${value}`);
					}
				} else if (key === 'siteMultihit') {
					// Site multihit parameter (only when multiple hits enabled)
					if (config.multipleHits && config.multipleHits !== 'None') {
						args.push(`--site-multihit ${value}`);
					}
				} else if (key === 'resample' && value > 0) {
					// Bootstrap resampling
					args.push(`--resample ${value}`);
				} else if (key === 'confidenceIntervals') {
					// Confidence intervals
					args.push(`--ci ${value ? 'Yes' : 'No'}`);
				} else if (key === 'blb') {
					// Bag of Little Bootstrap parameter for aBSREL
					args.push(`--blb ${value}`);
				} else if (key === 'pValueThreshold') {
					// P-value threshold (custom parameter, not standard HyPhy)
					// This would be handled post-processing
					continue;
				} else if (key === 'steps') {
					// BGM chain length steps
					args.push(`--steps ${value}`);
				} else if (key === 'burnIn') {
					// BGM burn-in samples
					args.push(`--burn-in ${value}`);
				} else if (key === 'samples') {
					// BGM samples
					args.push(`--samples ${value}`);
				} else if (key === 'maxParents') {
					// BGM maximum parents per node
					args.push(`--max-parents ${value}`);
				} else if (key === 'minSubs') {
					// BGM minimum substitutions per site
					args.push(`--min-subs ${value}`);
				} else if (key === 'rates') {
					// Multi-Hit rate classes parameter
					args.push(`--rates ${value}`);
			} else if (key === 'rate_classes') {
				// NRM rate classes parameter (convert underscore to hyphen)
				args.push(`--rate-classes ${value}`);

				} else if (key === 'triple_islands') {
					// Multi-Hit triple islands parameter (convert underscore to hyphen)
					args.push(`--triple-islands ${value}`);
				} else if (key === 'mode') {
					// RELAX mode parameter - skip if default value to avoid space-in-value issues
					// "Classic mode" is the default, so we only need to pass it if different
					if (value !== 'Classic mode') {
						// For now, only Classic mode is supported, so this shouldn't happen
						console.warn('🚨 WASM - Non-default mode value:', value);
					}
					// Skip passing --mode parameter
				} else if (typeof value === 'boolean') {
					// Boolean parameters
					args.push(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()} ${value ? 'Yes' : 'No'}`);
				} else if (value !== null && value !== undefined && value !== '') {
					// All other parameters (including strings with spaces)
					// Don't add quotes - HyPhy WASM doesn't parse them correctly
					args.push(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()} ${value}`);
				}
			}
		}

		// Add Contrast-FEL branch set parameters (repeatable --branch-set with tag names)
		if (method.toLowerCase() === 'contrast-fel') {
			if (config.branchSet1) {
				console.log('🌳 WASM - Adding Contrast-FEL branch-set:', config.branchSet1);
				args.push(`--branch-set`);
				args.push(config.branchSet1);
			}
			if (config.branchSet2) {
				console.log('🌳 WASM - Adding Contrast-FEL branch-set:', config.branchSet2);
				args.push(`--branch-set`);
				args.push(config.branchSet2);
			}
		}

		// Add RELAX test and reference branch parameters
		if (method.toLowerCase() === 'relax') {
			if (config.testBranches) {
				console.log('🌳 WASM - Adding RELAX test branches:', config.testBranches);
				args.push('--test');
				args.push(config.testBranches);
			}
			if (config.referenceBranches) {
				console.log('🌳 WASM - Adding RELAX reference branches:', config.referenceBranches);
				args.push('--reference');
				args.push(config.referenceBranches);
			}
		}

		// Add method-specific default arguments for BGM
		if (method.toLowerCase() === 'bgm') {
			// BGM requires explicit data type specification
			if (!args.some((arg) => arg.includes('--type'))) {
				args.push('--type codon');
			}
			// BGM requires branches specification
			if (!args.some((arg) => arg.includes('--branches'))) {
				args.push('--branches All');
			}
		}

		// Map method names to HyPhy batch file paths (relative to LIBPATH/TemplateBatchFiles/)
		// Using explicit paths avoids issues with method name resolution across multiple callMain invocations
		const methodBatchFileMap = {
			'multi-hit': 'SelectionAnalyses/FitMultiModel.bf',
			multihit: 'SelectionAnalyses/FitMultiModel.bf',
			'MULTI-HIT': 'SelectionAnalyses/FitMultiModel.bf',
			absrel: 'SelectionAnalyses/aBSREL.bf',
			bgm: 'BGM.bf',
			busted: 'SelectionAnalyses/BUSTED.bf',
			'contrast-fel': 'SelectionAnalyses/contrast-fel.bf',
			fade: 'SelectionAnalyses/FADE.bf',
			fel: 'SelectionAnalyses/FEL.bf',
			fubar: 'SelectionAnalyses/FUBAR.bf',
			gard: 'GARD.bf',
			meme: 'SelectionAnalyses/MEME.bf',
			prime: 'SelectionAnalyses/PRIME.bf',
			relax: 'SelectionAnalyses/RELAX.bf',
			slac: 'SelectionAnalyses/SLAC.bf',
			'b-still': 'SelectionAnalyses/B-STILL.bf'
		};
		const methodKey = method.toLowerCase();
		const batchFile = methodBatchFileMap[methodKey];
		// Custom analyses run from the runtime-mounted batch file path; stock analyses
		// run from the packed /res/ tree; anything else falls back to the bare method name.
		const hyphyCommand = mountedCustomBatchFile
			? mountedCustomBatchFile
			: batchFile
				? `/res/TemplateBatchFiles/${batchFile}`
				: methodKey;

		// Build and execute the command
		const fullHyphyCommand = `hyphy LIBPATH=/res/ ${hyphyCommand} ${args.join(' ')}`;
		console.log(`Executing HyPhy command: ${fullHyphyCommand}`);

		this.updateProgress(analysisId, 'running', 40, `Executing ${method} analysis...`);

		// Run the analysis
		const cmdResult = await cliObj.exec(fullHyphyCommand);
		const stdout = await cmdResult.stdout;

		// Add command execution details to stdout for debugging
		const commandInfo = `\n=== HyPhy Command Execution ===\nCommand: ${fullHyphyCommand}\nFiles mounted: ${filesToMount.map((f) => f.name).join(', ')}\nTree data provided: ${sanitizedTree && sanitizedTree.trim() ? 'Yes' : 'No'}\n================================\n\n`;
		const enhancedStdout = commandInfo + stdout;

		// Check for common HyPhy errors
		if (stdout.includes('is not a valid choice passed to')) {
			const errorMatch = stdout.match(/'([^']+)' is not a valid choice passed to '([^']+)'/);
			if (errorMatch) {
				const [_, invalidValue, paramName] = errorMatch;
				throw new Error(
					`HyPhy error: '${invalidValue}' is not a valid value for parameter '${paramName}'. Please check your input parameters.`
				);
			} else {
				throw new Error(
					'HyPhy error: Invalid parameter choice. Please check your input parameters.'
				);
			}
		}

		// Check for tree-related errors
		if (stdout.includes('Illegal right hand side in call to Topology') ||
			stdout.includes('tree string is invalid') ||
			stdout.includes('Newick tree spec')) {
			throw new Error(
				'Tree format error. Please select "Inferred NJ tree" in the Analyze tab, or upload a valid Newick tree file.'
			);
		}

		this.updateProgress(analysisId, 'processing', 80, 'Processing results...');

		// Map method names to their result file extensions
		const resultFileMap = {
			'multi-hit': 'FITTER',
			multihit: 'FITTER',
			'MULTI-HIT': 'FITTER',
			'b-still': 'FUBAR-inv',
			'B-STILL': 'FUBAR-inv'
		};
		const resultFileSuffix = resultFileMap[method] || method.toUpperCase();

		// Get the JSON result
		const jsonBlob = await cliObj.download(`/shared/data/user.nex.${resultFileSuffix}.json`);
		const response = await fetch(jsonBlob);
		const blob = await response.blob();
		const jsonText = await blob.text();

		// Guard against HTML responses (e.g. dev-server 404 when HyPhy produced no result file).
		// Without this, safeParseJSON surfaces the raw V8 message ("Unexpected token '<', \"<!doctype...\"")
		// which is meaningless to users and noisy in telemetry.
		if (jsonText.trim().startsWith('<!') || jsonText.trim().startsWith('<html')) {
			throw new Error(
				`HyPhy ${method} analysis did not produce a result file. Check the analysis output for errors.`
			);
		}

		const jsonData = safeParseJSON(jsonText);

		this.updateProgress(analysisId, 'saving', 95, 'Saving results...');

		// Return the combined result
		return {
			stdout: enhancedStdout,
			json: jsonData,
			cached: false
		};
	}

	/**
	 * Build arguments preview for database storage (before actual execution)
	 */
	buildArgumentsPreview(method, config, treeData) {
		const args = [];
		args.push(`--alignment user.nex`);

		// Add tree argument if tree data was provided
		if (treeData && treeData.trim()) {
			args.push(`--tree user.tree`);
		}

		// Map configuration parameters to HyPhy command line arguments
		for (const [key, value] of Object.entries(config)) {
			if (
				key !== 'tree' &&
				key !== 'method' &&
				key !== 'executionMode' &&
				key !== 'interactiveTree' &&
				key !== 'selectedBranchCount' &&
				key !== 'selectedBranchNames' &&
				key !== 'branchSet1' &&
				key !== 'branchSet2' &&
				key !== 'testBranches' &&
				key !== 'referenceBranches' &&
				key !== 'variant'
			) {
				// Handle specific FEL parameter mappings
				if (key === 'branchesToTest') {
					// Handle branch selection - convert Interactive to FG for HyPhy
					// EXCEPT for Contrast-FEL which uses --branch-set parameters instead
					if (value === 'Interactive') {
						if (method.toLowerCase() === 'contrast-fel') {
							// Skip - Contrast-FEL uses --branch-set parameters
						} else if (method.toLowerCase() === 'relax') {
							// Skip - RELAX uses --test and --reference parameters
						} else {
							args.push(`--branches FG`);
						}
					} else {
						// Always pass --branches explicitly (including 'All') to avoid
						// stale state issues with Emscripten's callMain between invocations
						args.push(`--branches ${value || 'All'}`);
					}
				} else if (key === 'propertySet') {
					// PRIME property set parameter
					args.push(`--property-set ${value}`);
				} else if (key === 'imputeStates') {
					// PRIME impute states parameter
					args.push(`--impute-states ${value}`);
				} else if (key === 'geneticCode') {
					// Pass the descriptive string value (HyPhy WASM does not accept the
					// numeric code id on the CLI). Known limitation: aioli's exec() does
					// a plain command.split(' '), so multi-word names like
					// 'Vertebrate mitochondrial' get split into '--code Vertebrate' +
					// stray 'mitochondrial' and HyPhy rejects the truncated value. The
					// proper fix is to refactor args into an array passed to
					// cliObj.exec(cmd, argsArray) — tracked separately.
					console.log('🧬 WASM - Using genetic code:', value);
					args.push(`--code ${value}`);
				} else if (key === 'srv') {
					// Synonymous rate variation
					args.push(`--srv ${value}`);
				} else if (key === 'multipleHits') {
					// Multiple hits parameter
					if (value !== 'None') {
						args.push(`--multiple-hits ${value}`);
					}
				} else if (key === 'siteMultihit') {
					// Site multihit parameter (only when multiple hits enabled)
					if (config.multipleHits && config.multipleHits !== 'None') {
						args.push(`--site-multihit ${value}`);
					}
				} else if (key === 'resample' && value > 0) {
					// Bootstrap resampling
					args.push(`--resample ${value}`);
				} else if (key === 'confidenceIntervals') {
					// Confidence intervals
					args.push(`--ci ${value ? 'Yes' : 'No'}`);
				} else if (key === 'blb') {
					// Bag of Little Bootstrap parameter for aBSREL
					args.push(`--blb ${value}`);
				} else if (key === 'pValueThreshold') {
					// P-value threshold (custom parameter, not standard HyPhy)
					// This would be handled post-processing
					continue;
				} else if (key === 'steps') {
					// BGM chain length steps
					args.push(`--steps ${value}`);
				} else if (key === 'burnIn') {
					// BGM burn-in samples
					args.push(`--burn-in ${value}`);
				} else if (key === 'samples') {
					// BGM samples
					args.push(`--samples ${value}`);
				} else if (key === 'maxParents') {
					// BGM maximum parents per node
					args.push(`--max-parents ${value}`);
				} else if (key === 'minSubs') {
					// BGM minimum substitutions per site
					args.push(`--min-subs ${value}`);
				} else if (key === 'rates') {
					// Multi-Hit rate classes parameter
					args.push(`--rates ${value}`);
				} else if (key === 'triple_islands') {
					// Multi-Hit triple islands parameter (convert underscore to hyphen)
					args.push(`--triple-islands ${value}`);
				} else if (key === 'mode') {
					// RELAX mode parameter - skip if default value to avoid space-in-value issues
					if (value !== 'Classic mode') {
						console.warn('🚨 WASM - Non-default mode value:', value);
					}
					// Skip passing --mode parameter
				} else if (typeof value === 'boolean') {
					// Boolean parameters
					args.push(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()} ${value ? 'Yes' : 'No'}`);
				} else if (value !== null && value !== undefined && value !== '') {
					// All other parameters (including strings with spaces)
					// Don't add quotes - HyPhy WASM doesn't parse them correctly
					args.push(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()} ${value}`);
				}
			}
		}

		// Add Contrast-FEL branch set parameters (repeatable --branch-set with tag names)
		if (method.toLowerCase() === 'contrast-fel') {
			if (config.branchSet1) {
				args.push(`--branch-set`);
				args.push(config.branchSet1);
			}
			if (config.branchSet2) {
				args.push(`--branch-set`);
				args.push(config.branchSet2);
			}
		}
		// Add RELAX test and reference branch parameters (preview version)
		if (method.toLowerCase() === 'relax') {
			if (config.testBranches) {
				args.push('--test');
				args.push(config.testBranches);
			}
			if (config.referenceBranches) {
				args.push('--reference');
				args.push(config.referenceBranches);
			}
		}

		// Add method-specific default arguments for BGM (preview version)
		if (method.toLowerCase() === 'bgm') {
			// BGM requires explicit data type specification
			if (!args.some((arg) => arg.includes('--type'))) {
				args.push('--type codon');
			}
			// BGM requires branches specification
			if (!args.some((arg) => arg.includes('--branches'))) {
				args.push('--branches All');
			}
		}

		return {
			command: `hyphy LIBPATH=/res/ ${method.toLowerCase()} ${args.join(' ')}`,  // Preview shows method name for readability
			method: method.toUpperCase(),
			parameters: config,
			treeData: treeData
				? {
						provided: true,
						length: treeData.length,
						source: 'user-provided'
					}
				: {
						provided: false,
						source: 'none'
					},
			executionMode: 'wasm'
		};
	}

	/**
	 * Clean up WASM resources
	 */
	destroy() {
		super.destroy();
		this.isInitialized = false;
	}
}

// Export singleton instance
export const wasmAnalysisRunner = new WasmAnalysisRunner();
export default wasmAnalysisRunner;
