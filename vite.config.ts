import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { readFileSync } from 'fs';

// Read package.json to get version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
	plugins: [sveltekit()],

	resolve: {
		dedupe: ['svelte']
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
		environment: 'jsdom',
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'json-summary', 'lcov'],
			reportsDirectory: './coverage-unit',
			include: ['src/lib/**', 'src/stores/**'],
			exclude: [
				'src/**/*.{test,spec}.{js,ts}',
				'src/**/__tests__/**',
				'src/lib/icons/**',
				'**/*.d.ts'
			],
			// Ratchet: floors set just below the achieved levels so a regression
			// fails CI, but a small fluctuation doesn't flap. Raise these as
			// coverage improves (Phases 3+). The global `include` pulls in the
			// many untested .svelte components, which is why the statements/lines
			// floor is low — branches is the metric we actually invest in.
			thresholds: {
				branches: 60,
				// The runner + store logic we hardened in Phases 1-2 must stay high.
				'src/lib/services/BackendAnalysisRunner.js': { branches: 70, functions: 75 },
				'src/lib/services/HyPhyAnalysisRunner.js': { branches: 90 },
				'src/stores/analyses.js': { statements: 80, functions: 78, branches: 65 }
			}
		}
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
		// Exclude linked packages so changes are picked up immediately
		exclude: ['phylotree', 'alivibe']
	}
});
