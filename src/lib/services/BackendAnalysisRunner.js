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

/**
 * How long a submission may sit with no word from the server before we go and ask about it.
 *
 * Generous on purpose. The server acknowledges a spawn as soon as the job row exists, but a busy
 * scheduler can take a while to get there, and declaring a job lost that is merely queued is far
 * worse than a minute of silence. Expiry does NOT fail the run — it triggers a probe (see
 * probeSubmission), which is the only thing that can distinguish "queued" from "never accepted".
 */
const SUBMISSION_ACK_TIMEOUT_MS = 60000;

/** Ack window on the job:status probe itself. Matches the reconnect path's timeout (issue #177). */
const STATUS_PROBE_TIMEOUT_MS = 10000;

class BackendAnalysisRunner extends BaseAnalysisRunner {
	constructor() {
		super();
		this.socket = null;
		this.serverUrl = DATAMONKEY_SERVER_URL;

		// jobId -> timeoutId, for jobs submitted but not yet acknowledged by the server.
		// Armed only by runAnalysis; reconnectToJobs has its own 10s ack and must not arm these.
		this.submissionWatchdogs = new Map();
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
			// The server sends the job id as `id`, not `jobId` (verified live). Reading both means
			// progress routes correctly even with concurrent jobs, instead of falling through to the
			// single-job heuristic below every time.
			const statusJobId = status.jobId ?? status.id ?? null;

			// Try to find the analysis ID for this status update
			if (statusJobId && this.activeAnalyses.has(statusJobId)) {
				const analysisId = this.activeAnalyses.get(statusJobId);
				// Any word from the server about this job is proof it was accepted.
				this.clearSubmissionWatchdog(statusJobId);
				this.updateProgress(
					analysisId,
					'running',
					status.progress || 0,
					status.msg || status.phase || 'Analysis in progress'
				);
			} else if (this.activeAnalyses.size === 1) {
				// If only one analysis is running, we can safely assume it's for that one
				const [jobId, analysisId] = this.activeAnalyses.entries().next().value;
				this.clearSubmissionWatchdog(jobId);
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

			// ROUTING, and why it is not simply "by jobId".
			//
			// #166 made this route strictly by jobId, because completing "the first active analysis"
			// on an unmatched id misroutes results between concurrent jobs. That was right about the
			// hazard and wrong about the data: the server's `completed` packet carries only
			// { results, type }. It has no jobId and no id -- verified against a live server, where
			// `status update` packets DO carry `id` but `completed` does not
			// (lib/clientsocket.js:60 forwards each redis packet whole, and that one lacks it).
			//
			// So strict routing silently completed nothing, for every backend method, and a finished
			// analysis only appeared after a page refresh. The old fallback had been masking it.
			//
			// The rule below keeps the protection and restores the behaviour: attribute by jobId when
			// one is present, otherwise attribute ONLY when exactly one analysis is in flight -- in
			// which case the event cannot belong to anything else. With two or more and no id, there
			// is genuinely no way to tell, so it refuses rather than guessing. That is strictly safer
			// than pre-#166 (which completed the first of N) and strictly more useful than post-#166
			// (which completed none of 1). See issue #208 for the server-side fix that removes the
			// ambiguity entirely.
			const jobId = data.jobId ?? data.id ?? null;

			if (jobId && this.activeAnalyses.has(jobId)) {
				const analysisId = this.activeAnalyses.get(jobId);
				this.clearSubmissionWatchdog(jobId);
				await this.completeAnalysis(analysisId, true, results);
				this.activeAnalyses.delete(jobId);
			} else if (!jobId && this.activeAnalyses.size === 1) {
				const [onlyJobId, analysisId] = [...this.activeAnalyses.entries()][0];
				this.clearSubmissionWatchdog(onlyJobId);
				await this.completeAnalysis(analysisId, true, results);
				this.activeAnalyses.delete(onlyJobId);
			} else {
				console.warn('⚠️ Completed event cannot be attributed; ignoring to avoid misrouting:', {
					receivedJobId: jobId,
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
				this.clearSubmissionWatchdog(errorJobId);
				await this.completeAnalysis(analysisId, false, null, userFacingError);
				this.activeAnalyses.delete(errorJobId);
			} else if (!errorJobId && this.activeAnalyses.size === 1) {
				// Same reasoning as the completed handler: with exactly one job in flight the error
				// cannot belong to anything else, and refusing to attribute it leaves a failed run
				// sitting at "running" forever. With two or more it is genuinely ambiguous, so the
				// branch below still refuses rather than killing an innocent concurrent job.
				const [onlyJobId, analysisId] = [...this.activeAnalyses.entries()][0];
				this.clearSubmissionWatchdog(onlyJobId);
				await this.completeAnalysis(analysisId, false, null, userFacingError);
				this.activeAnalyses.delete(onlyJobId);
			} else {
				console.warn(
					'⚠️ Script error cannot be attributed, not failing any analysis to avoid killing concurrent jobs:',
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

		// THE SUBMISSION ACKNOWLEDGEMENT. Not dead code — do not delete.
		//
		// The server already tells us it accepted a job; we used to throw that away. app/hyphyjob.js
		// (262-299) publishes `{ type:'job created', id, torque_id, status, scheduler, created_time,
		// sites, sequences }` on the redis channel keyed by the job id the moment the job row exists,
		// and lib/clientsocket.js:60 forwards it to this socket verbatim. `job metadata` (hyphyjob.js
		// 489-513) carries the same shape later in the job's life.
		//
		// `id` is the jobId WE generated and sent in `job.id` — analysis-factory.js:117-124 resolves
		// `params.job.id || params.id` — so it routes exactly, with no single-job heuristic needed.
		//
		// This is the only positive confirmation a spawn was accepted, and it is what disarms the
		// submission watchdog.
		this.socket.on('job created', (packet) => this.handleServerAck(packet));
		this.socket.on('job metadata', (packet) => this.handleServerAck(packet));

		// DELIBERATELY NOT LISTENING FOR / EMITTING `job queue`.
		//
		// server.js:54-59 answers a `job queue` request with `socket.emit('job queue', jobs);
		// socket.disconnect();` — asking the server where we are in the queue tears down the socket
		// carrying every in-flight job's status stream. Queue position is not worth that.
		//
		// The `status` field on `job created` / `job metadata` above already reports whether this
		// particular job is queued or running, which is the part the user actually needs, at no
		// protocol cost.
	}

	/**
	 * Handle `job created` / `job metadata` — the server confirming it took the job.
	 *
	 * Moves the run off the bare "Job submitted" state and onto what the scheduler says: Torque/PBS
	 * reports 'Q' while queued and 'R' once it is running (some deployments spell them out). Anything
	 * unrecognised is treated as queued, because a job that has been acknowledged but not started is
	 * exactly that.
	 */
	handleServerAck(packet) {
		const jobId = packet?.id ?? packet?.jobId;
		if (!jobId || !this.activeAnalyses.has(jobId)) return;

		const analysisId = this.activeAnalyses.get(jobId);
		this.clearSubmissionWatchdog(jobId);

		const reported = String(packet?.status ?? '').toLowerCase();
		const isRunning = reported === 'r' || reported === 'running';

		console.log(`📨 Server acknowledged job ${jobId} (status: ${packet?.status ?? 'unreported'})`);

		this.updateProgress(
			analysisId,
			isRunning ? 'running' : 'pending',
			10,
			isRunning ? 'Running on the server' : 'Queued on the server'
		);
	}

	/**
	 * Start the clock on an unacknowledged submission.
	 *
	 * MUST be called only from runAnalysis. Jobs restored by reconnectToJobs already have their own
	 * 10s job:status ack and arming this for them would double-probe.
	 */
	armSubmissionWatchdog(analysisId, jobId, submittedAt = Date.now()) {
		this.clearSubmissionWatchdog(jobId);
		const timer = setTimeout(() => {
			this.submissionWatchdogs.delete(jobId);
			this.probeSubmission(analysisId, jobId, submittedAt);
		}, SUBMISSION_ACK_TIMEOUT_MS);
		this.submissionWatchdogs.set(jobId, timer);
	}

	clearSubmissionWatchdog(jobId) {
		const timer = this.submissionWatchdogs.get(jobId);
		if (timer) {
			clearTimeout(timer);
			this.submissionWatchdogs.delete(jobId);
		}
	}

	clearAllSubmissionWatchdogs() {
		for (const timer of this.submissionWatchdogs.values()) {
			clearTimeout(timer);
		}
		this.submissionWatchdogs.clear();
	}

	/**
	 * The watchdog expired: ask the server whether it has this job, and DO NOT assume it does not.
	 *
	 * Silence is not loss. The spawn event is fire-and-forget (see the emit in runAnalysis for why it
	 * must stay that way), and the ack we listen for rides a redis subscription that can attach a beat
	 * late — so a perfectly healthy job can arrive here. `job:status` is genuinely ack-capable
	 * (server.js:62 `socket.on('job:status', function (params, callback)`) and reads the persisted
	 * hash, so it can answer for a job whose events we missed.
	 */
	probeSubmission(analysisId, jobId, submittedAt) {
		// Completed, failed or cancelled while we were waiting — nothing to chase.
		if (!this.activeAnalyses.has(jobId)) return;

		if (!this.socket) {
			this.markSubmissionLost(analysisId, jobId, 'The server never confirmed this job.');
			return;
		}

		this.socket
			.timeout(STATUS_PROBE_TIMEOUT_MS)
			.emit('job:status', { jobId }, async (err, response) => {
				try {
					if (err || !response) {
						// No answer at all: the socket is not carrying anything for this job.
						await this.markSubmissionLost(
							analysisId,
							jobId,
							'The server never confirmed this job.'
						);
						return;
					}

					if (response.status === 'not_found') {
						// The one unambiguous negative. The server looked and has no such job.
						await this.markSubmissionLost(
							analysisId,
							jobId,
							'The server has no record of this job. It was never accepted.'
						);
						return;
					}

					if (response.status === 'completed' && response.results) {
						// We missed the whole event stream for this job but the results are sitting there.
						// Same recovery the reconnect path performs.
						console.log(`✅ Job ${jobId} had already completed; collecting results from probe`);
						this.clearSubmissionWatchdog(jobId);
						this.activeAnalyses.delete(jobId);
						await this.completeAnalysis(analysisId, true, response.results);
						return;
					}

					// EVERYTHING ELSE MEANS KEEP WAITING — and 'unknown' above all.
					//
					// This is where this handler deliberately differs from reconnectToJobs, which treats an
					// unrecognised status as connection_lost. app/hyphyjob.js:91 hSets the `params` field the
					// instant init() runs, before any `status` field exists, so server.js:76 answers
					// `status:'unknown'` for a perfectly healthy job sitting in the submit -> qsub window.
					// Failing on that would kill good jobs on a busy scheduler.
					const waitedMinutes = Math.max(1, Math.round((Date.now() - submittedAt) / 60000));
					const running = response.status === 'running';
					this.updateProgress(
						analysisId,
						running ? 'running' : 'pending',
						running ? 10 : 5,
						running
							? 'Running on the server'
							: `Waiting for the server to start this job (queued ${waitedMinutes} min)`
					);
					this.armSubmissionWatchdog(analysisId, jobId, submittedAt);
				} catch (error) {
					console.error(`Error probing submission for job ${jobId}:`, error);
				}
			});
	}

	/**
	 * Resolve a job we can no longer account for.
	 *
	 * Reuses `connection_lost` rather than inventing a status: AnalysisCard and runStatusLine already
	 * render it, and it already offers a Re-run.
	 */
	async markSubmissionLost(analysisId, jobId, message) {
		console.warn(`⏱️ Submission for job ${jobId} unconfirmed: ${message}`);
		this.clearSubmissionWatchdog(jobId);
		await analysisStore.updateAnalysis(analysisId, {
			status: 'connection_lost',
			error: message,
			updatedAt: Date.now()
		});
		this.activeAnalyses.delete(jobId);
		analysisStore.removeFromActiveAnalyses(analysisId);
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

			// TWO ARGUMENTS, NEVER THREE. Do not "improve" this into
			// `socket.timeout(ms).emit(eventName, submitData, cb)`.
			//
			// The server registers every spawn event through a stream wrapper: lib/router.js:26 is
			// `socket.on(key, function (stream, data))`. A third argument makes socket.io deliver
			// stream=submitData and data=<ack function>, the adjustment guard at router.js:29
			// (`data === undefined`) does not fire, and analysis-routes.js:47-51 then reads `params` as
			// the ack function — so `!params.job` is true and EVERY submission is answered with
			// 'Invalid job parameters'. The server never calls the ack either, so the timeout would
			// also fire on every healthy run.
			//
			// The acknowledgement therefore cannot ride the emit. It arrives as the `job created`
			// event (see setupGlobalHandlers), and armSubmissionWatchdog below covers its absence.
			this.socket.emit(eventName, submitData);

			// Update progress
			this.updateProgress(analysisId, 'pending', 5, `Job submitted - ID: ${jobId}`);

			// Nothing else ever revisited this state before: a job the server silently dropped sat at
			// "pending" until the user gave up. Start the clock.
			this.armSubmissionWatchdog(analysisId, jobId);

			return {
				analysisId,
				jobId,
				message: `Analysis submitted to backend server`
			};
		} catch (error) {
			console.error('❌ Backend analysis submission failed:', error);
			this.clearSubmissionWatchdog(jobId);
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

			case 'axomeme': {
				// AxoMEME is a neural surrogate, not a HyPhy method, and the server descriptor
				// (app/axomeme/descriptor.js) reflects that: no genetic code, no branch selection, no
				// p-value. NOTE that `gencodeid` from baseParams is deliberately NOT spread in here --
				// the server's validateParameters override WARNS when genetic_code is supplied for
				// axomeme, because universal is baked into the model's tokenizer. Sending it would
				// produce a warning on every single run for a value that cannot be honoured.
				const maxSpecies = parseInt(config.maxSpecies, 10);
				return {
					analysis_type: 'axomeme',
					// Whitelisted server-side to ["percentile","zscore","pvalue"]; anything else falls
					// back to percentile there. Same default as the in-browser path, for the same
					// reason: the model's predicted LRT rarely reaches the fixed chi-square gates that
					// pvalue compares against, so pvalue makes the method silent.
					call_mode: config.callMode || 'percentile',
					// Clamped to [2, 512] server-side. Sent only when the user set it, so the server's
					// own default stays the single source of truth.
					...(Number.isFinite(maxSpecies) ? { max_species: maxSpecies } : {}),
					// Dropped to "" (auto-pick) server-side unless it matches SAFE_SEQUENCE_NAME. That
					// whitelist is a security control -- the value is interpolated into a comma-joined
					// SLURM --export string -- so an unusual FASTA header is silently ignored rather
					// than rewritten. Send only what the user actually chose.
					...(config.referenceSequence ? { reference_sequence: config.referenceSequence } : {})
				};
			}

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
				this.clearSubmissionWatchdog(jobId);
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
		// Drop the timers with the socket. Left armed they would fire against a dead connection —
		// and in a test suite that reuses this singleton they leak across cases.
		this.clearAllSubmissionWatchdogs();
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
