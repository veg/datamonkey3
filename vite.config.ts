import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'fs';

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
	plugins: [sveltekit()],

	// Under vitest, resolve Svelte's BROWSER entry. Without the extra condition `mount()` comes from
	// svelte/index-server.js and every component render throws "mount(...) is not available on the
	// server" — which is why no test in this repo could mount a component until now. This is the
	// workaround the Svelte 5 testing docs prescribe; it is scoped to the test run so the dev server
	// and the production build resolve exactly as before.
	resolve: {
		dedupe: ['svelte'],
		...(process.env.VITEST ? { conditions: ['browser'] } : {})
	},

	test: {
		include: [
			'src/test/**/*.{test,spec}.{js,ts}',
			'src/lib/**/*.{test,spec}.{js,ts}',
			'src/stores/**/*.{test,spec}.{js,ts}'
		],
		exclude: [
			'node_modules/**',
			'**/node_modules/**',
			'src/test/*-backend.test.js', // Exclude backend integration tests
			'src/test/backend-*.test.js' // Exclude any other backend test patterns
		],
		environment: 'jsdom'
	},

	define: {
		global: 'globalThis',
		'process.env': {},
		__APP_VERSION__: JSON.stringify(packageJson.version)
	},

	server: {
		host: true,
		allowedHosts: ['v3.datamonkey.org'],
		fs: {
			allow: ['..']
		},
		// Increase WebSocket timeout to prevent timeout errors
		hmr: {
			timeout: 60000 // 60 seconds instead of default 30
		},
		// Proxy configuration for hyphy-eye localStorage integration
		proxy: {
			'/hyphy-eye': {
				target: 'http://127.0.0.1:3000',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/hyphy-eye/, ''),
				configure: (proxy, options) => {
					// Add logging for debugging
					proxy.on('proxyReq', (proxyReq, req, res) => {
						console.log('Proxying hyphy-eye request:', req.url);
					});
				}
			}
		}
	},

	preview: {
		host: true
	},

	// Optimize dependencies to prevent long processing times
	optimizeDeps: {
		include: ['@biowasm/aioli', 'toml', 'marked', 'socket.io-client'],
		// Exclude linked packages so changes are picked up immediately.
		//
		// hyphy-scope is deliberately NOT in this list even when linked via `npm link`. It pulls d3,
		// phylotree, circos and @observablehq/plot, and excluding it from pre-bundling makes the dev
		// server transform all of that on every request — enough to stall the page, which presents as
		// an analysis that never finishes rather than as a slow import. Pre-bundle it and pick up
		// library changes by rebuilding hyphy-scope and restarting dev (or `vite dev --force`).
		exclude: ['phylotree', 'alivibe']
	}
});
