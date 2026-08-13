/**
 * runStatusLine.js — what a single run's row says, at every moment of its life.
 *
 * Extracted from the component because the rules are the design, and the design is precise about
 * numbers that would otherwise drift: when a clock appears, when a run is called slow, and above all
 * what is NEVER shown. See design/03-run-feedback/.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the pre-run estimate is never printed beside the elapsed
 * clock. The fitted power law is R² ≈ 0.63 (timingEstimates.js:44-52) — good to a factor of two, not
 * to the minute. "02:13 elapsed, typically ~4 min" reads as a countdown the software cannot honour,
 * and a user who sees 4:30 against "~4 min" concludes something is wrong when nothing is. The
 * estimate is used ONLY to decide when the sentence changes.
 */

/** Runs that have stopped. */
const TERMINAL = new Set(['completed', 'error', 'cancelled', 'interrupted', 'connection_lost']);

/** Below this, show no clock at all — a timer at 0:03 invites watching it, and many local runs
 *  finish inside ten seconds. */
const CLOCK_AFTER_SECONDS = 10;

/** Multiple of the estimate at which a run stops being ordinary. At R² ≈ 0.63 a factor of two is
 *  routine spread, so anything below this would cry wolf on healthy runs. */
const LONGER_MULTIPLE = 2;

/** Multiple at which a run is worth interrupting the user about — past where a power-law tail still
 *  behaves like one. */
const MUCH_LONGER_MULTIPLE = 6;

/** Floor for the "much longer" state, so a 4-second FUBAR run does not raise a flag at 24 seconds. */
const MUCH_LONGER_FLOOR_SECONDS = 30 * 60;

/** m:ss, or h:mm:ss past an hour. */
export function formatElapsed(totalSeconds) {
	const s = Math.max(0, Math.floor(totalSeconds ?? 0));
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	const seconds = s % 60;
	const pad = (n) => String(n).padStart(2, '0');
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Where the run is executing, in terms of what it means for the user.
 *
 * Deliberately not "Local" / "Server". A reload kills a local run (analyses.js:672-741) and does not
 * kill a server one (:743-810) — "in this tab" carries that consequence, "Local" does not.
 */
export function locationLabel(executionMode) {
	return executionMode === 'backend' ? 'on the server' : 'in this tab';
}

/**
 * Build the row's parts.
 *
 * @param {object} run
 * @param {string} run.method
 * @param {string} run.status
 * @param {string} [run.executionMode]
 * @param {number} run.elapsedSeconds
 * @param {number} [run.estimateSeconds] - omit when no fitted equation exists for the method
 * @param {string} [run.error]
 * @returns {{label: string, detail: string, tone: 'running'|'slow'|'done'|'failed', clock: string|null, showDetails: boolean}}
 */
export function runStatusLine({
	method,
	status,
	executionMode,
	elapsedSeconds = 0,
	estimateSeconds,
	error
} = {}) {
	const label = String(method ?? 'Analysis').toUpperCase();
	const where = locationLabel(executionMode);
	const clock = formatElapsed(elapsedSeconds);

	if (status === 'completed') {
		// Elapsed as a fact. Not compared to the estimate: "finished in 3:41 (estimated 4:00)" invites
		// scoring a prediction that was never a promise.
		return { label, detail: `finished in ${clock}`, tone: 'done', clock: null, showDetails: false };
	}

	if (status === 'error') {
		// First line only. The rest is one click away rather than wrapped across the row.
		const first = String(error ?? '')
			.split('\n')[0]
			.trim();
		const detail = first ? `failed after ${clock} · ${first}` : `failed after ${clock}`;
		return { label, detail, tone: 'failed', clock: null, showDetails: Boolean(error) };
	}

	if (status === 'cancelled') {
		return {
			label,
			detail: `cancelled after ${clock}`,
			tone: 'done',
			clock: null,
			showDetails: false
		};
	}

	if (status === 'interrupted' || status === 'connection_lost') {
		const what = status === 'connection_lost' ? 'lost the server connection' : 'was interrupted';
		return {
			label,
			detail: `${what} after ${clock}`,
			tone: 'failed',
			clock: null,
			showDetails: false
		};
	}

	// --- still running ---

	// A server job that has been submitted but not started is QUEUED, not running. Saying "on the
	// server · running" for a job sitting in the scheduler is a lie, and the specific lie that makes a
	// slow queue look like a slow analysis — the user waits on a machine that has not begun.
	//
	// Only the backend gets this branch: a wasm run has no queue, so 'pending' there is genuinely the
	// first moments of execution.
	if (executionMode === 'backend' && (status === 'pending' || status === 'initializing')) {
		return {
			label,
			detail: 'queued on the server',
			tone: 'running',
			clock: elapsedSeconds < CLOCK_AFTER_SECONDS ? null : clock,
			showDetails: false
		};
	}

	if (elapsedSeconds < CLOCK_AFTER_SECONDS) {
		return {
			label,
			detail: `${where} · starting`,
			tone: 'running',
			clock: null,
			showDetails: false
		};
	}

	// No fitted equation for this method (PRIME, AxoMEME, B-STILL): report elapsed and say nothing
	// else, forever. Inventing a threshold from no data would be the dishonest option.
	if (!(estimateSeconds > 0)) {
		return { label, detail: `${where} · running`, tone: 'running', clock, showDetails: false };
	}

	const muchLongerAt = Math.max(MUCH_LONGER_MULTIPLE * estimateSeconds, MUCH_LONGER_FLOOR_SECONDS);
	if (elapsedSeconds > muchLongerAt) {
		return {
			label,
			detail: `${where} · much longer than most runs this size`,
			tone: 'slow',
			clock,
			showDetails: true
		};
	}

	if (elapsedSeconds > LONGER_MULTIPLE * estimateSeconds) {
		// Same weight, no icon, no colour escalation: this is information, not an alarm. Wording is
		// "than most runs this size", never "than expected" — the software never expected anything,
		// it fitted a curve.
		return {
			label,
			detail: `${where} · longer than most runs this size`,
			tone: 'running',
			clock,
			showDetails: false
		};
	}

	return { label, detail: `${where} · running`, tone: 'running', clock, showDetails: false };
}

export function isTerminal(status) {
	return TERMINAL.has(status);
}

export const RUN_STATUS_CONSTANTS = {
	CLOCK_AFTER_SECONDS,
	LONGER_MULTIPLE,
	MUCH_LONGER_MULTIPLE,
	MUCH_LONGER_FLOOR_SECONDS
};
