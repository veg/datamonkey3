/**
 * Utility functions for exporting analysis results in various formats.
 */

/**
 * Export data as a downloadable file
 *
 * @param {Object|Array|string} data - The data to export
 * @param {string} filename - The filename to use
 * @param {string} format - The export format (json, csv, txt)
 */
export function exportData(data, filename, format = 'json') {
	let content;
	let mimeType;

	// Convert data to the appropriate format
	switch (format.toLowerCase()) {
		case 'json':
			content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
			mimeType = 'application/json';
			filename = filename.endsWith('.json') ? filename : `${filename}.json`;
			break;

		case 'csv':
			content = convertToCSV(data);
			mimeType = 'text/csv';
			filename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
			break;

		case 'fasta':
			content = typeof data === 'string' ? data : String(data);
			mimeType = 'text/plain';
			filename = filename.endsWith('.fasta') ? filename : `${filename}.fasta`;
			break;

		case 'nex':
		case 'nexus':
			content = typeof data === 'string' ? data : String(data);
			mimeType = 'text/plain';
			filename = filename.endsWith('.nex') ? filename : `${filename}.nex`;
			break;

		case 'txt':
		default:
			content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
			mimeType = 'text/plain';
			filename = filename.endsWith('.txt') ? filename : `${filename}.txt`;
			break;
	}

	// Create a blob and trigger download
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();

	// Clean up
	setTimeout(() => {
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, 100);
}

/**
 * Convert an object or array to CSV format
 *
 * @param {Object|Array} data - The data to convert
 * @returns {string} CSV formatted string
 */
function convertToCSV(data) {
	if (!data) return '';

	// For datareader results - special handling
	if (data.FILE_INFO) {
		return convertDatareaderToCSV(data);
	}

	// For selection analysis results - special handling
	if (data.tested && data.tested.sites) {
		return convertSelectionAnalysisToCSV(data);
	}

	// For an array of objects
	if (Array.isArray(data)) {
		if (data.length === 0) return '';

		// Assume first item properties as headers
		const headers = Object.keys(data[0]);
		const headerRow = headers.join(',');

		const rows = data.map((item) => {
			return headers
				.map((header) => {
					// Handle nested objects, arrays, and quoting
					const cell = item[header];
					return formatCSVCell(cell);
				})
				.join(',');
		});

		return [headerRow, ...rows].join('\n');
	}

	// For a single object
	if (typeof data === 'object' && data !== null) {
		const headers = Object.keys(data);
		const headerRow = headers.join(',');
		const valueRow = headers.map((header) => formatCSVCell(data[header])).join(',');

		return [headerRow, valueRow].join('\n');
	}

	return '';
}

/**
 * Format a cell value for CSV
 *
 * @param {any} value - The cell value
 * @returns {string} Formatted CSV cell
 */
function formatCSVCell(value) {
	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'object') {
		value = JSON.stringify(value);
	}

	// Escape quotes and wrap in quotes if needed
	value = String(value);
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		value = '"' + value.replace(/"/g, '""') + '"';
	}

	return value;
}

/**
 * Convert datareader results to CSV
 *
 * @param {Object} data - The datareader results
 * @returns {string} CSV formatted string
 */
function convertDatareaderToCSV(data) {
	const rows = [];

	// File info
	if (data.FILE_INFO) {
		rows.push('FILE INFO');
		rows.push('Property,Value');

		for (const [key, value] of Object.entries(data.FILE_INFO)) {
			if (typeof value !== 'object') {
				rows.push(`${key},${formatCSVCell(value)}`);
			}
		}

		rows.push(''); // Empty row as separator
	}

	// Partition info
	if (data.FILE_PARTITION_INFO) {
		rows.push('PARTITION INFO');
		rows.push('Partition,Sites,Sequences');

		for (const [partKey, partition] of Object.entries(data.FILE_PARTITION_INFO)) {
			rows.push(`${partKey},${partition.sites || 0},${partition.sequences || 0}`);
		}
	}

	return rows.join('\n');
}

/**
 * Convert selection analysis results to CSV
 *
 * @param {Object} data - The selection analysis results
 * @returns {string} CSV formatted string
 */
function convertSelectionAnalysisToCSV(data) {
	const rows = [];

	// Analysis metadata
	rows.push('ANALYSIS INFO');
	rows.push('Property,Value');

	if (data.input) {
		rows.push(`Method,${data.input.analysis.type || 'Unknown'}`);
		rows.push(`Version,${data.input.version || 'Unknown'}`);
		rows.push(`Created,${data.input.timestamp || 'Unknown'}`);
		rows.push(`Alignment,${data.input.file || 'Unknown'}`);
		rows.push(`Sites,${data.input.sites || 0}`);
		rows.push(`Sequences,${data.input.sequences || 0}`);
	}

	rows.push(''); // Empty row as separator

	// Site results
	if (data.tested && data.tested.sites && data.tested.sites.length > 0) {
		rows.push('SITE RESULTS');

		// Get all possible headers from the first site
		const firstSite = data.tested.sites[0];
		const headers = Object.keys(firstSite);

		// Add headers row
		rows.push(headers.join(','));

		// Add each site as a row
		for (const site of data.tested.sites) {
			const row = headers.map((header) => formatCSVCell(site[header])).join(',');
			rows.push(row);
		}
	}

	return rows.join('\n');
}

/**
 * Export analysis results as a shareable URL
 *
 * @param {string} analysisId - The ID of the analysis
 * @returns {string} A shareable URL
 */
export function createShareableLink(analysisId) {
	// Create an absolute URL to the analysis page
	const baseUrl = window.location.origin;
	return `${baseUrl}/analysis/${analysisId}`;
}

/**
 * Copy text to clipboard
 *
 * @param {string} text - The text to copy
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export async function copyToClipboard(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (err) {
		console.error('Failed to copy: ', err);
		return false;
	}
}
