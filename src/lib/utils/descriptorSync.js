/**
 * descriptorSync.js — point the descriptor stores at a given file.
 *
 * WHAT "DESCRIPTOR STORES" MEANS HERE: `alignmentFileStore`, `fileMetricsStore` and `treeStore`.
 * Between them they describe the alignment an analysis will actually be submitted with. They are
 * separate from `currentFile`, which only says which file is SELECTED — and that separation is the
 * bug this module exists to prevent.
 *
 * The re-run path used to set `currentFileId` and stop there. The descriptor stores kept whatever the
 * previously selected file had put in them, so a re-run submitted one file's sequences and tree under
 * a different file's id. It completed successfully and was attributed to the wrong file; nothing
 * anywhere reported a mismatch. See issue #168.
 *
 * This lives in a module rather than inside the route component so it can be tested. It was
 * originally a local function in +page.svelte with no export and no `context="module"` block, which
 * left the most dangerous of the state findings with no seam a test could reach.
 *
 * DEPENDENCIES ARE INJECTED, not imported, for the two things a test cannot conjure: loading a file
 * out of IndexedDB, and the analysis list. The stores themselves are module singletons and are
 * imported directly — a test reads them back with `get()`, which is also how the app observes them.
 */

import { alignmentFileStore, fileMetricsStore } from '../../stores/fileInfo.js';
import { addTree, resetTrees } from '../../stores/tree.js';

/**
 * The most recent completed datareader analysis for a file, or null.
 *
 * datareader is what produces the metrics and the inferred/embedded trees, so its result is the only
 * thing that can rehydrate the descriptor stores. Most recent wins: a file can be re-read, and the
 * newest read is the one that describes it now.
 *
 * @param {Array<{fileId: string, method: string, status: string, createdAt: number, result?: string}>} analyses
 * @param {string} fileId
 */
export function latestDatareaderFor(analyses, fileId) {
	const matches = (analyses ?? [])
		.filter((a) => a.fileId === fileId && a.method === 'datareader' && a.status === 'completed')
		.sort((a, b) => b.createdAt - a.createdAt);
	return matches[0] ?? null;
}

/**
 * Resync every descriptor store to `fileId`.
 *
 * Returns the values the caller needs for its own local state, so the component does not have to
 * re-derive them from the stores it just set.
 *
 * @param {string} fileId
 * @param {{loadFile: (id: string) => Promise<any>, analyses: Array<any>}} deps
 * @returns {Promise<{file: any, metrics: any, trees: Record<string,string>, treeData: Record<string,string>, error: Error|null}>}
 */
export async function syncDescriptorStoresForFile(fileId, { loadFile, analyses } = {}) {
	const result = { file: null, metrics: null, trees: {}, treeData: {}, error: null };

	// RESET FIRST, before anything that can throw or await.
	//
	// Two reasons, and the second was found by the test rather than by reading. If the new file has no
	// datareader result — or one with no tree — the old file's trees must still be gone, so this cannot
	// be conditional on the rehydrate succeeding. And if `loadFile` rejects, an earlier version left
	// the try block with the PREVIOUS file's tree still in the store, which is the wrong-file
	// submission reached by a different route.
	result.treeData = resetTrees();

	try {
		const alignmentFile = await loadFile(fileId);
		if (alignmentFile) {
			result.file = alignmentFile;
			alignmentFileStore.set(alignmentFile);
		}

		const latest = latestDatareaderFor(analyses, fileId);
		if (latest?.result) {
			const metrics = JSON.parse(latest.result);
			result.metrics = metrics;
			fileMetricsStore.set(metrics);

			const nj = metrics?.FILE_INFO?.nj;
			const usertree = metrics?.FILE_PARTITION_INFO?.['0']?.usertree;
			if (nj) {
				result.trees.nj = nj;
				result.treeData = addTree('nj', nj, result.treeData);
			}
			if (usertree) {
				result.trees.usertree = usertree;
				result.treeData = addTree('usertree', usertree, result.treeData);
			}
		}
	} catch (err) {
		// Reported, not thrown. A failure must not take down the re-run path, and must not leave the
		// stores describing the PREVIOUS file — the reset above has already run, so the caller ends up
		// with no descriptor rather than someone else's.
		result.error = err instanceof Error ? err : new Error(String(err));
		console.error('Error resyncing descriptor stores for file:', err);
	}

	return result;
}
