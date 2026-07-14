// Environment configuration
// For iframe embed URLs - protocol-relative URL for better embedding across http/https contexts
export const PAGES_URL = import.meta.env.VITE_PAGES_URL || '//localhost:3000/pages';

// For direct links to hyphy-eye - protocol-relative URL for better embedding across http/https contexts
export const HYPHY_EYE_URL = import.meta.env.VITE_HYPHY_EYE_URL || '//vision.hyphy.org';

// For local development override - use proxy path to enable localStorage sharing
export const DEV_HYPHY_EYE_URL = import.meta.env.DEV ? '/hyphy-eye' : null;

// Final URL to use - prefers the env var, falls back to dev proxy URL in development, or production URL
export const FINAL_HYPHY_EYE_URL =
	import.meta.env.VITE_HYPHY_EYE_URL || DEV_HYPHY_EYE_URL || HYPHY_EYE_URL;

// When in production (or cloudflare), PAGES_URL will be '//responsive-iframe.hyphy-eye.pages.dev/pages'
// In development, it will be '//localhost:3000/pages'

// Datamonkey backend server configuration
export const DATAMONKEY_SERVER_URL =
	import.meta.env.VITE_DATAMONKEY_SERVER_URL || 'http://localhost:7015';
