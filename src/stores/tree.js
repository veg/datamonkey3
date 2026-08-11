import { writable } from 'svelte/store';

// Initialize with an empty object to avoid null checks
export const treeStore = writable({});

// Helper functions for tree store management.
// Each helper shallow-clones the passed object before mutating + set()-ing it, so
// store state is never aliased to a caller-held reference (external mutation of the
// caller's object must not silently rewrite store state and bypass subscribers).
export const addTree = (treeId, newickString, trees = {}) => {
	if (treeId && newickString) {
		const next = { ...trees, [treeId]: newickString };
		treeStore.set(next);
		return next;
	}
	return { ...trees };
};

export const removeTree = (treeId, trees = {}) => {
	if (treeId && trees[treeId]) {
		const next = { ...trees };
		delete next[treeId];
		treeStore.set(next);
		return next;
	}
	return { ...trees };
};

export const updateTaggedTree = (treeId, taggedNewick, trees = {}) => {
	if (treeId && taggedNewick) {
		const next = { ...trees, [treeId]: taggedNewick };
		treeStore.set(next);
		return next;
	}
	return { ...trees };
};

// Reset the tree store to an empty object. Called at the start of each new file
// upload so a usertree extracted from a previous alignment cannot survive into a
// different alignment (addTree only ever adds keys, so a tree-less second file
// would otherwise inherit the first file's usertree). See issue #167.
export const resetTrees = () => {
	treeStore.set({});
	return {};
};
