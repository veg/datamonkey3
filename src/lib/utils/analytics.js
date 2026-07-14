import { browser } from '$app/environment';

/**
 * Track an event with Umami analytics (if enabled)
 * Events only fire when the Umami script is loaded via PUBLIC_UMAMI_* env vars
 *
 * @param {string} eventName - Name of the event to track
 * @param {object} eventData - Optional data to include with the event
 */
export function trackEvent(eventName, eventData = {}) {
	if (browser && typeof window.umami !== 'undefined') {
		window.umami.track(eventName, eventData);
	}
}
