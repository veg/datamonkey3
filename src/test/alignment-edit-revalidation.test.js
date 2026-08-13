/**
 * "Save edits" in the alignment viewer used to write the edited FASTA to IndexedDB and to
 * alignmentFileStore, say "Saved", and stop.
 *
 * Nothing re-ran datareader. `fileMetricsStore.canonicalFasta` — the exact string AnalyzeTab hands
 * to every runner, local and remote — kept describing the alignment BEFORE the edit. So deleting a
 * contaminated sequence and pressing Run produced a result computed with that sequence still in
 * the alignment, while the viewer showed it gone.
 *
 * The two assertions that matter here are (a) the edit reaches revalidation at all, and (b) the
 * pre-edit canonicalFasta is gone before revalidation resolves — a runner that fires mid-re-read
 * must find nothing rather than the old bytes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('alivibe', async () => ({
	AliVibe: (await import('./stubs/AliVibeStub.svelte')).default
}));
vi.mock('../lib/utils/indexedDBStorage', () => ({
	fileStorage: {
		saveFile: vi.fn(async () => 'id'),
		updateFile: vi.fn(async () => 'id'),
		getFile: vi.fn(async () => ({ id: 'id' })),
		getFileMetadata: vi.fn(async () => ({ id: 'id' })),
		getAllFiles: vi.fn(async () => []),
		deleteFile: vi.fn(async () => {}),
		fileRecordToFile: vi.fn(async () => null)
	}
}));
vi.mock('../lib/utils/analytics.js', () => ({ trackEvent: vi.fn() }));

const { buildEditedAlignmentFile, applyAlignmentEdits } = await import(
	'../lib/utils/alignmentEdits.js'
);
const { fileMetricsStore, revalidatingFileId, alignmentFileStore } = await import(
	'../stores/fileInfo.js'
);
const { fileStorage } = await import('../lib/utils/indexedDBStorage');
const AlignmentViewerHarness = (await import('./stubs/AlignmentViewerHarness.svelte')).default;

// jsdom's Blob implements neither text() nor arrayBuffer().
if (typeof Blob.prototype.text !== 'function') {
	Blob.prototype.text = function text() {
		return Promise.resolve('>a\nACGACG\n>b\nACGTTT\n');
	};
}
if (typeof Blob.prototype.arrayBuffer !== 'function') {
	Blob.prototype.arrayBuffer = function arrayBuffer() {
		return Promise.resolve(new ArrayBuffer(0));
	};
}

const editedFile = () =>
	new File(['>a\nACGACG\n>b\nACGTTT\n'], 'alignment.fasta', { type: 'text/plain' });

describe('buildEditedAlignmentFile', () => {
	beforeEach(() => {
		fileMetricsStore.set(null);
		revalidatingFileId.set(null);
	});

	it('keeps the original filename so the record is replaced in place', () => {
		const f = buildEditedAlignmentFile([{ name: 'a', seq: 'ACG' }], 'CD2-slim.fna');
		expect(f.name).toBe('CD2-slim.fna');
	});

	it('refuses to build an empty alignment', () => {
		expect(() => buildEditedAlignmentFile([], 'x.fasta')).toThrow(/No alignment data/i);
	});
});

describe('applyAlignmentEdits', () => {
	beforeEach(() => {
		fileMetricsStore.set(null);
		revalidatingFileId.set(null);
	});

	it('sends the edited file through revalidation exactly once', async () => {
		const revalidate = vi.fn(async () => 'ok');
		const file = editedFile();

		await applyAlignmentEdits(file, { revalidate });

		expect(revalidate).toHaveBeenCalledTimes(1);
		expect(revalidate).toHaveBeenCalledWith(file);
	});

	it('drops the pre-edit descriptor BEFORE revalidation resolves', async () => {
		fileMetricsStore.set({ FILE_INFO: { sequences: 23 }, canonicalFasta: 'OLD' });

		let seenDuringRevalidate = 'not-called';
		const revalidate = vi.fn(async () => {
			// This is the window a Run click would land in.
			seenDuringRevalidate = get(fileMetricsStore);
			return 'ok';
		});

		await applyAlignmentEdits(editedFile(), { revalidate });

		expect(seenDuringRevalidate).toBeNull();
	});

	it('flags the file as revalidating for the whole re-read, then clears it', async () => {
		const seen = [];
		const revalidate = vi.fn(async () => {
			seen.push(get(revalidatingFileId));
			return 'ok';
		});

		await applyAlignmentEdits(editedFile(), {
			revalidate,
			fileId: 'file-1',
			setRevalidating: (id) => revalidatingFileId.set(id)
		});

		expect(seen).toEqual(['file-1']);
		expect(get(revalidatingFileId)).toBeNull();
	});

	it('clears the flag when revalidation REJECTS, so the Run button cannot wedge', async () => {
		const revalidate = vi.fn(async () => {
			throw new Error('datareader rejected the edited alignment');
		});

		await expect(
			applyAlignmentEdits(editedFile(), {
				revalidate,
				fileId: 'file-1',
				setRevalidating: (id) => revalidatingFileId.set(id)
			})
		).rejects.toThrow(/datareader rejected/);

		expect(get(revalidatingFileId)).toBeNull();
	});

	it('fails loudly rather than silently doing nothing when no revalidator is wired', async () => {
		await expect(applyAlignmentEdits(editedFile(), {})).rejects.toThrow(/revalidate/);
	});
});

describe('the viewer hands the edit to its parent instead of filing it itself', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fileMetricsStore.set(null);
		alignmentFileStore.set(null);
		revalidatingFileId.set(null);
	});

	afterEach(() => cleanup());

	it('dispatches editsSaved with the new file and the pre-edit one', async () => {
		const onSaved = vi.fn();
		const original = new File(['>a\nACGACG\n'], 'CD2-slim.fna', { type: 'text/plain' });
		render(AlignmentViewerHarness, { props: { alignmentFile: original, onSaved } });

		await fireEvent.click(screen.getByTitle('Save alignment edits back to file'));

		expect(onSaved).toHaveBeenCalledTimes(1);
		const detail = onSaved.mock.calls[0][0];
		expect(detail.file).toBeInstanceOf(File);
		expect(detail.file.name).toBe('CD2-slim.fna');
		// The pre-edit blob, kept so the error card can offer to put it back if datareader rejects
		// the edit. IndexedDB already holds the edited bytes by then.
		expect(detail.previous).toBe(original);
	});

	it('writes nothing to storage or to alignmentFileStore on its own', async () => {
		// This is the actual defect: those two writes made the edit look applied while the metrics
		// the runners read still described the old alignment.
		const original = new File(['>a\nACGACG\n'], 'CD2-slim.fna', { type: 'text/plain' });
		render(AlignmentViewerHarness, { props: { alignmentFile: original, onSaved: () => {} } });

		await fireEvent.click(screen.getByTitle('Save alignment edits back to file'));

		expect(fileStorage.saveFile).not.toHaveBeenCalled();
		expect(fileStorage.updateFile).not.toHaveBeenCalled();
		expect(get(alignmentFileStore)).toBeNull();
	});
});
// NOTE: there is deliberately no "does not show Saved" case here. Written as an assertion on the
// button label it passes with the fix reverted too — the old code set saveMessage only after an
// await, so nothing has rendered yet at the point a click handler returns. A test that passes
// either way is worse than no test.
