<script>
	import { ClipboardList, Layers, FileBarChart } from 'lucide-svelte';

	export let activeTab = 'data';
	export let onChange = (tabName) => {};
	export let showRunningIndicator = false;
</script>

<div class="mb-premium-xl">
	<div class="rounded-premium bg-brand-ghost p-premium-xs">
		<div class="flex border-b border-border-platinum">
			<button
				class="relative px-premium-xl py-premium-lg text-premium-brand font-semibold transition-all duration-premium"
				class:text-brand-royal={activeTab === 'data'}
				class:text-text-rich={activeTab !== 'data'}
				class:hover:text-brand-royal={activeTab !== 'data'}
				class:hover:bg-brand-whisper={activeTab !== 'data'}
				on:click={() => onChange('data')}
			>
				<span class="flex items-center">
					<ClipboardList class="mr-2 h-5 w-5" />
					Data
				</span>
				{#if activeTab === 'data'}
					<div class="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-copper"></div>
				{/if}
			</button>

			<button
				class="relative px-premium-xl py-premium-lg text-premium-brand font-semibold transition-all duration-premium"
				class:text-brand-royal={activeTab === 'analyze'}
				class:text-text-rich={activeTab !== 'analyze'}
				class:hover:text-brand-royal={activeTab !== 'analyze'}
				class:hover:bg-brand-whisper={activeTab !== 'analyze'}
				on:click={() => onChange('analyze')}
			>
				<span class="flex items-center">
					<Layers class="mr-2 h-5 w-5" />
					Analyze
				</span>
				{#if showRunningIndicator}
					<span
						class="ml-2 inline-flex animate-pulse-premium items-center rounded-premium-xl bg-brand-royal px-2.5 py-0.5 text-premium-caption font-semibold tracking-premium-badge text-white"
					>
						Running
					</span>
				{/if}
				{#if activeTab === 'analyze'}
					<div class="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-copper"></div>
				{/if}
			</button>

			<button
				class="relative px-premium-xl py-premium-lg text-premium-brand font-semibold transition-all duration-premium"
				class:text-brand-royal={activeTab === 'results'}
				class:text-text-rich={activeTab !== 'results'}
				class:hover:text-brand-royal={activeTab !== 'results'}
				class:hover:bg-brand-whisper={activeTab !== 'results'}
				on:click={() => onChange('results')}
			>
				<span class="flex items-center">
					<FileBarChart class="mr-2 h-5 w-5" />
					Results
				</span>
				{#if activeTab === 'results'}
					<div class="absolute bottom-0 left-0 right-0 h-[3px] bg-accent-copper"></div>
				{/if}
			</button>
		</div>
	</div>
</div>
