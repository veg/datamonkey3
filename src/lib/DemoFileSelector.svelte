<script>
	import { onMount } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import { Dna, Sparkles, ArrowRight } from 'lucide-svelte';
	import { trackEvent } from './utils/analytics.js';

	const dispatch = createEventDispatcher();

	// Sample files available for demo with enhanced metadata
	// Names are user-friendly to help new users understand what to expect
	const demoFiles = [
		{
			name: 'CD2-slim.fna',
			description: 'Quick Start Example',
			detail: '10 sequences • Fast results',
			path: '/test-data/CD2-slim.fna',
			size: 'small'
		},
		{
			name: 'small.nex',
			description: 'NEXUS with Tree',
			detail: 'Includes phylogenetic tree',
			path: '/test-data/small.nex',
			size: 'small'
		},
		{
			name: 'medium.nex',
			description: 'Standard Example',
			detail: 'Typical analysis size',
			path: '/test-data/medium.nex',
			size: 'medium'
		},
		{
			name: 'large.nex',
			description: 'Large Dataset',
			detail: 'For testing performance',
			path: '/test-data/large.nex',
			size: 'large'
		}
	];

	let hoveredFile = null;

	// Handle loading a demo file using the File System API
	async function loadDemoFile(filePath, fileName) {
		try {
			// Read file from test-data directory using fetch
			const demoFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
			const response = await fetch(demoFilePath);

			if (!response.ok) {
				throw new Error(`Failed to fetch demo file: ${response.status} ${response.statusText}`);
			}

			// Get the file content
			const content = await response.text();

			// Create a File object from the content
			const file = new File([content], fileName, { type: 'application/octet-stream' });

			// Add metadata to indicate this is a demo file
			const metadata = { isDemo: true, source: 'demoSelector' };

			// Track demo file load
			trackEvent('demo-file-loaded', { filename: fileName });

			// Dispatch the file to the parent component
			dispatch('selectFile', { file, metadata });
		} catch (error) {
			console.error('Error loading demo file:', error);
			dispatch('error', { message: `Failed to load demo file: ${error.message}` });
		}
	}
</script>

<div class="demo-selector">
	<!-- Section header with subtle styling -->
	<div class="mb-3 flex items-center gap-2 sm:mb-premium-md sm:gap-premium-sm">
		<div
			class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-whisper text-brand-royal sm:h-8 sm:w-8"
		>
			<Sparkles class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
		</div>
		<div class="min-w-0">
			<span class="text-sm font-semibold text-text-rich sm:text-premium-body">Try a sample file</span>
			<span class="hidden text-premium-meta text-text-silver sm:inline sm:ml-premium-sm"
				>— quick start with example data</span
			>
		</div>
	</div>

	<!-- Sample file cards with enhanced design -->
	<div class="grid grid-cols-2 gap-2 sm:gap-premium-md lg:grid-cols-4">
		{#each demoFiles as demoFile, index}
			<button
				class="sample-card group relative flex min-h-[120px] flex-col rounded-lg border-2 p-3 text-left transition-all duration-premium active:scale-[0.98] sm:min-h-0 sm:rounded-premium sm:p-premium-md
               {hoveredFile === demoFile.name
					? 'scale-[1.02] border-brand-royal bg-white shadow-premium-hover'
					: 'border-border-platinum bg-white hover:border-brand-muted hover:shadow-premium'}"
				style="animation-delay: {index * 50}ms"
				on:click={() => loadDemoFile(demoFile.path, demoFile.name)}
				on:mouseenter={() => (hoveredFile = demoFile.name)}
				on:mouseleave={() => (hoveredFile = null)}
			>
				<!-- File type indicator -->
				<div class="mb-2 flex items-start justify-between sm:mb-premium-sm">
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-premium sm:h-10 sm:w-10 sm:rounded-premium-sm
                      {hoveredFile === demoFile.name
							? 'bg-brand-royal text-white'
							: 'bg-brand-ghost text-brand-royal group-hover:bg-brand-whisper'}"
					>
						<Dna class="h-4 w-4 sm:h-5 sm:w-5" />
					</div>

					<!-- Size indicator badge -->
					<span
						class="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:px-premium-sm sm:text-premium-caption
                       {demoFile.size === 'small'
							? 'bg-green-100 text-green-700'
							: demoFile.size === 'medium'
								? 'bg-brand-whisper text-brand-royal'
								: 'bg-accent-cream text-accent-copper'}"
					>
						{demoFile.size}
					</span>
				</div>

				<!-- File info -->
				<div class="flex-1">
					<h4 class="mb-0.5 truncate font-mono text-xs font-semibold text-text-rich sm:mb-premium-xs sm:text-premium-body">
						{demoFile.name}
					</h4>
					<p class="text-[10px] text-text-slate sm:mb-premium-xs sm:text-premium-meta">
						{demoFile.description}
					</p>
					<p class="hidden text-premium-caption text-text-silver sm:block">
						{demoFile.detail}
					</p>
				</div>

				<!-- Action indicator - always visible on mobile -->
				<div
					class="mt-2 flex items-center justify-between border-t border-border-platinum pt-2 opacity-100 transition-opacity duration-premium sm:mt-premium-sm sm:pt-premium-sm sm:opacity-0 sm:group-hover:opacity-100"
				>
					<span class="text-[10px] font-medium text-brand-royal sm:text-premium-caption">Load file</span>
					<ArrowRight class="h-3 w-3 transform text-brand-royal transition-transform duration-premium group-hover:translate-x-1 sm:h-4 sm:w-4" />
				</div>
			</button>
		{/each}
	</div>
</div>

<style>
	.sample-card {
		animation: fade-in-up 0.4s ease-out backwards;
	}

	@keyframes fade-in-up {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
