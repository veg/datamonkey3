/**
 * Base Analysis Runner - Abstract class for all analysis execution strategies
 * Consolidates common functionality between WASM and backend runners
 */

import { analysisStore } from '../../stores/analyses.js';
import { toastStore } from '../../stores/toast.js';
import { get } from 'svelte/store';
import { validateCodonAlignment, isJSParseableFormat } from '../utils/fastaValidation.js';
import { fileMetricsStore } from '../../stores/fileInfo.js';
import { calculateRuntimeEstimate } from '../utils/timingEstimates.js';

/**
 * Methods that require codon-aligned input (sequence length divisible by 3, no premature stop codons).
 */
const CODON_AWARE_METHODS = new Set([
	'fel',
	'slac',
	'fubar',
	'meme',
	'absrel',
	'busted',
	'relax',
	'contrast-fel',
	'bgm',
	'prime',
	'multi-hit',
	'multihit',
	'b-still',
	'bstill'
]);

/**
 * Pre-run runtime estimate in seconds, or null when one cannot be made.
 *
 * Reads the alignment dimensions from `fileMetricsStore`, which datareader has already populated by
 * the time any analysis can be started -- so this costs no parsing and no extra state.
 */
function estimateSecondsFor(method, executionMode) {
	try {
		const info = get(fileMetricsStore)?.FILE_INFO;
		const sequences = info?.sequences;
		const sites = info?.sites;
		if (!sequences || !sites) return null;

		const estimate = calculateRuntimeEstimate(method, sequences, sites, executionMode);
		return estimate?.minutes ? Math.round(estimate.minutes * 60) : null;
	} catch {
		// An estimate is a nicety. Never let it break starting an analysis.
		return null;
	}
}

export class BaseAnalysisRunner {
	constructor() {
		this.isRunning = false;
		this.activeAnalyses = new Map(); // Track running analyses: jobId -> analysisId
	}

	/**
	 * Abstract method - must be implemented by subclasses
	 * @param {string} method - Analysis method (FEL, SLAC, etc.)
	 * @param {Object} config - Analysis configuration
	 * @param {string} fastaData - FASTA sequence data
	 * @param {string} treeData - Phylogenetic tree data
	 * @param {string} fileId - Associated file ID
	 * @returns {Promise<Object>} Result object with analysisId and jobId
	 */
	async runAnalysis(method, config, fastaData, treeData, fileId = null) {
		throw new Error('runAnalysis must be implemented by subclass');
	}

	/**
	 * Create a new analysis in the store
	 */
	async createAnalysis(fileId, method) {
		return await analysisStore.createAnalysis(fileId, method);
	}

	/**
	 * Start analysis progress tracking with common metadata
	 * @param {string} analysisId - The analysis ID
	 * @param {string} method - The analysis method (e.g., 'FEL', 'SLAC')
	 * @param {string} executionMode - 'backend' or 'wasm'
	 * @param {string|null} message - Optional custom message
	 * @param {object|null} args - Optional arguments preview
	 * @param {string|null} jobId - Optional backend job ID (for reconnection support)
	 */
	startAnalysisTracking(
		analysisId,
		method,
		executionMode,
		message = null,
		args = null,
		jobId = null
	) {
		const defaultMessage = message || `Starting ${method} analysis...`;

		const metadata = {
			executionMode,
			startTime: new Date().toISOString()
		};

		// Capture the pre-run estimate so the run row can tell an ordinary wait from a stuck one.
		//
		// It is stored as a NUMBER OF SECONDS and used only to decide when the row's sentence changes
		// -- never displayed beside the elapsed clock. The fitted power law is R^2 ~ 0.63: good to a
		// factor of two, not to the minute, so showing it as a countdown would be a promise the
		// software cannot keep. Methods with no fitted equation simply get no key, and the row then
		// reports elapsed time and says nothing else.
		const estimateSeconds = estimateSecondsFor(method, executionMode);
		if (estimateSeconds) {
			metadata.estimateSeconds = estimateSeconds;
		}

		// Add arguments to metadata if provided
		if (args) {
			metadata.arguments = args;
		}

		// Add jobId for backend analyses (enables reconnection after page refresh)
		if (jobId) {
			metadata.jobId = jobId;
		}

		analysisStore.startAnalysisProgress(analysisId, defaultMessage, method, metadata);
	}

	/**
	 * Update analysis progress by ID
	 */
	updateProgress(analysisId, status, progress, message) {
		if (analysisId) {
			analysisStore.updateAnalysisProgressById(analysisId, status, progress, message);
		} else {
			// Fallback to legacy method for backward compatibility
			analysisStore.updateAnalysisProgress(status, progress, message);
		}
	}

	/**
	 * Complete analysis with success or failure
	 */
	async completeAnalysis(analysisId, success = true, result = null, message = null) {
		const defaultMessage = success ? 'Analysis completed successfully' : 'Analysis failed';

		// Get the arguments metadata from the active analysis progress
		const currentState = get(analysisStore);
		const activeAnalysis = currentState?.activeAnalyses?.find((a) => a.id === analysisId);
		const argumentsMetadata = activeAnalysis?.metadata?.arguments || null;
		const methodName = activeAnalysis?.method?.toUpperCase() || 'Analysis';

		// Show toast notification for completion
		if (success) {
			toastStore.success(`${methodName} analysis complete!`, {
				action: 'View Results',
				onAction: () => {
					// Navigate to results tab - this will be picked up by the app
					window.dispatchEvent(new CustomEvent('navigate-to-results'));
				}
			});
		} else {
			// Same affordance as the success case above. A failure is the toast a user is most likely
			// to miss and most needs to act on, so it gets a route to the detail rather than being a
			// dead end the moment it is dismissed.
			toastStore.error(`${methodName} analysis failed: ${message || 'Unknown error'}`, {
				action: 'See what happened',
				onAction: () => {
					window.dispatchEvent(new CustomEvent('navigate-to-results', { detail: { analysisId } }));
				}
			});
		}

		if (success && result) {
			// Ensure result is stored consistently as JSON string
			const resultString = typeof result === 'string' ? result : JSON.stringify(result);

			const updateData = {
				status: 'completed',
				result: resultString,
				completedAt: new Date().getTime()
			};

			// Add arguments metadata if available
			if (argumentsMetadata) {
				updateData.arguments = argumentsMetadata;
			}

			await analysisStore.updateAnalysis(analysisId, updateData);
		} else if (!success) {
			const updateData = {
				status: 'error',
				error: message || 'Unknown error occurred',
				completedAt: new Date().getTime()
			};

			// Add arguments metadata even for failed analyses (for debugging)
			if (argumentsMetadata) {
				updateData.arguments = argumentsMetadata;
			}

			await analysisStore.updateAnalysis(analysisId, updateData);
		}

		// Use the ID-specific method to avoid race conditions and ensure correct analysis is updated
		if (analysisId) {
			await analysisStore.completeAnalysisProgressById(
				analysisId,
				success,
				message || defaultMessage
			);
			// Remove from active analyses after completion
			analysisStore.removeFromActiveAnalyses(analysisId);
		} else {
			// Fallback to legacy method only if no ID available
			analysisStore.completeAnalysisProgress(success, message || defaultMessage);
		}
	}

	/**
	 * Cancel a running analysis
	 */
	async cancelAnalysis(analysisId) {
		// Remove from active analyses
		for (const [jobId, aId] of this.activeAnalyses.entries()) {
			if (aId === analysisId) {
				this.activeAnalyses.delete(jobId);
				break;
			}
		}

		// Update store
		await analysisStore.cancelAnalysis(analysisId);
	}

	/**
	 * Clean up resources
	 */
	destroy() {
		this.activeAnalyses.clear();
	}

	/**
	 * Validate common input parameters
	 * @param {string} fastaData - FASTA sequence data
	 * @param {string} treeData - Phylogenetic tree data
	 * @param {string} method - Analysis method name
	 * @param {Object} [config={}] - Analysis configuration (used for geneticCodeId)
	 */
	validateInput(fastaData, treeData, method, config = {}) {
		if (!fastaData || !fastaData.trim()) {
			throw new Error('FASTA data is empty or invalid');
		}

		if (!treeData || !treeData.trim()) {
			throw new Error('Tree data is empty or invalid');
		}

		if (!method || !method.trim()) {
			throw new Error('Analysis method is required');
		}

		// For codon-aware methods, validate alignment is proper codon data — but
		// only for formats our JS parser recognizes (FASTA + NEXUS). PHYLIP,
		// MEGA, CLUSTAL files upload fine via HyPhy's datareader.bf but our JS
		// parseAlignment would reject them with confusing "Sequence data found
		// before header" errors. In those cases, defer validation to HyPhy on
		// the analysis run — matching dm2's behavior.
		if (CODON_AWARE_METHODS.has(method.toLowerCase()) && isJSParseableFormat(fastaData)) {
			const geneticCodeId = config.geneticCodeId !== undefined ? config.geneticCodeId : 0;
			const result = validateCodonAlignment(fastaData, geneticCodeId);
			if (!result.valid) {
				throw new Error(result.errors.join('\n'));
			}
		}
	}

	/**
	 * Generate a unique job ID
	 */
	generateJobId(method) {
		return `${method}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}
}
