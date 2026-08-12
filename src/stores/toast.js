import { writable } from 'svelte/store';

function createToastStore() {
	const { subscribe, update } = writable([]);

	let toastId = 0;

	// Track auto-dismiss timer handles keyed by toast id so they can be
	// cleared when a toast is dismissed early (avoiding redundant timer fires).
	const timers = new Map();

	// Remaining time for a paused toast, keyed by id. A toast the user is reading must not
	// vanish mid-sentence, so hovering or focusing it stops the clock; leaving resumes it with
	// whatever was left rather than restarting the full duration.
	const remaining = new Map();
	const deadlines = new Map();

	function arm(id, ms, dismiss) {
		if (!(ms > 0)) return;
		deadlines.set(id, Date.now() + ms);
		timers.set(
			id,
			setTimeout(() => dismiss(id), ms)
		);
	}

	return {
		subscribe,

		/**
		 * Show a toast notification
		 * @param {string} message - The message to display
		 * @param {object} options - Toast options
		 * @param {'success'|'error'|'info'|'warning'} options.type - Toast type (default: 'info')
		 * @param {number} options.duration - Auto-dismiss duration in ms (default: 5000, 0 = no auto-dismiss).
		 *   Errors default to 0 — see error().
		 * @param {string} options.action - Optional action button text
		 * @param {function} options.onAction - Optional callback when action is clicked
		 */
		show(message, options = {}) {
			const id = ++toastId;
			const toast = {
				id,
				message,
				type: options.type || 'info',
				duration: options.duration !== undefined ? options.duration : 5000,
				action: options.action || null,
				onAction: options.onAction || null,
				createdAt: Date.now()
			};

			update((toasts) => [...toasts, toast]);

			// Auto-dismiss after duration (if duration > 0)
			arm(id, toast.duration, (tid) => this.dismiss(tid));

			return id;
		},

		/**
		 * Show a success toast
		 */
		success(message, options = {}) {
			return this.show(message, { ...options, type: 'success' });
		},

		/**
		 * Show an error toast
		 */
		error(message, options = {}) {
			// Errors do not auto-dismiss. This used to be `options.duration || 8000`, which had two
			// problems: the 8s window routinely expired while the user was in another window or still
			// reading a multi-line validation message, and `||` coerced a caller-supplied 0 back to
			// 8000, so no caller could opt out even deliberately. `show()` already treats 0 as
			// no-auto-dismiss, and every toast has a dismiss button.
			return this.show(message, {
				...options,
				type: 'error',
				duration: options.duration !== undefined ? options.duration : 0
			});
		},

		/**
		 * Stop a toast's auto-dismiss clock, preserving how much time was left.
		 * No-op for toasts that never had one (duration 0) or are already paused.
		 */
		pause(id) {
			const handle = timers.get(id);
			if (handle === undefined) return;
			clearTimeout(handle);
			timers.delete(id);
			const left = (deadlines.get(id) ?? 0) - Date.now();
			remaining.set(id, Math.max(0, left));
		},

		/**
		 * Resume a paused toast with the time that was left when it was paused.
		 */
		resume(id) {
			if (!remaining.has(id)) return;
			const left = remaining.get(id);
			remaining.delete(id);
			arm(id, left, (tid) => this.dismiss(tid));
		},

		/**
		 * Show an info toast
		 */
		info(message, options = {}) {
			return this.show(message, { ...options, type: 'info' });
		},

		/**
		 * Show a warning toast
		 */
		warning(message, options = {}) {
			return this.show(message, { ...options, type: 'warning' });
		},

		/**
		 * Dismiss a specific toast by ID
		 */
		dismiss(id) {
			const handle = timers.get(id);
			if (handle !== undefined) {
				clearTimeout(handle);
				timers.delete(id);
			}
			remaining.delete(id);
			deadlines.delete(id);
			update((toasts) => toasts.filter((t) => t.id !== id));
		},

		/**
		 * Dismiss every toast matching a predicate.
		 *
		 * Exists because errors no longer auto-dismiss. That was the right call -- an 8-second window
		 * routinely expired while the user was reading, or in another window -- but it made something
		 * else the caller's job: a message describing one file must not outlive the moment the user
		 * moves to a different file. Nothing was doing that, so a validation error about file A hung
		 * over file B, which is the wrong-file class of bug this app has spent a lot of effort
		 * removing. See issue #205.
		 *
		 * @param {(toast: {id: number, type: string, message: string}) => boolean} predicate
		 */
		dismissWhere(predicate) {
			const doomed = [];
			const unsub = subscribe((toasts) => {
				for (const t of toasts) {
					try {
						if (predicate(t)) doomed.push(t.id);
					} catch {
						// A throwing predicate must not take out the toast system.
					}
				}
			});
			unsub();
			for (const id of doomed) this.dismiss(id);
			return doomed.length;
		},

		/**
		 * Dismiss all toasts
		 */
		dismissAll() {
			for (const handle of timers.values()) {
				clearTimeout(handle);
			}
			timers.clear();
			remaining.clear();
			deadlines.clear();
			update(() => []);
		}
	};
}

export const toastStore = createToastStore();
