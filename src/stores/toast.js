import { writable } from 'svelte/store';

function createToastStore() {
	const { subscribe, update } = writable([]);

	let toastId = 0;

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
				setTimeout(() => {
					this.dismiss(id);
				}, toast.duration);
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
			update((toasts) => toasts.filter((t) => t.id !== id));
		},

		/**
		 * Dismiss all toasts
		 */
		dismissAll() {
			update(() => []);
		}
	};
}

export const toastStore = createToastStore();
