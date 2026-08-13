/**
 * executionAdvice.js — where a submission should run, and what to say about it before it runs.
 *
 * Extracted from MethodSelector for the same reason runStatusLine.js was: the decision and the
 * sentence that explains it are the design, and a design that lives inside a 2000-line component
 * cannot be tested and drifts. See design/03-run-feedback/.
 *
 * THE PROBLEM THIS FILE EXISTS TO FIX: execution mode was hard-coded to 'local' for every method and
 * every dataset. The app already computed, and already displayed one row away, that BGM on a 20x255
 * alignment is ~2h 15m in this browser against ~33 min on the server — and still defaulted to the
 * browser, where a reload or a closed tab loses the run outright.
 *
 * TWO RULES KEEP THIS HONEST:
 *
 *  1. NEVER INVENT A NUMBER. Only methods with a fitted equation in BACKEND_TIMING_EQUATIONS get
 *     advice; AxoMEME, PRIME, NRM, B-STILL and FADE have none, and the answer there is silence, not
 *     a guess. Same rule runStatusLine.js applies to the elapsed row.
 *  2. THE SENTENCE INTERPOLATES THE ESTIMATE'S OWN `description`, never a re-derived duration, so it
 *     is impossible for the advice to disagree with the "Before you run" row rendering the same
 *     field a few pixels below it.
 */

import { calculateRuntimeEstimate } from './timingEstimates.js';

/**
 * Categories worth speaking up about. Anything faster runs locally without comment: a browser is the
 * better place for a two-minute analysis (no queue, no upload), and nagging on fast runs would train
 * users to ignore the line that matters. Names must match SPEED_CATEGORIES in timingEstimates.js —
 * execution-advice.test.js pins that.
 */
export const SLOW_CATEGORIES = new Set(['slow', 'very-slow']);

/** No fitted equation, or no dataset yet: no estimate, no advice, no moved radio. */
const NO_ADVICE = Object.freeze({
	hasEstimate: false,
	local: null,
	server: null,
	recommend: null,
	advice: null
});

/**
 * @param {object} input
 * @param {string} [input.method] - method key, any case (BGM / bgm both work)
 * @param {number} [input.sequences]
 * @param {number} [input.sites] - codon sites, as FILE_INFO reports them
 * @param {object} [input.methodOptions] - advanced options; some multiply the runtime
 * @param {boolean} [input.serverConnected] - a recommendation to use a server that is down is worse
 *   than none, so this gates the whole 'backend' branch
 * @returns {{hasEstimate: boolean, local: object|null, server: object|null,
 *   recommend: 'backend'|null, advice: string|null}}
 */
export function executionAdvice({
	method,
	sequences,
	sites,
	methodOptions = {},
	serverConnected = false
} = {}) {
	if (!method || !(sequences > 0) || !(sites > 0)) return NO_ADVICE;

	const local = calculateRuntimeEstimate(method, sequences, sites, 'wasm', methodOptions);
	// `minutes === null` is how timingEstimates.js reports "no equation for this method". It is not a
	// zero and must not be treated as a fast run.
	if (local.minutes === null) return NO_ADVICE;

	const server = calculateRuntimeEstimate(method, sequences, sites, 'backend', methodOptions);

	if (!SLOW_CATEGORIES.has(local.category)) {
		// Both estimates are still returned: the radio sub-labels state each mode's duration whether or
		// not there is anything to advise.
		return { hasEstimate: true, local, server, recommend: null, advice: null };
	}

	if (serverConnected) {
		// The comparison, and nothing about which radio is selected. Whether the recommendation is
		// actually in effect is the component's business — the user may have clicked Local since, and a
		// sentence claiming "the server is selected" would then be a lie printed next to a Local radio.
		return {
			hasEstimate: true,
			local,
			server,
			recommend: 'backend',
			advice: `${local.description} in this browser vs ${server.description} on the server.`
		};
	}

	// No server to send it to, so no recommendation — only the consequence the user is about to
	// accept. "The tab must stay open" is the fact that costs people work: a local run dies with the
	// page (analyses.js:672-741).
	return {
		hasEstimate: true,
		local,
		server,
		recommend: null,
		advice: `This will take ${local.description} and the tab must stay open.`
	};
}
