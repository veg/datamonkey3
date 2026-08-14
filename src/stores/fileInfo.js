import { writable, derived } from 'svelte/store';
import { fileStorage } from '../lib/utils/indexedDBStorage';
import { browser } from '$app/environment';
import { trackEvent } from '../lib/utils/analytics.js';
import { uniqueFilename } from '../lib/utils/fileIdentity.js';

// Basic stores for immediate usage
export const alignmentFileStore = writable(null);
export const fileMetricsStore = writable(null);

/**
 * The id of the file currently being re-read after an in-place edit, or null.
 *
 * In-memory on purpose. The obvious alternative — gate the Run button on a 'pending' datareader
 * record — wedges the button forever if that record is orphaned: cleanupInterruptedAnalyses
 * (stores/analyses.js) only reconciles records whose metadata.executionMode is 'wasm', and
 * datareader records carry no metadata at all. A flag that dies with the tab cannot outlive the
 * work it describes.
 */
export const revalidatingFileId = writable(null);

// Persistent file store
function createPersistentFileStore() {
	const { subscribe, set, update } = writable({
		files: [],
		currentFileId: null,
		isLoading: false,
		error: null
	});

	return {
		subscribe,

		// Load all files from browser storage
		async loadFiles() {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const files = await fileStorage.getAllFiles();
				update((state) => ({ ...state, files, isLoading: false }));
			} catch (error) {
				console.error('Error loading files:', error);
				update((state) => ({ ...state, error: error.message, isLoading: false }));
			}
		},

		/**
		 * Upload a file to browser storage.
		 *
		 * @param {File} file
		 * @param {Object} metadata - persisted alongside the record (demo provenance, etc). This used
		 *   to be dropped on the floor: +page.svelte has always passed it, uploadFile has always
		 *   taken one parameter, so demo files were indistinguishable from user uploads on disk.
		 * @param {{onConflict?: (ctx: {existing: Object, incoming: File}) => Promise<'replace'|'keep-both'>}} hooks
		 *   Optional. When a same-name record exists AND a hook is supplied, the caller decides.
		 *   With no hook the behaviour is exactly what it was (silent in-place replace), which is
		 *   what FileManager, the demo loader and the alignment-edit save all want.
		 */
		async uploadFile(file, metadata = {}, { onConflict } = {}) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				// Check if a file with the same name already exists
				let existingFileId = null;
				let existingRecord = null;
				let takenNames = [];

				update((state) => {
					// Check current state for a file with the same name
					const existing = state.files.find((f) => f.filename === file.name);
					if (existing) {
						existingFileId = existing.id;
						existingRecord = existing;
					}
					takenNames = state.files.map((f) => f.filename);
					return state;
				});

				let fileToSave = file;
				let effectiveMetadata = metadata;

				if (existingFileId && typeof onConflict === 'function') {
					const choice = await onConflict({ existing: existingRecord, incoming: file });
					if (choice === 'keep-both') {
						// Uniquify BEFORE forceNew reaches saveFile — see uniqueFilename's note. A new
						// name means a new id, which means the new file starts with no analyses. That is
						// the point: the old runs describe the old contents.
						const uniqueName = uniqueFilename(file.name, takenNames);
						fileToSave = new File([file], uniqueName, { type: file.type });
						effectiveMetadata = { ...metadata, forceNew: true };
						existingFileId = null;
					}
				}

				let fileId;

				if (existingFileId) {
					// Update existing file with new content
					console.log(`File with name ${file.name} already exists. Updating content.`);

					// Read existing file metadata (without its content buffer) to preserve
					// id/createdAt etc. Fetching metadata-only avoids transiently holding
					// the old file's ArrayBuffer in memory alongside the new one.
					const existingFileMetadata = await fileStorage.getFileMetadata(existingFileId);

					// Convert new file to ArrayBuffer
					const arrayBuffer = await file.arrayBuffer();

					// Update existing file with new content but preserve metadata
					const updatedFile = {
						...existingFileMetadata,
						content: arrayBuffer,
						size: file.size,
						type: file.type,
						updatedAt: new Date().getTime(),
						...effectiveMetadata
					};

					// Save updated file
					await fileStorage.updateFile(existingFileId, updatedFile);
					fileId = existingFileId;
				} else {
					// Save as new file
					fileId = await fileStorage.saveFile(fileToSave, effectiveMetadata);
				}

				// Get the file metadata (without content)
				const fileRecord = await fileStorage.getFile(fileId);
				const { content, ...fileMetadata } = fileRecord;

				// Update file list and set current file
				update((state) => {
					// If the file existed, replace it in the list
					if (existingFileId) {
						return {
							...state,
							files: state.files.map((f) => (f.id === fileId ? fileMetadata : f)),
							currentFileId: fileId,
							isLoading: false
						};
					} else {
						// Otherwise add it to the list
						return {
							...state,
							files: [...state.files, fileMetadata],
							currentFileId: fileId,
							isLoading: false
						};
					}
				});

				// Track file upload event
				trackEvent('file-uploaded', {
					fileSize: file.size
				});

				// Return the file ID for reference
				return fileId;
			} catch (error) {
				console.error('Error uploading file:', error);
				update((state) => ({ ...state, error: error.message, isLoading: false }));
				throw error;
			}
		},

		// Get a file from browser storage by ID
		async getFile(fileId) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				const fileRecord = await fileStorage.getFile(fileId);
				const file = await fileStorage.fileRecordToFile(fileRecord);

				update((state) => ({ ...state, isLoading: false }));

				return file;
			} catch (error) {
				console.error('Error getting file:', error);
				update((state) => ({ ...state, error: error.message, isLoading: false }));
				throw error;
			}
		},

		// Delete a file from browser storage
		async deleteFile(fileId) {
			if (!browser) return; // Only run in browser

			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				await fileStorage.deleteFile(fileId);

				// Remove the file from the list
				update((state) => ({
					...state,
					files: state.files.filter((file) => file.id !== fileId),
					currentFileId: state.currentFileId === fileId ? null : state.currentFileId,
					isLoading: false
				}));
			} catch (error) {
				console.error('Error deleting file:', error);
				update((state) => ({ ...state, error: error.message, isLoading: false }));
				throw error;
			}
		},

		// Set the current file by ID
		setCurrentFile(fileId) {
			update((state) => ({ ...state, currentFileId: fileId }));
		},

		// Clear any errors
		clearError() {
			update((state) => ({ ...state, error: null }));
		}
	};
}

export const persistentFileStore = createPersistentFileStore();

// Derived store for the current file
export const currentFile = derived(persistentFileStore, ($persistentFileStore) => {
	if (!$persistentFileStore.currentFileId) return null;
	return $persistentFileStore.files.find((file) => file.id === $persistentFileStore.currentFileId);
});
