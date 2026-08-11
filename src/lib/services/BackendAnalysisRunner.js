/**
 * BackendAnalysisRunner - Handles server-side analysis execution via Socket.IO
 * Integrates with the existing Datamonkey backend server used in demo pages
 */

import io from 'socket.io-client';
import { DATAMONKEY_SERVER_URL } from '../config/env.ts';
import { BaseAnalysisRunner } from './BaseAnalysisRunner.js';
import { analysisStore } from '../../stores/analyses.js';
import { sanitizeSequenceNames } from '../utils/fastaValidation.js';

/**
 * Strip embedded trees from alignment data
 * Both NEXUS and FASTA files can contain embedded trees that take precedence over separate tree files
 */
function stripEmbeddedTrees(alignmentData) {
	console.log('🌳 BACKEND: Checking for embedded trees in alignment data...');
	let cleaned = alignmentData;

	// Handle NEXUS format - look for TREES blocks
	if (alignmentData.toLowerCase().includes('#nexus')) {
		const treesBlockRegex = /begin\s+trees\s*;.*?end\s*;/gis;
		const hasTreesBlock = treesBlockRegex.test(alignmentData);

		if (hasTreesBlock) {
			console.log('🌳 BACKEND: Found embedded TREES block in NEXUS file, removing it...');
			cleaned = alignmentData.replace(treesBlockRegex, '');
			console.log('🌳 BACKEND: Stripped TREES block from NEXUS file');
		}
	}

	// Handle FASTA format - look for Newick trees appended at the end
	const lines = cleaned.split('\n');
	const filteredLines = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Check if this looks like a Newick tree (starts with parenthesis, contains colons and semicolon)
		if (line.startsWith('(') && line.includes(':') && line.includes(';')) {
			console.log('🌳 BACKEND: Found appended Newick tree in FASTA file, removing it...');
			// Skip this line
			continue;
		}

		// Keep all other lines
		filteredLines.push(lines[i]);
	}

	const result = filteredLines.join('\n');

	if (result !== alignmentData) {
		console.log('🌳 BACKEND: Stripped embedded tree from alignment file');
	}

	return result;
}

class BackendAnalysisRunner extends BaseAnalysisRunner {
	constructor() {
		super();
		this.socket = null;
		this.serverUrl = DATAMONKEY_SERVER_URL;
	}

	/**
	 * Initialize connection to backend server
	 */
	async connect(serverUrl = this.serverUrl) {
		if (this.socket && this.socket.connected) {
			return this.socket;
		}

		this.serverUrl = serverUrl;
		this.socket = io(serverUrl, {
			timeout: 10000,
			reconnection: true,
			reconnectionDelay: 1000,
			reconnectionAttempts: 5
		});

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Backend connection timeout'));
			}, 10000);

			this.socket.on('connect', () => {
				clearTimeout(timeout);
				console.log('✅ BackendAnalysisRunner: Connected to server');
				this.setupGlobalHandlers();
				resolve(this.socket);
			});

			this.socket.on('connect_error', (error) => {
				clearTimeout(timeout);
				console.error('❌ BackendAnalysisRunner: Connection failed', error);
				reject(new Error(`Backend connection failed: ${error.message}`));
			});
		});
	}

	/**
	 * Setup global event handlers for all analyses
	 */
	setupGlobalHandlers() {
		// Generic handlers that work for all analysis methods
		this.socket.on('status update', (status) => {
			// Try to find the analysis ID for this status update
			if (status.jobId && this.activeAnalyses.has(status.jobId)) {
				const analysisId = this.activeAnalyses.get(status.jobId);
				this.updateProgress(
					analysisId,
					'running',
					status.progress || 0,
					status.msg || status.phase || 'Analysis in progress'
				);
			} else if (this.activeAnalyses.size === 1) {
				// If only one analysis is running, we can safely assume it's for that one
				const [jobId, analysisId] = this.activeAnalyses.entries().next().value;
				this.updateProgress(
					analysisId,
					'running',
					status.progress || 0,
					status.msg || status.phase || 'Analysis in progress'
				);
			} else if (this.activeAnalyses.size > 1) {
				// Multiple analyses running but no jobId - fallback to old behavior
				console.warn('Status update received without jobId, cannot route to specific analysis');
				this.updateProgress(
					null, // Will use active analysis fallback in base class
					'running',
					status.progress || 0,
					status.msg || status.phase || 'Analysis in progress'
				);
			}
		});

		this.socket.on('completed', async (data) => {
			console.log('✅ Backend analysis completed');

			const results = data.results || data;

			// Route strictly by jobId. Completing the "first" active analysis on a
			// missing/unmatched jobId would misroute results between concurrent jobs.
			if (data.jobId && this.activeAnalyses.has(data.jobId)) {
				const analysisId = this.activeAnalyses.get(data.jobId);
				await this.completeAnalysis(analysisId, true, results);
				this.activeAnalyses.delete(data.jobId);
			} else {
				console.warn('⚠️ Completed event without a matching jobId, ignoring to avoid misrouting:', {
					receivedJobId: data.jobId,
					activeAnalysesCount: this.activeAnalyses.size
				});
			}
		});

		this.socket.on('script error', async (error) => {
			console.error('❌ Backend analysis error:', error);

			// Detect tree-related errors and provide clearer message
			const errorMsg = error.message || error || '';
			let userFacingError = `Analysis failed: ${errorMsg}`;

			if (
				errorMsg.includes('Illegal right hand side in call to Topology') ||
				errorMsg.includes('tree string is invalid') ||
				errorMsg.includes('Newick tree spec')
			) {
				userFacingError =
					'Tree format error. Please select "Inferred NJ tree" in the Analyze tab, or upload a valid Newick tree file.';
			}

			// Route strictly by jobId. Failing every active analysis would incorrectly
			// kill concurrent jobs that had nothing to do with this error.
			const errorJobId = error.jobId || error.id;
			if (errorJobId && this.activeAnalyses.has(errorJobId)) {
				const analysisId = this.activeAnalyses.get(errorJobId);
				await this.completeAnalysis(analysisId, false, null, userFacingError);
				this.activeAnalyses.delete(errorJobId);
			} else {
				console.warn(
					'⚠️ Script error without a matching jobId, not failing any analysis to avoid killing concurrent jobs:',
					{
						receivedJobId: errorJobId,
						activeAnalysesCount: this.activeAnalyses.size
					}
				);
			}
		});

		this.socket.on('validated', (result) => {
			console.log('✅ Backend parameter validation:', result);
			// This is handled per-analysis in runAnalysis method
		});

		this.socket.on('job queue', (jobs) => {
			console.log('📋 Backend job queue:', jobs);
			// Could update UI with queue information
		});
	}

	/**
	 * Run analysis on backend server
	 */
	async runAnalysis(method, config, fastaData, treeData, fileId = null) {
		console.log('🚀 BackendAnalysisRunner.runAnalysis called with:', {
			method,
			fastaDataLength: fastaData?.length || 0,
			treeDataLength: treeData?.length || 0,
			configKeys: Object.keys(config || {})
		});

		// Validate input using base class method (includes codon alignment check)
		this.validateInput(fastaData, treeData, method, config);

		if (!this.socket || !this.socket.connected) {
			console.log('🔌 Socket not connected, attempting to connect...');
			await this.connect();
		}

		// Create analysis entry in store
		const analysisId = await this.createAnalysis(fileId, method.toUpperCase());
		const jobId = this.generateJobId(method);

		// Track this analysis
		this.activeAnalyses.set(jobId, analysisId);

		try {
			// Prepare analysis parameters based on method
			const analysisParams = this.prepareAnalysisParameters(method, config);

			// Build arguments preview for tracking
			const argsPreview = this.buildArgumentsPreview(method, config, treeData, analysisParams);

			// Start analysis tracking using base class method (includes jobId for reconnection)
			this.startAnalysisTracking(analysisId, method, 'backend', null, argsPreview, jobId);

			// Submit to backend
			// Map method names to backend socket event names
			const methodNameMap = {
				'contrast-fel': 'cfel',
				'multi-hit': 'multihit',
				'b-still': 'bstill'
			};
			const backendMethodName = methodNameMap[method.toLowerCase()] || method.toLowerCase();
			const eventName = `${backendMethodName}:spawn`;

			// Strip embedded trees from alignment data (NEXUS or FASTA)
			const cleanedFastaData = stripEmbeddedTrees(fastaData);

			// Sanitize sequence names to remove characters invalid in Newick format
			const { sanitizedFasta, sanitizedTree } = sanitizeSequenceNames(cleanedFastaData, treeData);

			console.log(`📤 Submitting ${method} analysis to backend:`, eventName, {
				alignmentLength: sanitizedFasta.length,
				treeLength: sanitizedTree.length,
				jobId,
				jobParams: analysisParams
			});

			const submitData = {
				alignment: sanitizedFasta,
				tree: sanitizedTree,
				job: {
					id: jobId, // Include jobId for reconnection support (backend 2.8.0+)
					...analysisParams
				}
			};

			this.socket.emit(eventName, submitData);

			// Update progress
			this.updateProgress(analysisId, 'pending', 5, `Job submitted - ID: ${jobId}`);

			return {
				analysisId,
				jobId,
				message: `Analysis submitted to backend server`
			};
		} catch (error) {
			console.error('❌ Backend analysis submission failed:', error);
			await this.completeAnalysis(analysisId, false, null, `Submission failed: ${error.message}`);
			this.activeAnalyses.delete(jobId);
			throw error;
		}
	}

	/**
	 * Attempt to reconnect to orphaned backend jobs after page refresh
	 * Uses the new job:status and {method}:resubscribe Socket.IO events
	 * @param {Array} analysesToReconnect - Analyses from attemptBackendReconnection()
	 */
	async reconnectToJobs(analysesToReconnect) {
		// Ensure socket is connected before attempting reconnection
		if (!this.socket?.connected) {
			console.log('🔌 Socket not connected, establishing connection for reconnection...');
			try {
				await this.connect();
			} catch (error) {
				console.error('❌ Failed to connect for job reconnection:', error);
				// Mark all analyses as connection_lost since we can't reach the server
				for (const analysis of analysesToReconnect) {
					await analysisStore.updateAnalysis(analysis.id, {
						status: 'connection_lost',
						error: 'Could not connect to server to check job status.',
						updatedAt: Date.now()
					});
				}
				return;
			}
		}

		console.log(`🔄 Attempting to reconnect to ${analysesToReconnect.length} backend jobs`);

		for (const analysis of analysesToReconnect) {
			const jobId = analysis.metadata?.jobId;
			const method = analysis.method?.toLowerCase();

			if (!jobId) {
				console.warn(`⚠️ Analysis ${analysis.id} has no jobId, skipping`);
				continue;
			}

			console.log(`🔄 Querying status for job ${jobId} (analysis ${analysis.id.slice(0, 8)}...)`);

			// Query current job status from backend.
			// Use an ack timeout so a dropped/never-invoked ack resolves the analysis
			// out of the 'reconnecting' state instead of hanging forever.
			this.socket.timeout(10000).emit('job:status', { jobId }, async (err, response) => {
				try {
					if (err || !response) {
						// Ack timed out (or arrived empty) - server never confirmed status.
						console.warn(`⏱️ job:status ack timed out for job ${jobId}, marking connection_lost`);
						await analysisStore.updateAnalysis(analysis.id, {
							status: 'connection_lost',
							error: 'Timed out waiting for the server to report job status.',
							updatedAt: Date.now()
						});
						return;
					}
					if (response.status === 'completed') {
						// Job finished while we were away - retrieve results!
						console.log(`✅ Job ${jobId} completed, retrieving results`);
						await this.completeAnalysis(analysis.id, true, response.results);
					} else if (response.status === 'running' || response.status === 'queued') {
						// Job still running or queued - resubscribe to events
						console.log(`🔄 Job ${jobId} ${response.status}, resubscribing`);
						this.activeAnalyses.set(jobId, analysis.id);

						// Resubscribe to job events
						const methodNameMap = {
							'contrast-fel': 'cfel',
							'multi-hit': 'multihit'
						};
						const backendMethodName = methodNameMap[method] || method;
						this.socket.emit(`${backendMethodName}:resubscribe`, { id: jobId });

						// Update status back to running
						await analysisStore.updateAnalysis(analysis.id, {
							status: 'running',
							updatedAt: Date.now()
						});
					} else if (response.status === 'not_found') {
						// Job expired or doesn't exist on server
						console.log(`❌ Job ${jobId} not found on server`);
						await analysisStore.updateAnalysis(analysis.id, {
							status: 'connection_lost',
							error: 'Job no longer exists on server. It may have completed or expired.',
							updatedAt: Date.now()
						});
					} else {
						// Unknown status
						console.warn(`⚠️ Unknown status '${response.status}' for job ${jobId}`);
						await analysisStore.updateAnalysis(analysis.id, {
							status: 'connection_lost',
							error: `Unexpected job status: ${response.status}`,
							updatedAt: Date.now()
						});
					}
				} catch (error) {
					console.error(`Error handling reconnection for job ${jobId}:`, error);
					await analysisStore.updateAnalysis(analysis.id, {
						status: 'connection_lost',
						error: `Reconnection failed: ${error.message}`,
						updatedAt: Date.now()
					});
				}
			});
		}
	}

	/**
	 * Map genetic code name to numeric ID (for backward compatibility)
	 */
	mapGeneticCodeToId(geneticCode) {
		const codeMap = {
			Universal: 0,
			'Vertebrate mitochondrial': 1,
			'Yeast mitochondrial': 2,
			'Mold mitochondrial': 3,
			'Invertebrate mitochondrial': 4,
			'Ciliate nuclear': 5,
			'Echinoderm mitochondrial': 6,
			'Euplotid nuclear': 7,
			'Alternative yeast nuclear': 8,
			'Ascidian mitochondrial': 9,
			'Flatworm mitochondrial': 10,
			'Blepharisma nuclear': 11
		};
		return codeMap[geneticCode] || 0;
	}

	/**
	 * Prepare analysis parameters based on method and config
	 */
	prepareAnalysisParameters(method, config) {
		const baseParams = {
			analysis_type: method.toLowerCase(),
			// Use genetic code ID if available, otherwise map name to ID
			gencodeid:
				config.geneticCodeId !== undefined
					? config.geneticCodeId
					: this.mapGeneticCodeToId(config.geneticCode)
		};

		// Method-specific parameter mapping
		switch (method.toLowerCase()) {
			case 'fel':
				return {
					...baseParams,
					// Map FEL-specific parameters to backend format
					'ds-variation': config.srv === 'Yes' ? 1 : 2,
					multiple_hits: config.multipleHits || 'None',
					site_multihit: config.siteMultihit || 'Estimate',
					resample: config.resample || 0,
					'confidence-interval': config.confidenceIntervals ? true : false,
					pvalue: config.pValueThreshold || 0.1,
					branches: config.branchesToTest === 'Interactive' ? 'FG' : config.branchesToTest || 'All',
					samples: 100
				};

			case 'slac':
				return {
					...baseParams,
					pvalue: config.pvalue || config.pValueThreshold || 0.1,
					branches: config.branchesToTest === 'Interactive' ? 'FG' : config.branchesToTest || 'All',
					samples: config.samples || 100,
					code: config.code || 'Universal'
				};

			case 'meme':
				return {
					...baseParams,
					// Map MEME-specific parameters to backend format
					pvalue: config.pvalue || config.pValueThreshold || 0.1,
					rates: config.rates || 2,
					multiple_hits: config.multiple_hits || 'None',
					site_multihit: config.site_multihit || 'Estimate',
					impute_states: config.impute_states || 'No',
					resample: config.resample || 0,
					branches: 'All'
				};

			case 'fubar':
				return {
					...baseParams,
					grid: config.grid || 20,
					concentration_parameter: config.concentration_parameter || 0.5,
					branches: 'All'
				};

			case 'b-still':
				return {
					...baseParams,
					grid: config.grid || 20,
					concentration_parameter: config.concentration_parameter || 0.5,
					method: config.method || 'Variational-Bayes',
					ebf: config.ebf || 10,
					radius_threshold: config.radius_threshold || 0.5,
					branches: 'All'
				};

			case 'absrel':
				return {
					...baseParams,
					// Map aBSREL-specific parameters to backend format
					branches: config.branchesToTest === 'Interactive' ? 'FG' : config.branchesToTest || 'All',
					multiple_hits: config.multipleHits || 'None',
					srv: config.srv || 'Yes',
					blb: config.blb || 1.0
				};

			case 'bgm':
				return {
					...baseParams,
					branches: 'All',
					code: 'Universal',
					type: 'codon',
					steps: config.steps || 10000,
					'burn-in': config.burnIn || 1000,
					samples: config.samples || 100,
					'chain-sample': 100,
					'max-parents': config.maxParents || 1,
					'min-subs': config.minSubs || 1
				};

			case 'busted':
				// Handle both camelCase and kebab-case parameter names
				const errorSinkValue = config.errorSink || config['error-sink'];
				return {
					...baseParams,
					// Map BUSTED-specific parameters to backend format
					branches: config.branchesToTest === 'Interactive' ? 'FG' : config.branchesToTest || 'All',
					srv: config.srv || 'Yes',
					'error-sink':
						errorSinkValue === true
							? 'Yes'
							: errorSinkValue === false
								? 'No'
								: errorSinkValue || 'No',
					'multiple-hits': config.multipleHits || config['multiple-hits'] || 'None',
					rates: config.rates || 3,
					'syn-rates': config.synRates || config['syn-rates'] || 3,
					'grid-size': config.gridSize || config['grid-size'] || 250,
					'starting-points': config.startingPoints || config['starting-points'] || 1
				};

			case 'contrast-fel':
				// Contrast-FEL uses branch-set as an array for multiple sets
				const branchSets = [];
				if (config.branchSet1 || config['branch-set1']) {
					branchSets.push(config.branchSet1 || config['branch-set1'] || 'Set1');
				}
				if (config.branchSet2 || config['branch-set2']) {
					branchSets.push(config.branchSet2 || config['branch-set2'] || 'Set2');
				}

				return {
					...baseParams,
					// Map Contrast-FEL specific parameters to backend format
					srv: config.srv === 'Yes' ? 'Yes' : 'No',
					permutations: config.permutations === 'Yes' ? 'Yes' : 'No',
					pvalue: config.pvalue || config.pValueThreshold || 0.05,
					qvalue: config.qvalue || config.qValueThreshold || 0.2,
					'branch-set': branchSets.length > 0 ? branchSets : ['Set1', 'Set2'],
					output: config.output || ''
				};

			case 'gard':
				// Map frontend rv to backend site_to_site_variation
				const rvMap = { None: 'none', GDD: 'general_discrete', Gamma: 'beta_gamma' };
				const gardDatatype = config.datatype || 'nucleotide';
				let gardModel = config.model || 'GTR';

				// Safety net: validate model is compatible with datatype
				const nucleotideModels = ['GTR', 'HKY85', 'TN93', 'JC69'];
				const proteinModels = ['JTT', 'WAG', 'LG', 'Dayhoff'];
				if (
					(gardDatatype === 'nucleotide' || gardDatatype === 'codon') &&
					!nucleotideModels.includes(gardModel)
				) {
					console.warn(
						`GARD: Model "${gardModel}" incompatible with ${gardDatatype} data, falling back to GTR`
					);
					gardModel = 'GTR';
				} else if (gardDatatype === 'protein' && !proteinModels.includes(gardModel)) {
					console.warn(
						`GARD: Model "${gardModel}" incompatible with protein data, falling back to JTT`
					);
					gardModel = 'JTT';
				}

				return {
					...baseParams,
					datatype: gardDatatype,
					model: gardModel,
					run_mode: config.mode || 'Normal',
					site_to_site_variation: rvMap[config.rv] || 'none',
					rate_classes: config.rate_classes || 4,
					max_breakpoints: config.max_breakpoints || 10000
				};

			case 'multi-hit':
			case 'multihit':
				return {
					...baseParams,
					// Map Multi-Hit specific parameters to backend format
					rate_classes: config.rates || config.rate_classes || 3,
					rates: config.rates || config.rate_classes || 3,
					triple_islands: config.triple_islands || 'No',
					branches: 'All'
				};

			case 'nrm':
				return {
					...baseParams,
					// Map NRM specific parameters to backend format
					rate_classes: config.rate_classes || 1,
					triple_islands: config.triple_islands || 'No'
				};

			case 'relax':
				return {
					...baseParams,
					// Map RELAX-specific parameters to backend format
					test: config.testBranches || config.test || 'TEST',
					reference: config.referenceBranches || config.reference || 'REFERENCE',
					models: config.models || 'All',
					rates: config.rates || 3,
					mode: config.mode || 'Classic mode',
					'kill-zero-lengths': config.killZeroLengths || config['kill-zero-lengths'] || 'No'
				};

			case 'prime':
				return {
					...baseParams,
					// Map PRIME-specific parameters to backend format
					branches: config.branchesToTest === 'Interactive' ? 'FG' : config.branchesToTest || 'All',
					'property-set': config.propertySet || '5PROP',
					pvalue: config.pValueThreshold || 0.1,
					'impute-states': config.imputeStates || 'No'
				};
			default:
				return baseParams;
		}
	}

	/**
	 * Build arguments preview for database storage
	 */
	buildArgumentsPreview(method, config, treeData, analysisParams) {
		return {
			method: method.toUpperCase(),
			parameters: analysisParams,
			originalConfig: config,
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
			executionMode: 'backend',
			backendEvent: `${method.toLowerCase()}:spawn`,
			socketParams: {
				msa: '[FASTA_DATA]', // Placeholder for actual data
				tree: treeData ? '[TREE_DATA]' : null,
				...analysisParams
			}
		};
	}

	/**
	 * Cancel a running analysis
	 */
	async cancelAnalysis(analysisId) {
		// Find jobId for this analysis
		for (const [jobId, aId] of this.activeAnalyses.entries()) {
			if (aId === analysisId) {
				// Emit cancel event if supported by backend
				if (this.socket && this.socket.connected) {
					this.socket.emit('cancel', { jobId });
				}
				this.activeAnalyses.delete(jobId);
				break;
			}
		}

		// Use base class method to cancel in store
		await super.cancelAnalysis(analysisId);
	}

	/**
	 * Validate parameters before submission
	 */
	async validateParameters(method, config) {
		if (!this.socket || !this.socket.connected) {
			await this.connect();
		}

		const analysisParams = this.prepareAnalysisParameters(method, config);
		const eventName = `${method.toLowerCase()}:check`;

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Parameter validation timeout'));
			}, 10000);

			const handleValidated = (result) => {
				clearTimeout(timeout);
				this.socket.off('validated', handleValidated);
				resolve(result);
			};

			this.socket.on('validated', handleValidated);
			this.socket.emit(eventName, { job: analysisParams });
		});
	}

	/**
	 * Disconnect from backend server
	 */
	disconnect() {
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
		this.activeAnalyses.clear();
	}

	/**
	 * Check if connected to backend
	 */
	isConnected() {
		return this.socket ? this.socket.connected : false;
	}
}

// Export singleton instance
export const backendAnalysisRunner = new BackendAnalysisRunner();
export default backendAnalysisRunner;
