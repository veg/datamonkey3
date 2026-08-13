import { derived, writable } from 'svelte/store';
import { analysisStorage } from '../lib/utils/indexedDBStorage';
import { browser } from '$app/environment';

/**
 * LIVENESS, and why a local run needs a pulse.
 *
 * IndexedDB is shared by every tab of the origin, but `activeAnalyses` is per-tab memory. So a
 * second tab opening while the first tab is mid-run used to read the first tab's record — which sits
 * at 'pending'/'wasm' for the whole run, because progress updates are in-memory only — and mark it
 * 'interrupted', throwing away hours of compute in a tab it does not own and offering a Re-run that
 * would duplicate it.
 *
 * The owning tab therefore stamps `lastHeartbeatAt` while it is actually running, and the sweep only
 * reaps records whose pulse has stopped.
 */
const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * How long a record may go unstamped before another tab may declare it dead.
 *
 * Six missed ticks, not three. AxoMEME runs on the main thread and only yields between batches
 * (AxomemeAnalysisRunner.yieldToBrowser), so a healthy run can starve the interval for seconds at a
 * time. A margin that is too tight reaps live work; one that is too loose only delays cleanup of a
 * genuinely dead tab's record by a few seconds.
 */
const HEARTBEAT_STALE_MS = 60_000;

/** Statuses the interrupted-sweep considers unfinished. */
const REAPABLE_STATUSES = ['pending', 'initializing', 'running', 'processing', 'saving'];

/** Statuses a run can stop in — a record in one of these is nobody's live work. */
const TERMINAL_STATUSES = ['completed', 'error', 'cancelled', 'interrupted', 'connection_lost'];

/**
 * Is this stored record safe for THIS tab to mark interrupted?
 *
 * One function, used by both the filter and the map below, because when those were two copies of the
 * same predicate they could drift apart silently.
 *
 * The `?? 0` is load-bearing twice: a record written before heartbeats existed has no pulse and is by
 * definition from a session that is gone, so it must still be reaped — and that is also what keeps
 * every pre-existing cleanup test meaningful without hand-editing fixtures.
 */
function isReapable(analysis) {
	return (
		analysis?.metadata?.executionMode === 'wasm' &&
		REAPABLE_STATUSES.includes(analysis.status) &&
		Date.now() - (analysis.lastHeartbeatAt ?? 0) > HEARTBEAT_STALE_MS
	);
}

function createAnalysisStore() {
	const { subscribe, set, update } = writable({
		analyses: [],
		currentAnalysisId: null,
		isLoading: false,
		error: null,
		// Single unified tracking for active analyses
		activeAnalyses: [] // Array of active analysis objects with progress tracking
	});

	/** Interval that stamps this tab's live local runs. Null whenever there are none. */
	let heartbeatTimer = null;

	/** Read state synchronously. `update` with an unchanged return is the pattern used below. */
	function readState() {
		let snapshot;
		update((state) => {
			snapshot = state;
			return state;
		});
		return snapshot;
	}

	function liveLocalRuns() {
		return (readState().activeAnalyses || []).filter(
			(a) => a?.metadata?.executionMode === 'wasm' && !TERMINAL_STATUSES.includes(a.status)
		);
	}

	async function heartbeatTick() {
		// Iterate activeAnalyses ONLY. Walking the full analyses list would rewrite completed records,
		// which carry their whole result payload — megabytes, every ten seconds.
		for (const entry of liveLocalRuns()) {
			try {
				const stored = await analysisStorage.getAnalysis(entry.id);
				if (!stored) continue;
				// Read-modify-write: a completion landing between this read and the write would be
				// written back as unfinished, so never touch a record that has already stopped.
				if (TERMINAL_STATUSES.includes(stored.status)) continue;
				await analysisStorage.saveAnalysis({ ...stored, lastHeartbeatAt: Date.now() });
			} catch (error) {
				// A missed beat costs nothing; HEARTBEAT_STALE_MS allows for six of them.
				console.error(`Error stamping heartbeat for ${entry.id}:`, error);
			}
		}
	}

	function startHeartbeat() {
		if (!browser || heartbeatTimer) return;
		heartbeatTimer = setInterval(() => {
			heartbeatTick();
		}, HEARTBEAT_INTERVAL_MS);
	}

	/** Stop the pulse once this tab has no local run left to vouch for. */
	function stopHeartbeatIfIdle() {
		if (!heartbeatTimer) return;
		if (liveLocalRuns().length > 0) return;
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}

	return {
		subscribe,
		update,

		// Load all analyses from IndexedDB
		async loadAnalyses() {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const analyses = await analysisStorage.getAllAnalyses();

				// Log status summary
				const statusCounts = analyses.reduce((acc, a) => {
					acc[a.status] = (acc[a.status] || 0) + 1;
					return acc;
				}, {});
				console.log(
					`📊 [AnalysisStore] LOAD: ${analyses.length} analyses from IndexedDB`,
					statusCounts
				);

				update((state) => ({ ...state, analyses, isLoading: false }));
			} catch (error) {
				console.error('Error loading analyses:', error);
				update((state) => ({
					...state,
					error: error.message,
					isLoading: false
				}));
			}
		},

		// Create a new analysis
		async createAnalysis(fileId, method) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const analysisId = crypto.randomUUID();
				const analysis = {
					id: analysisId,
					fileId,
					method,
					status: 'pending',
					createdAt: new Date().getTime()
				};

				await analysisStorage.saveAnalysis(analysis);

				// Update analysis list and set current analysis
				update((state) => ({
					...state,
					analyses: [...state.analyses, analysis],
					currentAnalysisId: analysisId,
					isLoading: false
				}));

				// Return the analysis ID for reference
				return analysisId;
			} catch (error) {
				console.error('Error creating analysis:', error);
				update((state) => ({
					...state,
					error: error.message,
					isLoading: false
				}));
				throw error;
			}
		},

		// Get an analysis by ID
		async getAnalysis(analysisId) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const analysis = await analysisStorage.getAnalysis(analysisId);

				// Update the analysis in the list
				update((state) => {
					const analyses = state.analyses.map((a) => (a.id === analysisId ? analysis : a));

					return { ...state, analyses, isLoading: false };
				});

				return analysis;
			} catch (error) {
				console.error('Error fetching analysis:', error);
				update((state) => ({
					...state,
					error: error.message,
					isLoading: false
				}));
				throw error;
			}
		},

		// Update an analysis
		async updateAnalysis(analysisId, data) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				// Get the current analysis
				const currentAnalysis = await analysisStorage.getAnalysis(analysisId);

				// Guard against lost updates from the read-modify-write race:
				// a stale running/reconnecting write (e.g. from reconnectToJobs) must not
				// clobber a terminal record that a live completed/error event already wrote.
				// Since getAnalysis() and saveAnalysis() are separate transactions, a
				// concurrent completed-write can land in between; treat terminal states as final.
				// CANCELLATION IS FINAL, and is checked before anything else.
				//
				// A cancelled local run keeps computing -- WasmAnalysisRunner cannot terminate the Aioli
				// worker -- and minutes later writes 'completed' over the cancelled record. 'completed'
				// is terminal, so the guard below (which only rejects NON-terminal incoming states) let
				// it through, and the card visibly changed from Cancelled back to Completed on its own.
				// The user was then shown a result produced by settings they had explicitly rejected,
				// with nothing anywhere reporting the contradiction. See issue #201.
				//
				// Cancelling is a user decision. No later machine event may undo it.
				if (currentAnalysis?.status === 'cancelled' && data.status && data.status !== 'cancelled') {
					console.warn(
						`📊 [AnalysisStore] Ignoring '${data.status}' for ${analysisId.slice(0, 8)}...; it was cancelled`
					);
					update((state) => ({ ...state, isLoading: false }));
					return currentAnalysis;
				}

				const TERMINAL_STATES = ['completed', 'error', 'cancelled'];
				const NON_TERMINAL_INCOMING = [
					'running',
					'reconnecting',
					'pending',
					'initializing',
					'processing'
				];
				if (
					currentAnalysis &&
					TERMINAL_STATES.includes(currentAnalysis.status) &&
					data.status &&
					NON_TERMINAL_INCOMING.includes(data.status)
				) {
					console.warn(
						`📊 [AnalysisStore] Skipping stale '${data.status}' update for ${analysisId.slice(0, 8)}...; already '${currentAnalysis.status}'`
					);
					update((state) => ({ ...state, isLoading: false }));
					return currentAnalysis;
				}

				// Merge the updates
				const updatedAnalysis = {
					...currentAnalysis,
					...data,
					updatedAt: new Date().getTime()
				};

				// Save the updated analysis
				await analysisStorage.saveAnalysis(updatedAnalysis);

				// Update the analysis in the list
				update((state) => {
					const analyses = state.analyses.map((a) => (a.id === analysisId ? updatedAnalysis : a));

					return { ...state, analyses, isLoading: false };
				});

				return updatedAnalysis;
			} catch (error) {
				console.error('Error updating analysis:', error);
				update((state) => ({
					...state,
					error: error.message,
					isLoading: false
				}));
				throw error;
			}
		},

		// Delete an analysis
		async deleteAnalysis(analysisId) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				await analysisStorage.deleteAnalysis(analysisId);

				// Remove the analysis from the list
				update((state) => ({
					...state,
					analyses: state.analyses.filter((a) => a.id !== analysisId),
					currentAnalysisId:
						state.currentAnalysisId === analysisId ? null : state.currentAnalysisId,
					isLoading: false
				}));
			} catch (error) {
				console.error('Error deleting analysis:', error);
				update((state) => ({
					...state,
					error: error.message,
					isLoading: false
				}));
				throw error;
			}
		},

		// Cancel a pending analysis
		async cancelAnalysis(analysisId) {
			if (!browser) return; // Only run in browser

			try {
				// Update the analysis status to cancelled
				await this.updateAnalysis(analysisId, {
					status: 'cancelled',
					completedAt: new Date().getTime()
				});

				// Remove from active analyses list
				update((state) => ({
					...state,
					activeAnalyses: (state.activeAnalyses || []).filter((a) => a.id !== analysisId)
				}));

				stopHeartbeatIfIdle();
			} catch (error) {
				console.error('Error cancelling analysis:', error);
				throw error;
			}
		},

		// Load analyses for a specific file
		async loadAnalysesForFile(fileId) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const fileAnalyses = await analysisStorage.getAnalysesByFileId(fileId);

				// Merge with existing analyses
				update((state) => {
					// Remove existing analyses for this file
					const otherAnalyses = state.analyses.filter((a) => a.fileId !== fileId);

					return {
						...state,
						analyses: [...otherAnalyses, ...fileAnalyses],
						isLoading: false
					};
				});

				return fileAnalyses;
			} catch (error) {
				console.error('Error loading analyses for file:', error);
				update((state) => ({
					...state,
					error: error.message,
					isLoading: false
				}));
				throw error;
			}
		},

		// Set the current analysis
		setCurrentAnalysis(analysisId) {
			update((state) => {
				return { ...state, currentAnalysisId: analysisId };
			});
		},

		// Clear any errors
		clearError() {
			update((state) => ({ ...state, error: null }));
		},

		// Start tracking analysis progress
		async startAnalysisProgress(
			analysisId,
			message = 'Initializing analysis...',
			methodName = '',
			metadata = {}
		) {
			// Find the analysis in the store to get method and file information if not provided
			let method = methodName;
			let file = metadata.fileName || '';

			console.log(
				`📊 [AnalysisStore] START: ${analysisId.slice(0, 8)}... method=${methodName} executionMode=${metadata.executionMode || 'unknown'}`
			);

			update((state) => {
				// Look up analysis details if not provided
				if (!method || !file) {
					const existingAnalysis = state.analyses.find((a) => a.id === analysisId);
					if (existingAnalysis) {
						method = method || existingAnalysis.method;
						file = file || existingAnalysis.fileName;
					}
				}

				// Create progress tracking object
				const progressObj = {
					id: analysisId,
					status: 'initializing',
					progress: 0,
					message,
					method,
					fileName: file,
					startTime: new Date().toISOString(),
					logs: [{ time: new Date().toISOString(), message, status: 'initializing' }],
					metadata: {
						method,
						filename: file,
						startTime: new Date().toISOString(),
						...metadata
					}
				};

				// Add to unified active analyses list
				// First remove any existing analysis with the same ID
				const activeAnalyses = (state.activeAnalyses || []).filter((a) => a.id !== analysisId);
				activeAnalyses.push(progressObj);

				console.log(`📊 [AnalysisStore] activeAnalyses count: ${activeAnalyses.length}`);

				return {
					...state,
					activeAnalyses
				};
			});

			// A local run must be protected from the instant it starts, not from the first tick ten
			// seconds later — otherwise a tab opened in that window still reaps it.
			if (metadata.executionMode === 'wasm') {
				startHeartbeat();
			}

			// Persist metadata to IndexedDB (executionMode, jobId, etc.)
			// This is critical for cleanupInterruptedAnalyses and backend reconnection to work
			if (browser && metadata.executionMode) {
				try {
					const analysis = await analysisStorage.getAnalysis(analysisId);
					if (analysis) {
						const updatedAnalysis = {
							...analysis,
							metadata: {
								...analysis.metadata,
								...metadata // Persist ALL metadata including jobId for backend reconnection
							},
							updatedAt: Date.now()
						};

						// Only local runs get a pulse. A server job's liveness is the server's to report,
						// and the sweep never touches backend records.
						if (metadata.executionMode === 'wasm') {
							updatedAnalysis.lastHeartbeatAt = Date.now();
						}
						await analysisStorage.saveAnalysis(updatedAnalysis);
						console.log(
							`📊 [AnalysisStore] Persisted metadata (executionMode=${metadata.executionMode}, jobId=${metadata.jobId || 'n/a'}) for ${analysisId.slice(0, 8)}...`
						);

						// Also update the in-memory analyses array
						update((state) => ({
							...state,
							analyses: state.analyses.map((a) => (a.id === analysisId ? updatedAnalysis : a))
						}));
					}
				} catch (error) {
					console.error('Error persisting executionMode:', error);
				}
			}
		},

		// Update analysis progress (legacy method - uses first active analysis)
		updateAnalysisProgress(status, progress, message) {
			update((state) => {
				if (!state.activeAnalyses || state.activeAnalyses.length === 0) return state;

				// Update the first active analysis for backward compatibility
				const firstActive = state.activeAnalyses[0];
				return this._updateAnalysisProgressByIdInternal(
					firstActive.id,
					status,
					progress,
					message,
					state
				);
			});
		},

		// Update analysis progress by specific ID
		updateAnalysisProgressById(analysisId, status, progress, message) {
			update((state) => {
				return this._updateAnalysisProgressByIdInternal(
					analysisId,
					status,
					progress,
					message,
					state
				);
			});
		},

		// Internal helper for updating analysis progress by ID
		_updateAnalysisProgressByIdInternal(analysisId, status, progress, message, state) {
			if (!analysisId) return state;

			console.log(
				`📊 [AnalysisStore] UPDATE: ${analysisId.slice(0, 8)}... status=${status} progress=${progress}%`
			);

			// Create log entry
			const logEntry = { time: new Date().toISOString(), message, status };

			// Update the analysis in activeAnalyses
			const activeAnalyses = (state.activeAnalyses || []).map((a) => {
				if (a.id !== analysisId) return a;

				const logs = [...(a.logs || [])];
				const lastLog = logs[logs.length - 1];

				// Only add if different from last log
				if (!lastLog || lastLog.message !== message || lastLog.status !== status) {
					logs.push(logEntry);
				}

				return {
					...a,
					status,
					progress: Math.min(Math.max(0, progress), 100),
					message,
					logs
				};
			});

			// Also sync status to the main analyses array to keep them in sync
			const analyses = (state.analyses || []).map((a) => {
				if (a.id !== analysisId) return a;
				return {
					...a,
					status,
					updatedAt: new Date().getTime()
				};
			});

			return {
				...state,
				analyses,
				activeAnalyses
			};
		},

		// Complete analysis progress (legacy method - uses first active analysis)
		async completeAnalysisProgress(
			success = true,
			message = success ? 'Analysis completed.' : 'Analysis failed.'
		) {
			const status = success ? 'completed' : 'error';

			// Get the current state to access the first active analysis ID
			let currentState;
			subscribe((state) => {
				currentState = state;
			})();

			if (!currentState?.activeAnalyses || currentState.activeAnalyses.length === 0) {
				return; // No active analyses
			}

			const analysisId = currentState.activeAnalyses[0].id;

			update((state) => {
				const activeAnalyses = (state.activeAnalyses || []).map((a) => {
					if (a.id !== analysisId) return a;

					const logs = [...(a.logs || [])];
					logs.push({ time: new Date().toISOString(), message, status });

					return {
						...a,
						status,
						progress: success ? 100 : a.progress,
						message,
						logs,
						completedAt: success ? new Date().toISOString() : undefined
					};
				});

				return {
					...state,
					activeAnalyses
				};
			});

			// If we have an active analysis ID, update its status in both client and server
			if (analysisId) {
				// Get current logs, result, and metadata from the active analysis
				const activeAnalysis = (currentState.activeAnalyses || []).find((a) => a.id === analysisId);
				const currentLogs = activeAnalysis?.logs || [];
				const currentResult = activeAnalysis?.result || null;
				const currentMetadata = activeAnalysis?.metadata || {};

				// Update IndexedDB
				try {
					const analysis = await analysisStorage.getAnalysis(analysisId);
					if (analysis) {
						// Use the saved result if no current result is available
						const finalResult = currentResult || analysis.result;

						await analysisStorage.saveAnalysis({
							...analysis,
							status,
							logs: currentLogs, // Include logs from active analysis
							result: finalResult, // Ensure result is saved with raw stdout
							metadata: currentMetadata, // Include metadata from active analysis
							completedAt: success ? new Date().getTime() : undefined
						});

						// Also update the analyses array in the store
						update((state) => ({
							...state,
							analyses: state.analyses.map((a) =>
								a.id === analysisId
									? {
											...a,
											status,
											logs: currentLogs, // Include logs here too
											result: finalResult, // Include result with raw stdout here too
											metadata: currentMetadata, // Include metadata here too
											completedAt: success ? new Date().getTime() : undefined
										}
									: a
							)
						}));
					}
				} catch (error) {
					console.error('Error updating analysis in IndexedDB:', error);
				}
			}
		},

		// Complete analysis progress by specific ID (atomic, avoids race conditions)
		async completeAnalysisProgressById(
			analysisId,
			success = true,
			message = success ? 'Analysis completed.' : 'Analysis failed.'
		) {
			if (!analysisId) return;

			const status = success ? 'completed' : 'error';

			console.log(
				`📊 [AnalysisStore] COMPLETE: ${analysisId.slice(0, 8)}... success=${success} status=${status}`
			);

			// Get the active analysis data before updating
			let activeAnalysisData = null;
			update((state) => {
				activeAnalysisData = state.activeAnalyses.find((a) => a.id === analysisId);
				return state; // No changes yet
			});

			// Update both activeAnalyses and analyses arrays atomically
			update((state) => {
				const activeAnalyses = (state.activeAnalyses || []).map((a) => {
					if (a.id !== analysisId) return a;

					const logs = [...(a.logs || [])];
					logs.push({ time: new Date().toISOString(), message, status });

					return {
						...a,
						status,
						progress: success ? 100 : a.progress,
						message,
						logs,
						completedAt: success ? new Date().toISOString() : undefined
					};
				});

				// Also sync to main analyses array
				const analyses = (state.analyses || []).map((a) => {
					if (a.id !== analysisId) return a;
					return {
						...a,
						status,
						completedAt: success ? new Date().getTime() : undefined,
						updatedAt: new Date().getTime()
					};
				});

				return {
					...state,
					analyses,
					activeAnalyses
				};
			});

			// The entry is terminal now, so this tab may have nothing left to vouch for.
			stopHeartbeatIfIdle();

			// Persist to IndexedDB and server
			const currentLogs = activeAnalysisData?.logs || [];
			const currentResult = activeAnalysisData?.result || null;
			const currentMetadata = activeAnalysisData?.metadata || {};

			// Update IndexedDB
			try {
				const analysis = await analysisStorage.getAnalysis(analysisId);
				if (analysis) {
					const finalResult = currentResult || analysis.result;

					await analysisStorage.saveAnalysis({
						...analysis,
						status,
						logs: currentLogs,
						result: finalResult,
						metadata: currentMetadata,
						completedAt: success ? new Date().getTime() : undefined
					});

					// Sync result back to store
					update((state) => ({
						...state,
						analyses: state.analyses.map((a) =>
							a.id === analysisId
								? {
										...a,
										status,
										logs: currentLogs,
										result: finalResult,
										metadata: currentMetadata,
										completedAt: success ? new Date().getTime() : undefined
									}
								: a
						)
					}));
				}
			} catch (error) {
				console.error('Error updating analysis in IndexedDB:', error);
			}
		},

		// Remove analysis from active list (for when user dismisses a completed analysis)
		removeFromActiveAnalyses(analysisId) {
			console.log(`📊 [AnalysisStore] REMOVE from active: ${analysisId.slice(0, 8)}...`);
			update((state) => {
				const newActiveAnalyses = (state.activeAnalyses || []).filter((a) => a.id !== analysisId);
				console.log(`📊 [AnalysisStore] activeAnalyses count: ${newActiveAnalyses.length}`);
				return {
					...state,
					activeAnalyses: newActiveAnalyses
				};
			});
			stopHeartbeatIfIdle();
		},

		// Clear all analyses
		async clearAllAnalyses() {
			if (!browser) return;

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				// Clear all analyses from IndexedDB
				await analysisStorage.clearAllAnalyses();

				// Reset the store state
				update((state) => ({
					...state,
					analyses: [],
					currentAnalysisId: null,
					activeAnalyses: [],
					isLoading: false
				}));
			} catch (error) {
				console.error('Error clearing all analyses:', error);
				update((state) => ({
					...state,
					error: error.message,
					isLoading: false
				}));
				throw error;
			}
		},

		// Clean up analyses that were interrupted by page refresh
		// This marks WASM analyses that were in running/pending state as 'interrupted'
		async cleanupInterruptedAnalyses() {
			if (!browser) return;

			console.log('📊 [AnalysisStore] Checking for interrupted WASM analyses...');

			// First load analyses from IndexedDB to check for stale running analyses
			let analyses = [];
			try {
				analyses = await analysisStorage.getAllAnalyses();
			} catch (error) {
				console.error('Error loading analyses for cleanup:', error);
				return;
			}

			// Find local runs that stopped without finishing.
			//
			// The heartbeat check is what keeps this tab out of another tab's business: IndexedDB is
			// shared across tabs, so without it, opening a second tab reaped the first tab's live run.
			const interruptedAnalyses = analyses.filter(isReapable);

			if (interruptedAnalyses.length === 0) {
				console.log('📊 [AnalysisStore] No interrupted analyses found');
				return;
			}

			console.log(
				`📊 [AnalysisStore] Found ${interruptedAnalyses.length} interrupted WASM analyses`
			);

			// Update each interrupted analysis
			const reapedIds = new Set(interruptedAnalyses.map((a) => a.id));
			const updatedAnalyses = analyses.map((analysis) => {
				if (isReapable(analysis)) {
					return {
						...analysis,
						status: 'interrupted',
						interruptedAt: new Date().getTime(),
						// True of both causes. A reaped record is no longer necessarily a refresh — it may
						// be a tab that was closed, or one whose heartbeat stopped.
						error: 'This run stopped when its browser tab closed or reloaded.',
						updatedAt: new Date().getTime()
					};
				}
				return analysis;
			});

			// Persist the records this sweep actually changed.
			//
			// Keyed on the ids reaped above, not on `status === 'interrupted'`: that test also matched
			// records interrupted in some earlier session, so every page load rewrote them — whole
			// objects, results and all — for no change.
			for (const analysis of updatedAnalyses) {
				if (reapedIds.has(analysis.id)) {
					try {
						await analysisStorage.saveAnalysis(analysis);
						console.log(
							`📊 [AnalysisStore] Marked analysis ${analysis.id.slice(0, 8)}... as interrupted`
						);
					} catch (error) {
						console.error(`Error saving interrupted analysis ${analysis.id}:`, error);
					}
				}
			}

			// Update store state
			update((state) => ({
				...state,
				analyses: updatedAnalyses,
				activeAnalyses: [] // Clear any stale active analyses
			}));
		},

		// Attempt to reconnect to backend analyses that were running during page refresh
		// Returns list of analyses that need reconnection so BackendAnalysisRunner can query their status
		async attemptBackendReconnection() {
			if (!browser) return [];

			console.log('📊 [AnalysisStore] Checking for backend analyses to reconnect...');

			// Load analyses from IndexedDB
			let analyses = [];
			try {
				analyses = await analysisStorage.getAllAnalyses();
			} catch (error) {
				console.error('Error loading analyses for reconnection:', error);
				return [];
			}

			// Find backend analyses that were running/pending AND have a jobId
			const backendToReconnect = analyses.filter(
				(a) =>
					a.metadata?.executionMode === 'backend' &&
					['pending', 'initializing', 'running', 'processing'].includes(a.status) &&
					a.metadata?.jobId // Must have a jobId to reconnect
			);

			if (backendToReconnect.length === 0) {
				console.log('📊 [AnalysisStore] No backend analyses to reconnect');
				return [];
			}

			console.log(
				`📊 [AnalysisStore] Found ${backendToReconnect.length} backend analyses to reconnect`
			);

			// Mark them as 'reconnecting' in both IndexedDB and store
			const updatedAnalyses = analyses.map((analysis) => {
				if (
					analysis.metadata?.executionMode === 'backend' &&
					['pending', 'initializing', 'running', 'processing'].includes(analysis.status) &&
					analysis.metadata?.jobId
				) {
					return {
						...analysis,
						status: 'reconnecting',
						reconnectAttemptedAt: Date.now(),
						updatedAt: Date.now()
					};
				}
				return analysis;
			});

			// Persist to IndexedDB
			for (const analysis of updatedAnalyses) {
				if (analysis.status === 'reconnecting') {
					try {
						await analysisStorage.saveAnalysis(analysis);
						console.log(
							`📊 [AnalysisStore] Marked analysis ${analysis.id.slice(0, 8)}... as reconnecting`
						);
					} catch (error) {
						console.error(`Error saving reconnecting analysis ${analysis.id}:`, error);
					}
				}
			}

			// Update store state
			update((state) => ({
				...state,
				analyses: updatedAnalyses
			}));

			// Return the original analysis data (with jobId) for BackendAnalysisRunner to use
			return backendToReconnect;
		}
	};
}

export const analysisStore = createAnalysisStore();

// Derived store for the current analysis
export const currentAnalysis = derived(analysisStore, ($analysisStore) => {
	if (!$analysisStore.currentAnalysisId) return null;
	return $analysisStore.analyses.find((a) => a.id === $analysisStore.currentAnalysisId);
});

// Derived store to get analyses for a specific file
export function getAnalysesForFile(fileId) {
	return derived(analysisStore, ($analysisStore) =>
		$analysisStore.analyses.filter((a) => a.fileId === fileId)
	);
}

// Derived store for the active analysis progress (for backward compatibility)
export const activeAnalysisProgress = derived(analysisStore, ($analysisStore) => {
	// Return the first active analysis for backward compatibility
	if ($analysisStore.activeAnalyses.length > 0) {
		return $analysisStore.activeAnalyses[0];
	}
	// Return empty state for backward compatibility
	return {
		id: null,
		status: null,
		progress: 0,
		message: '',
		logs: []
	};
});

// Derived store for the list of active analyses
export const activeAnalyses = derived(
	analysisStore,
	($analysisStore) => $analysisStore.activeAnalyses
);
