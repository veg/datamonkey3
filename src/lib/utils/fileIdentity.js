/**
 * File identity helpers.
 *
 * A file is identified by its NAME in this app: persistentFileStore.uploadFile looks for an
 * existing record with the same filename and replaces its bytes in place, keeping the id. That is
 * deliberate for a repaired or edited version of the same alignment - the analysis history stays
 * attached - but it is wrong when the user means "here is a different file that happens to be
 * called alignment.fasta", because every earlier run silently ends up filed under the new contents.
 * These two helpers are the seam for both halves of the fix: choosing a non-colliding name, and
 * marking the runs that predate a replacement.
 */

/**
 * Return `name` if free, otherwise the first "stem (n).ext" that is not taken.
 *
 * MUST run before `forceNew` reaches indexedDBStorage.saveFile: saveFile does its own
 * findFileByName lookup, so two records sharing a name would make that lookup - used by every
 * other caller - nondeterministic.
 *
 * @param {string} name
 * @param {Iterable<string>} takenNames
 * @returns {string}
 */
export function uniqueFilename(name, takenNames = []) {
	const taken = new Set(takenNames);
	if (!taken.has(name)) return name;

	// Split on the LAST dot so "a.b.fasta" keeps ".fasta". A leading dot (".fasta") is a name, not
	// an extension, hence > 0 rather than >= 0.
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';

	// Strip an existing " (n)" so a third upload gives "alignment (3).fasta", not
	// "alignment (2) (2).fasta".
	const base = stem.replace(/ \(\d+\)$/, '');

	for (let n = 2; n < 1000; n += 1) {
		const candidate = `${base} (${n})${ext}`;
		if (!taken.has(candidate)) return candidate;
	}

	// 999 same-named files is not a real case; fall back to something unique rather than loop.
	return `${base} (${Date.now()})${ext}`;
}

/**
 * Clear a file input so selecting the SAME path again fires another change event.
 *
 * Must be called from a `finally`, not from the happy path: a rejected file is exactly the one the
 * user corrects outside the browser and re-selects, and without this that second selection is a
 * no-op with no feedback at all.
 *
 * The instanceof guard is load-bearing — the demo, repair and alignment-edit callers pass a
 * synthetic `{ target: { files: [...] } }` object with no `value` to clear.
 *
 * @param {{target?: any}} event
 */
export function resetFileInput(event) {
	const target = event?.target;
	if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) {
		target.value = '';
	}
}

/**
 * True when this analysis ran before the file's contents were last replaced.
 *
 * `updatedAt` is only written when an upload replaces an existing record, so a file that was never
 * re-uploaded has none and nothing is ever marked stale.
 *
 * @param {{createdAt?: number}} analysis
 * @param {{createdAt?: number, updatedAt?: number}} file
 * @returns {boolean}
 */
export function isStaleRun(analysis, file) {
	const updatedAt = Number(file?.updatedAt);
	const createdAt = Number(analysis?.createdAt);
	if (!Number.isFinite(updatedAt) || !Number.isFinite(createdAt)) return false;
	return createdAt < updatedAt;
}
