import { mdsvex } from 'mdsvex';
import adapterNode from '@sveltejs/adapter-node';
import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: [vitePreprocess(), mdsvex()],

	kit: {
		// Use adapter-node for production server (BUILD_TARGET=node npm run build)
		// Use adapter-cloudflare for Cloudflare deployment (default)
		adapter: process.env.BUILD_TARGET === 'node' ? adapterNode() : adapterCloudflare(),

		// Configure any environment variables that need to be exposed to the client
		env: {
			publicPrefix: 'PUBLIC_'
		}
	},

	extensions: ['.svelte', '.svx']
};

export default config;
