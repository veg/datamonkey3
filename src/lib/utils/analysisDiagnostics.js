/**
 * analysisDiagnostics.js — turn a failed analysis record into something a user can read or paste.
 *
 * All three fields these functions format (`error`, `arguments`, `logs`) were already being written
 * to IndexedDB by BaseAnalysisRunner — `arguments` explicitly "for debugging" — and read by nothing.
 * See issue #186.
 *
 * Extracted rather than inlined so the shapes can be tested. The records come from IndexedDB and are
 * not uniform: `arguments` is sometimes a string and sometimes an object, and `logs` entries are
 * sometimes strings and sometimes `{message}`. A viewer that throws on the wrong shape would replace
 * a useless error screen with a broken one.
 */

/** Render a persisted argument list, whatever shape it was stored in. */
export function formatArguments(args) {
	if (args === null || args === undefined) return '';
	if (typeof args === 'string') return args;
	try {
		return JSON.stringify(args, null, 2);
	} catch {
		// Circular or otherwise unserialisable. Say so rather than throwing inside the error view.
		return String(args);
	}
}

/**
 * The last `limit` log lines as plain text.
 *
 * 20 rather than the 5 used by the live progress panel: this is a post-mortem, and the line that
 * explains a failure is rarely the last one.
 */
export function formatLogTail(logs, limit = 20) {
	if (!Array.isArray(logs) || logs.length === 0) return '';
	return logs
		.slice(-limit)
		.map((entry) => {
			if (typeof entry === 'string') return entry;
			if (entry && typeof entry === 'object') {
				return entry.message ?? entry.text ?? JSON.stringify(entry);
			}
			return String(entry);
		})
		.join('\n');
}

/**
 * One block of text combining everything known about a failure, for the clipboard.
 *
 * Ordered for someone pasting into an issue: what failed, what was run, then the tail. Sections with
 * nothing in them are omitted entirely rather than left as empty headings.
 */
export function buildDiagnostics(analysis, { method, filename } = {}) {
	if (!analysis) return '';

	const lines = [];
	const label = method ?? analysis.method ?? 'Analysis';
	lines.push(`${String(label).toUpperCase()} — ${analysis.status ?? 'unknown status'}`);
	if (filename) lines.push(`File: ${filename}`);
	if (analysis.metadata?.executionMode) lines.push(`Execution: ${analysis.metadata.executionMode}`);
	if (analysis.completedAt)
		lines.push(`Completed: ${new Date(analysis.completedAt).toISOString()}`);

	if (analysis.error) lines.push('', 'Error:', String(analysis.error));

	const args = formatArguments(analysis.arguments);
	if (args) lines.push('', 'Run settings:', args);

	const tail = formatLogTail(analysis.logs);
	if (tail) lines.push('', 'Last log lines:', tail);

	return lines.join('\n');
}
