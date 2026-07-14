// Sentry disabled on server-side for Cloudflare Workers compatibility
// Client-side Sentry still works via hooks.client.ts
import type { Handle, HandleServerError } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	return resolve(event);
};

export const handleError: HandleServerError = async ({ error, event }) => {
	console.error('Server error:', error);
	return {
		message: 'Internal server error'
	};
};
