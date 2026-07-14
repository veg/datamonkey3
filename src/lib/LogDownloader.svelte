<script>
	import { onMount } from 'svelte';
	import { exportData } from './utils/exportUtils';
	import { analysisStore } from '../stores/analyses';
	import { Download, ChevronDown } from '$lib/icons';

	// Props
	export let analysisId;

	// Local state
	let showOptions = false;
	let downloadStatus = '';
	let statusTimeout;
	let analysis = null;

	// Log types available for download
	const logTypes = [
		{
			id: 'stdout',
			label: 'Standard Output (stdout)',
			description: 'Program output and results',
			icon: '🖥️',
			filename: 'stdout.txt'
		},
		{
			id: 'stderr',
			label: 'Standard Error (stderr)',
			description: 'Error messages and warnings',
			icon: '⚠️',
			filename: 'stderr.txt'
		},
		{
			id: 'combined',
			label: 'Execution Log',
			description: 'Combined stdout and stderr',
			icon: '📄',
			filename: 'execution.log'
		}
	];

	// Load analysis data when analysisId changes
	$: if (analysisId) {
		loadAnalysis(analysisId);
	}

	// Load analysis data
	async function loadAnalysis(id) {
		try {
			// Get analysis from store
			analysis = $analysisStore.analyses.find((a) => a.id === id);

			if (!analysis) {
				analysis = await analysisStore.getAnalysis(id);
			}
		} catch (error) {
			console.error('Error loading analysis data:', error);
		}
	}

	// Toggle options dropdown
	function toggleOptions() {
		showOptions = !showOptions;
	}

	// Download log file
	async function downloadLog(logType) {
		if (!analysis) return;

		try {
			let content = '';
			const logInfo = logTypes.find((lt) => lt.id === logType);

			if (!logInfo) {
				throw new Error('Invalid log type');
			}

			console.log('LogDownloader - Analysis:', analysis);
			console.log('LogDownloader - Analysis Logs:', analysis.logs);
			console.log('LogDownloader - Analysis Logs Type:', typeof analysis.logs);
			console.log('LogDownloader - Analysis Logs Is Array:', Array.isArray(analysis.logs));
			if (analysis.logs) {
				console.log(
					'LogDownloader - Analysis Logs Length:',
					Array.isArray(analysis.logs) ? analysis.logs.length : 'N/A'
				);
				if (Array.isArray(analysis.logs) && analysis.logs.length > 0) {
					console.log('LogDownloader - First Log Entry:', analysis.logs[0]);
				}
			}

			// Generate filename based on analysis method and timestamp
			const method = analysis.method.toUpperCase();
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
			const filename = `${method}_${timestamp}_${logInfo.filename}`;

			// Try to get raw stdout from result
			let rawStdout = '';

			// Check if we have a result with stdout
			if (analysis.result) {
				try {
					// Try to parse the result if it's a string
					const resultObj =
						typeof analysis.result === 'string' ? JSON.parse(analysis.result) : analysis.result;

					// Check if the parsed result has stdout
					if (resultObj && resultObj.stdout) {
						rawStdout = resultObj.stdout;
						console.log('LogDownloader - Found raw stdout in result');
					}
				} catch (e) {
					console.warn('LogDownloader - Failed to parse analysis result:', e);
				}
			}

			// Get log content based on type
			switch (logType) {
				case 'stdout':
					// First try to use the raw stdout from the result
					if (rawStdout) {
						content = rawStdout;
					} else {
						// Fall back to logs if no raw stdout
						const stdoutContent = getStdoutFromLogs(analysis.logs);
						console.log('LogDownloader - Stdout Content:', stdoutContent);
						content = stdoutContent || analysis.logs?.stdout || 'No standard output available';
					}

					// Add header information if we have content
					if (content && content !== 'No standard output available') {
						content =
							`=== STANDARD OUTPUT FOR ${analysis.method?.toUpperCase() || 'ANALYSIS'} ===\n` +
							`Started: ${formatTimestamp(analysis.startTime || analysis.logs[0]?.time)}\n\n` +
							content;
					}
					break;
				case 'stderr':
					// For stderr, we don't typically have raw stderr output, so just use the logs
					const stderrContent = getStderrFromLogs(analysis.logs);
					console.log('LogDownloader - Stderr Content:', stderrContent);
					content = stderrContent || analysis.logs?.stderr || 'No error output available';

					// Add header information if we have content
					if (content && content !== 'No error output available') {
						content =
							`=== STANDARD ERROR FOR ${analysis.method?.toUpperCase() || 'ANALYSIS'} ===\n` +
							`Started: ${formatTimestamp(analysis.startTime || analysis.logs[0]?.time)}\n\n` +
							content;
					}
					break;
				case 'combined':
					// First try to use the raw stdout from the result
					let stdout = '';
					if (rawStdout) {
						stdout = rawStdout;
						console.log('LogDownloader - Using raw stdout for combined log');
					} else {
						stdout =
							analysis.logs?.stdout ||
							getStdoutFromLogs(analysis.logs) ||
							'No standard output available';
						console.log('LogDownloader - Using logs for stdout in combined log');
					}

					const stderr =
						analysis.logs?.stderr ||
						getStderrFromLogs(analysis.logs) ||
						'No error output available';
					console.log('LogDownloader - Combined Stdout:', stdout.substring(0, 100) + '...');
					console.log('LogDownloader - Combined Stderr:', stderr);

					// Create a properly formatted execution log
					content = `=== EXECUTION LOG FOR ${analysis.method?.toUpperCase() || 'ANALYSIS'} ===\n`;
					content += `Started: ${formatTimestamp(analysis.startTime || analysis.logs?.[0]?.time)}\n`;
					if (analysis.completedAt) {
						content += `Completed: ${formatTimestamp(analysis.completedAt)}\n`;
					}
					content += `Status: ${analysis.status || 'unknown'}\n\n`;

					// If we have raw stdout from the result, include it directly
					if (rawStdout) {
						content += `=== RAW HYPHY OUTPUT ===\n${rawStdout}\n\n`;
					}

					// If we also have structured logs, include them
					if (analysis.logs && Array.isArray(analysis.logs) && analysis.logs.length > 0) {
						console.log('LogDownloader - Formatting array logs');
						content += `=== LOG ENTRIES (CHRONOLOGICAL ORDER) ===\n`;

						// Sort logs by timestamp and format them
						const sortedLogs = [...analysis.logs].sort((a, b) => {
							return new Date(a.time || 0) - new Date(b.time || 0);
						});

						content += sortedLogs
							.map((log) => {
								const timestamp = formatTimestamp(log.time);
								return `[${timestamp}] [${log.status || 'info'}] ${log.message}`;
							})
							.join('\n\n');
					} else if (!rawStdout) {
						console.log('LogDownloader - Fallback to stdout/stderr separation');
						// If no raw stdout and no logs, provide the stdout/stderr fallback
						content += `=== STANDARD OUTPUT ===\n${stdout}\n\n=== STANDARD ERROR ===\n${stderr}`;
					}
					break;
				default:
					content = 'Invalid log type selected';
			}

			// Try using the export utility, but provide fallback for older browsers
			try {
				exportData(content, filename, 'txt');
			} catch (e) {
				console.warn('Error using exportData, falling back to alternative method:', e);
				fallbackDownload(content, filename);
			}

			// Show success message
			displayStatus(`Downloaded ${logInfo.label}`);
		} catch (error) {
			console.error('Error downloading log:', error);
			displayStatus('Download failed');
		}
	}

	// Extract stdout from analysis logs
	function getStdoutFromLogs(logs) {
		if (!logs) return '';

		// Handle case where logs is an array (the normal case)
		if (Array.isArray(logs)) {
			// Filter logs that might be stdout entries (any non-error, non-warning logs)
			const stdoutLogs = logs.filter((log) => log.status !== 'error' && log.status !== 'warning');

			// Format logs with timestamps and messages for better readability
			return stdoutLogs
				.map((log) => {
					const timestamp = formatTimestamp(log.time);
					return `[${timestamp}] [${log.status || 'info'}] ${log.message}`;
				})
				.join('\n\n');
		}

		// If logs.stdout exists directly (unlikely but handle it)
		if (logs.stdout) {
			return logs.stdout;
		}

		return '';
	}

	// Extract stderr from analysis logs
	function getStderrFromLogs(logs) {
		if (!logs) return '';

		// Handle case where logs is an array (the normal case)
		if (Array.isArray(logs)) {
			// Filter logs that might be stderr entries (errors and warnings)
			const stderrLogs = logs.filter((log) => log.status === 'error' || log.status === 'warning');

			// Format logs with timestamps and messages for better readability
			return stderrLogs
				.map((log) => {
					const timestamp = formatTimestamp(log.time);
					return `[${timestamp}] [${log.status}] ${log.message}`;
				})
				.join('\n\n');
		}

		// If logs.stderr exists directly (unlikely but handle it)
		if (logs.stderr) {
			return logs.stderr;
		}

		return '';
	}

	// Format timestamp for logs
	function formatTimestamp(isoString) {
		try {
			const date = new Date(isoString);
			return date.toISOString().replace('T', ' ').substring(0, 19);
		} catch (e) {
			return new Date().toISOString().replace('T', ' ').substring(0, 19);
		}
	}

	// Display status message with auto-clear
	function displayStatus(message) {
		downloadStatus = message;

		clearTimeout(statusTimeout);
		statusTimeout = setTimeout(() => {
			downloadStatus = '';
		}, 3000);
	}

	// Fallback method for browsers that don't support Blob/URL.createObjectURL
	function fallbackDownload(content, filename) {
		// Create a temporary textarea element
		const element = document.createElement('textarea');
		element.value = content;
		element.setAttribute('readonly', '');
		element.style.position = 'absolute';
		element.style.left = '-9999px';
		document.body.appendChild(element);

		// Create a link with download attribute using data URI (works in more browsers)
		const link = document.createElement('a');
		const encodedContent = encodeURIComponent(content);
		link.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodedContent);
		link.setAttribute('download', filename);
		link.style.display = 'none';
		document.body.appendChild(link);

		// Trigger download
		link.click();

		// Clean up
		document.body.removeChild(element);
		document.body.removeChild(link);
	}

	// Clean up on component destroy and check browser compatibility
	onMount(() => {
		// Check for Blob and URL.createObjectURL support
		const blobSupported = typeof Blob !== 'undefined';
		const urlSupported = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

		// Log browser compatibility information (dev only)
		console.log(
			`Browser compatibility check: Blob: ${blobSupported}, URL.createObjectURL: ${urlSupported}`
		);

		return () => {
			clearTimeout(statusTimeout);
		};
	});
</script>

<div class="log-downloader">
	<div class="relative">
		<!-- Dropdown toggle button -->
		<button
			on:click={toggleOptions}
			class="flex items-center rounded bg-gray-100 px-4 py-2 font-semibold text-gray-800 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
			aria-expanded={showOptions}
			aria-haspopup="true"
		>
			<Download class="mr-2 h-5 w-5" />
			Download Logs
			<ChevronDown class="ml-2 h-5 w-5" />
		</button>

		<!-- Status message -->
		{#if downloadStatus}
			<span class="ml-2 text-sm font-medium text-green-600">{downloadStatus}</span>
		{/if}

		<!-- Dropdown menu -->
		{#if showOptions}
			<div
				class="absolute right-0 z-10 mt-2 w-72 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
				role="menu"
				aria-orientation="vertical"
				aria-labelledby="log-options-button"
			>
				<div class="p-3">
					<h3 class="mb-2 text-sm font-medium text-gray-900">Download Log Files</h3>
					<p class="mb-3 text-xs text-gray-500">
						Access raw output files for debugging and documentation
					</p>

					<div class="space-y-2">
						{#each logTypes as logType}
							<button
								on:click={() => downloadLog(logType.id)}
								class="flex w-full items-start rounded-md p-2 text-left hover:bg-gray-50"
								role="menuitem"
							>
								<span class="mr-3 text-lg">{logType.icon}</span>
								<div>
									<p class="text-sm font-medium text-gray-900">{logType.label}</p>
									<p class="text-xs text-gray-500">{logType.description}</p>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
