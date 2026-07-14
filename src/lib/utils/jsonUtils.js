/**
 * JSON parsing utilities with defensive handling for corrupted JSON files.
 *
 * Some backend result files (e.g. FUBAR) can have a second partial JSON blob
 * appended after the valid closing `}`, which causes JSON.parse() to fail with
 * "Unexpected non-whitespace character after JSON input".
 *
 * safeParseJSON handles this by tracking brace depth to find the true end of
 * the top-level object and truncating any trailing garbage before retrying.
 */

/**
 * Attempt to parse a JSON string, with a fallback that truncates trailing
 * garbage appended after the top-level closing brace.
 *
 * @param {string} input - The raw JSON string to parse
 * @returns {any} The parsed JSON value
 * @throws {SyntaxError} If the input cannot be salvaged
 */
export function safeParseJSON(input) {
	// Fast path: try normal parse first
	try {
		return JSON.parse(input);
	} catch (originalError) {
		// Only attempt recovery for the specific "after JSON" family of errors.
		// Different engines phrase it differently:
		//   V8:      "Unexpected non-whitespace character after JSON input"
		//   Firefox: "JSON.parse: unexpected non-whitespace character after JSON data"
		//   Safari:  "JSON Parse error: Unexpected content at end of JSON"
		const msg = originalError.message || '';
		const isTrailingGarbage =
			/after JSON/i.test(msg) ||
			/at end of JSON/i.test(msg) ||
			/unexpected.*after/i.test(msg);

		if (!isTrailingGarbage) {
			throw originalError;
		}

		// Scan for the end of the first top-level object by tracking brace depth,
		// while correctly skipping over string literals.
		const endIndex = findTopLevelObjectEnd(input);

		if (endIndex === -1) {
			// Could not find a balanced top-level object — nothing to salvage.
			throw originalError;
		}

		const truncated = input.slice(0, endIndex + 1);

		try {
			const result = JSON.parse(truncated);
			console.warn(
				`[safeParseJSON] Truncated ${input.length - truncated.length} bytes of trailing garbage ` +
					`from JSON input (total length: ${input.length}, valid length: ${truncated.length}).`
			);
			return result;
		} catch (_retryError) {
			// Truncation didn't help — throw the original error so the caller
			// sees the most useful message.
			throw originalError;
		}
	}
}

/**
 * Find the index of the closing `}` that matches the first `{` in the string,
 * correctly handling nested braces and JSON string literals (including escape
 * sequences).
 *
 * @param {string} str - The raw string to scan
 * @returns {number} Index of the matching `}`, or -1 if not found
 */
function findTopLevelObjectEnd(str) {
	let depth = 0;
	let inString = false;
	let started = false;

	for (let i = 0; i < str.length; i++) {
		const ch = str[i];

		if (inString) {
			if (ch === '\\') {
				// Skip escaped character
				i++;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}

		if (ch === '"') {
			inString = true;
			continue;
		}

		if (ch === '{') {
			depth++;
			started = true;
		} else if (ch === '}') {
			depth--;
			if (started && depth === 0) {
				return i;
			}
		}
	}

	return -1;
}
