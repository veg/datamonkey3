/**
 * The seam between "Save edits" in the alignment viewer and the rest of the app.
 *
 * WHY THIS EXISTS. saveEdits() used to write the edited FASTA to IndexedDB and to
 * alignmentFileStore, and stop. Nothing re-ran datareader, so `fileMetricsStore.canonicalFasta` —
 * the exact bytes AnalyzeTab hands to every runner, local and remote — still held the PRE-edit
 * alignment. The button said "Saved", the viewer showed the edit, and every subsequent analysis ran
 * on the alignment the user had just changed. Deleting a contaminated sequence and hitting Run
 * produced a result computed WITH that sequence.
 *
 * The fix is not to patch canonicalFasta: the metrics, the trees, the site count and the warnings
 * are all derived from the file too. The edited alignment has to go back through the same upload
 * path as any other file.
 */
import { fileMetricsStore } from '../../stores/fileInfo.js';

/**
 * Build the File that "Save edits" produces from AliVibe's rows.
 * @param {Array<{name: string, seq: string}>} rows
 * @param {string} filename - kept identical to the original so the store replaces in place and the
 *   analysis history stays attached to the same file id.
 * @returns {File}
 */
export function buildEditedAlignmentFile(rows, filename = 'alignment.fasta') {
	if (!rows || !rows.length) {
		throw new Error('No alignment data to save');
	}
	const fasta = rows.map((entry) => `>${entry.name}\n${entry.seq}`).join('\n') + '\n';
	return new File([fasta], filename, { type: 'text/plain' });
}

/**
 * Route an edited alignment back through validation.
 *
 * @param {File} newFile
 * @param {{revalidate: (file: File) => Promise<any>|any, setRevalidating?: (id: string|null) => void, fileId?: string|null}} deps
 *   `revalidate` is +page.svelte's handleFileUpload entry point; `setRevalidating` flips the flag
 *   the Run button reads.
 */
export async function applyAlignmentEdits(newFile, { revalidate, setRevalidating, fileId } = {}) {
	if (typeof revalidate !== 'function') {
		throw new Error('applyAlignmentEdits requires a revalidate function');
	}

	// Drop the descriptor BEFORE awaiting anything. Between the click and the end of the re-read
	// there is a window of several seconds on a large alignment, and for all of it the old
	// canonicalFasta would otherwise still be the string a Run would submit. Gone is correct;
	// stale is not.
	fileMetricsStore.set(null);
	setRevalidating?.(fileId ?? null);

	try {
		return await revalidate(newFile);
	} finally {
		setRevalidating?.(null);
	}
}
