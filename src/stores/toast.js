import { writable } from 'svelte/store';

function createToastStore() {
	const { subscribe, update } = writable([]);

	let toastId = 0;

	// Track auto-dismiss timer handles keyed by toast id so they can be
	// cleared when a toast is dismissed early (avoiding redundant timer fires).
	const timers = new Map();

	return {
		subscribe,

		/**
		 * Show a toast notification
		 * @param {string} message - The message to display
		 * @param {object} options - Toast options
		 * @param {'success'|'error'|'info'|'warning'} options.type - Toast type (default: 'info')
		 * @param {number} options.duration - Auto-dismiss duration in ms (default: 5000, 0 = no auto-dismiss)
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
			if (toast.duration > 0) {
				const handle = setTimeout(() => {
					this.dismiss(id);
				}, toast.duration);
				timers.set(id, handle);
			}

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
			return this.show(message, { ...options, type: 'error', duration: options.duration || 8000 });
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
			update((toasts) => toasts.filter((t) => t.id !== id));
		},

		/**
		 * Dismiss all toasts
		 */
		dismissAll() {
			for (const handle of timers.values()) {
				clearTimeout(handle);
			}
			timers.clear();
			update(() => []);
		}
	};
}

export const toastStore = createToastStore();
