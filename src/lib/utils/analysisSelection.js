/**
 * analysisSelection.js — which analysis the results detail pane should show.
 *
 * This exists as a module rather than a local function in +page.svelte so it can be tested. The bug
 * it fixes (#188) is one the UI reports as a contradiction rather than an error: the history list
 * highlights one analysis while the pane beside it renders another, and nothing throws.
 */

/**
 * The job the app runs on every upload to read file statistics. It is filtered out of the history
 * list on purpose, which is exactly why selecting it is a dead end — there is no card to click to
 * get back out.
 */
const READER_METHOD = 'datareader';

/**
 * Resolve the id the detail pane should render.
 *
 * @param {string|null} currentId - `analysisStore.currentAnalysisId`, the single source of truth.
 * @param {Array<{id: string, fileId: string, method: string, createdAt: number}>} analyses
 * @returns {string|null}
 */
export function resolveSelectedAnalysis(currentId, analyses) {
	if (!currentId) return null;

	const selected = (analyses ?? []).find((a) => a.id === currentId);

	// Unknown ids pass through unchanged rather than being nulled: the record may simply not have
	// loaded yet, and blanking the pane during that window would be its own flicker bug.
	if (!selected || selected.method !== READER_METHOD) return currentId;

	// The selection is the invisible reader job. Prefer the newest real analysis for the same file —
	// on a fresh upload that is whatever the user just ran, which is what they were asking to see.
	const newestReal = (analyses ?? [])
		.filter((a) => a.fileId === selected.fileId && a.method !== READER_METHOD)
		.sort((a, b) => b.createdAt - a.createdAt)[0];

	// If the file genuinely has no real analysis yet, keep the reader job. It is the honest answer:
	// the file statistics are the only thing there is to show.
	return newestReal?.id ?? currentId;
}
