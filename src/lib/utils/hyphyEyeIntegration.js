import { FINAL_HYPHY_EYE_URL } from '../config/env';
import { generateUUID } from './uuid';

/**
 * Store analysis results in localStorage for hyphy-eye integration
 * @param {Object} analysisData - The analysis result data
 * @param {string} method - The analysis method (fel, meme, busted, etc.)
 * @returns {string} - The unique ID for the stored results
 */
export function storeAnalysisForHyphyEye(analysisData, method) {
	const analysisId = generateUUID();
	const storageKey = `hyphy-results-${analysisId}`;

	// Check if analysisData already has the expected HyPhy structure
	let hyphyEyeData;
	if (analysisData.MLE && analysisData.input) {
		// Data is already in HyPhy format, just add our metadata
		hyphyEyeData = {
			...analysisData,
			metadata: {
				datamonkey_id: analysisId,
				created_at: new Date().toISOString(),
				source: 'datamonkey3',
				...analysisData.metadata
			}
		};
	} else {
		// Data needs to be wrapped in HyPhy structure
		hyphyEyeData = {
			MLE: analysisData,
			input: {
				file: analysisData.input?.file || 'analysis.json',
				method: method.toUpperCase(),
				...analysisData.input
			},
			metadata: {
				datamonkey_id: analysisId,
				created_at: new Date().toISOString(),
				source: 'datamonkey3'
			}
		};
	}

	try {
		localStorage.setItem(storageKey, JSON.stringify(hyphyEyeData));
		return analysisId;
	} catch (error) {
		console.error('Error storing analysis data for hyphy-eye:', error);
		throw error;
	}
}

/**
 * Open analysis results in hyphy-eye visualization
 * @param {string} analysisId - The analysis ID stored in localStorage
 * @param {string} method - The analysis method (fel, meme, busted, etc.)
 * @param {boolean} newTab - Whether to open in a new tab (default: true)
 */
export function openInHyphyEye(analysisId, method, newTab = true) {
	const methodName = method.toLowerCase().replace('-', '');
	const methodUrlMap = { 'bstill': 'fubar' };
	const pageName = methodUrlMap[methodName] || methodName;
	const url = `${FINAL_HYPHY_EYE_URL}/pages/${pageName}?id=${analysisId}`;

	if (newTab) {
		window.open(url, '_blank', 'noopener,noreferrer');
	} else {
		window.location.href = url;
	}
}

/**
 * Store analysis and immediately open in hyphy-eye
 * @param {Object} analysisData - The analysis result data
 * @param {string} method - The analysis method
 * @param {boolean} newTab - Whether to open in a new tab (default: true)
 * @returns {string} - The analysis ID
 */
export function shareWithHyphyEye(analysisData, method, newTab = true) {
	const analysisId = storeAnalysisForHyphyEye(analysisData, method);
	openInHyphyEye(analysisId, method, newTab);
	return analysisId;
}

/**
 * Get the hyphy-eye URL for a specific method and analysis ID
 * @param {string} method - The analysis method
 * @param {string} analysisId - The analysis ID (optional)
 * @returns {string} - The hyphy-eye URL
 */
export function getHyphyEyeUrl(method, analysisId = null) {
	const methodName = method.toLowerCase().replace('-', '');
	const methodUrlMap = { 'bstill': 'fubar' };
	const pageName = methodUrlMap[methodName] || methodName;
	let url = `${FINAL_HYPHY_EYE_URL}/pages/${pageName}`;

	if (analysisId) {
		url += `?id=${analysisId}`;
	}

	return url;
}

/**
 * Retrieve analysis data from localStorage
 * @param {string} analysisId - The analysis ID
 * @returns {Object|null} - The analysis data or null if not found
 */
export function getStoredAnalysis(analysisId) {
	const storageKey = `hyphy-results-${analysisId}`;

	try {
		const data = localStorage.getItem(storageKey);
		return data ? JSON.parse(data) : null;
	} catch (error) {
		console.error('Error retrieving analysis data:', error);
		return null;
	}
}

/**
 * Clean up old analysis data from localStorage
 * @param {number} maxAge - Maximum age in milliseconds (default: 7 days)
 */
export function cleanupOldAnalysisData(maxAge = 7 * 24 * 60 * 60 * 1000) {
	const now = Date.now();
	const keysToRemove = [];

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key && key.startsWith('hyphy-results-')) {
			try {
				const data = JSON.parse(localStorage.getItem(key));
				const createdAt = new Date(data.metadata?.created_at).getTime();

				if (now - createdAt > maxAge) {
					keysToRemove.push(key);
				}
			} catch (error) {
				// If we can't parse the data, it's probably corrupted, so remove it
				keysToRemove.push(key);
			}
		}
	}

	keysToRemove.forEach((key) => {
		localStorage.removeItem(key);
	});

	return keysToRemove.length;
}

/**
 * Get supported analysis methods for hyphy-eye integration
 * @returns {Array} - Array of supported method names
 */
export function getSupportedMethods() {
	return ['fel', 'contrastfel', 'meme', 'busted', 'absrel', 'gard', 'nrm', 'multihit', 'slac', 'fubar', 'prime', 'bstill'];
}

/**
 * Check if a method is supported by hyphy-eye
 * @param {string} method - The analysis method
 * @returns {boolean} - Whether the method is supported
 */
export function isMethodSupported(method) {
	return getSupportedMethods().includes(method.toLowerCase().replace('-', ''));
}

/**
 * Debug function to inspect localStorage data
 * @param {string} analysisId - The analysis ID to inspect
 */
export function debugStoredData(analysisId) {
	const storageKey = `hyphy-results-${analysisId}`;
	const data = localStorage.getItem(storageKey);

	console.log('=== DEBUGGING STORED DATA ===');
	console.log('Storage key:', storageKey);
	console.log('Raw localStorage data:', data);

	if (data) {
		try {
			const parsed = JSON.parse(data);
			console.log('Parsed data:', parsed);
			console.log('MLE structure:', parsed.MLE);
			console.log('Input structure:', parsed.input);

			// Check specific properties that hyphy-eye might expect
			if (parsed.MLE) {
				console.log('MLE.fits:', parsed.MLE.fits);
				console.log('MLE.tested:', parsed.MLE.tested);
				console.log('MLE.content:', parsed.MLE.content);
				console.log('MLE.analysis:', parsed.MLE.analysis);
				console.log('MLE.input:', parsed.MLE.input);

				// Check if there's a double nesting issue
				if (parsed.MLE.MLE) {
					console.warn('⚠️  DOUBLE NESTING DETECTED! MLE.MLE exists');
					console.log('Inner MLE structure:', parsed.MLE.MLE);
				}
			}
		} catch (e) {
			console.error('Failed to parse stored data:', e);
		}
	} else {
		console.log('No data found for this analysis ID');
	}
	console.log('=== END DEBUG ===');
}
