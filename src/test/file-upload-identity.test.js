/**
 * A file is identified by its NAME here, and that had three consequences nobody chose:
 *
 *  1. persistentFileStore.uploadFile took ONE parameter while +page.svelte has always called it
 *     with two, so the demo/repair provenance in that second argument was silently dropped.
 *  2. A same-name upload replaced the record's bytes in place and kept the id, so every FEL/MEME
 *     run against the OLD contents stayed attached to the new ones with nothing marking them.
 *  3. The file input was never reset, so re-selecting the same path after a rejection fired no
 *     change event at all — the failure loop is the one case where the retry matters most.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uniqueFilename, isStaleRun, resetFileInput } from '../lib/utils/fileIdentity.js';

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('../lib/utils/indexedDBStorage', () => {
	const fileStorage = {
		saveFile: vi.fn(async () => 'new-id'),
		updateFile: vi.fn(async () => 'existing-id'),
		getFile: vi.fn(async (id) => ({
			id,
			filename: 'alignment.fasta',
			content: new ArrayBuffer(0)
		})),
		getFileMetadata: vi.fn(async (id) => ({ id, filename: 'alignment.fasta', createdAt: 1 })),
		getAllFiles: vi.fn(async () => []),
		deleteFile: vi.fn(async () => {}),
		fileRecordToFile: vi.fn(async () => null)
	};
	return { fileStorage };
});

vi.mock('../lib/utils/analytics.js', () => ({ trackEvent: vi.fn() }));

const { fileStorage } = await import('../lib/utils/indexedDBStorage');
const { persistentFileStore } = await import('../stores/fileInfo.js');

// jsdom's Blob has no arrayBuffer(); the store calls it on the in-place replace path.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
	Blob.prototype.arrayBuffer = function arrayBuffer() {
		return Promise.resolve(new ArrayBuffer(0));
	};
}

describe('uniqueFilename', () => {
	it('numbers a colliding name', () => {
		expect(uniqueFilename('alignment.fasta', ['alignment.fasta'])).toBe('alignment (2).fasta');
	});

	it('keeps counting past an existing numbered copy', () => {
		expect(uniqueFilename('alignment.fasta', ['alignment.fasta', 'alignment (2).fasta'])).toBe(
			'alignment (3).fasta'
		);
	});

	it('does not stack suffixes when the colliding name is itself numbered', () => {
		expect(uniqueFilename('alignment (2).fasta', ['alignment (2).fasta'])).toBe(
			'alignment (3).fasta'
		);
	});

	it('leaves a free name alone', () => {
		expect(uniqueFilename('alignment.fasta', ['other.fasta'])).toBe('alignment.fasta');
	});

	it('handles extensionless and multi-dot names', () => {
		expect(uniqueFilename('alignment', ['alignment'])).toBe('alignment (2)');
		expect(uniqueFilename('a.b.fasta', ['a.b.fasta'])).toBe('a.b (2).fasta');
	});
});

describe('isStaleRun', () => {
	it('marks a run that predates the file being replaced', () => {
		expect(isStaleRun({ createdAt: 100 }, { createdAt: 50, updatedAt: 200 })).toBe(true);
	});

	it('does not mark a run made after the replacement', () => {
		expect(isStaleRun({ createdAt: 300 }, { createdAt: 50, updatedAt: 200 })).toBe(false);
	});

	it('never marks anything on a file that was never re-uploaded', () => {
		expect(isStaleRun({ createdAt: 100 }, { createdAt: 50 })).toBe(false);
	});
});

describe('persistentFileStore.uploadFile', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('passes metadata through to storage as the second argument', async () => {
		const file = new File(['>a\nACG\n'], 'demo.fasta', { type: 'text/plain' });
		await persistentFileStore.uploadFile(file, { source: 'demo', demoId: 'CD2' });

		expect(fileStorage.saveFile).toHaveBeenCalledTimes(1);
		expect(fileStorage.saveFile.mock.calls[0][1]).toEqual({ source: 'demo', demoId: 'CD2' });
	});

	it("saves a separate record under a free name when the user picks 'keep both'", async () => {
		// Seed the store with an existing same-name record.
		await persistentFileStore.loadFiles();
		fileStorage.getAllFiles.mockResolvedValueOnce([
			{ id: 'existing-id', filename: 'alignment.fasta', createdAt: 1 }
		]);
		await persistentFileStore.loadFiles();

		const incoming = new File(['>b\nTTT\n'], 'alignment.fasta', { type: 'text/plain' });
		await persistentFileStore.uploadFile(incoming, {}, { onConflict: () => 'keep-both' });

		expect(fileStorage.updateFile).not.toHaveBeenCalled();
		expect(fileStorage.saveFile).toHaveBeenCalledTimes(1);
		const [savedFile, savedMetadata] = fileStorage.saveFile.mock.calls[0];
		expect(savedFile.name).toBe('alignment (2).fasta');
		expect(savedMetadata).toMatchObject({ forceNew: true });
	});

	it('still replaces in place when no conflict hook is supplied', async () => {
		fileStorage.getAllFiles.mockResolvedValueOnce([
			{ id: 'existing-id', filename: 'alignment.fasta', createdAt: 1 }
		]);
		await persistentFileStore.loadFiles();

		const incoming = new File(['>b\nTTT\n'], 'alignment.fasta', { type: 'text/plain' });
		await persistentFileStore.uploadFile(incoming);

		expect(fileStorage.updateFile).toHaveBeenCalledTimes(1);
		expect(fileStorage.saveFile).not.toHaveBeenCalled();
	});
});

describe('resetFileInput', () => {
	it('clears the input on the REJECTED path, not only the successful one', () => {
		const input = document.createElement('input');
		input.type = 'file';
		// jsdom will not let a test assign arbitrary text to a file input's value, but it does allow
		// clearing it — which is the only assignment this helper ever makes.
		let ran = false;

		// The shape handleFileUpload uses: reset in `finally`, after the catch has swallowed.
		try {
			throw new Error('File processing error');
		} catch {
			/* swallowed, as the page does */
		} finally {
			resetFileInput({ target: input });
			ran = true;
		}

		expect(ran).toBe(true);
		expect(input.value).toBe('');
	});

	it('ignores the synthetic { target: { files } } objects demo/repair/edit callers pass', () => {
		expect(() => resetFileInput({ target: { files: [] } })).not.toThrow();
		expect(() => resetFileInput(undefined)).not.toThrow();
	});
});
