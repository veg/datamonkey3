<script>
	import { treeStore } from '../stores/tree';
	import { AlertTriangle, Info, ArrowRight } from 'lucide-svelte';

	// Props
	export let onGenerateClick = () => {};

	// Reactive variables
	$: hasAnyTree = $treeStore && ($treeStore.nj || $treeStore.usertree);
</script>

{#if !hasAnyTree}
	<div
		class="mb-premium-lg rounded-premium border border-accent-copper bg-accent-pearl p-premium-md"
	>
		<div class="flex items-start">
			<div class="mr-premium-md flex-shrink-0">
				<AlertTriangle class="h-6 w-6 text-accent-copper" />
			</div>
			<div class="flex-1">
				<h3 class="mb-premium-xs text-premium-title font-semibold text-text-rich">
					Phylogenetic Tree Required
				</h3>
				<p class="mb-premium-sm text-premium-body text-text-slate">
					A phylogenetic tree is required for evolutionary analysis. Please generate a tree before
					proceeding.
				</p>
				<div class="mb-premium-sm">
					<div
						class="flex items-center rounded-premium-sm border border-amber-200 bg-amber-50 p-premium-xs text-premium-caption text-amber-700"
					>
						<Info class="mr-1 h-4 w-4 flex-shrink-0" />
						<span>Note: Tree generation is currently simulated (development preview)</span>
					</div>
				</div>
				<button
					type="button"
					on:click={onGenerateClick}
					class="inline-flex transform items-center rounded-premium-sm bg-brand-gradient px-premium-md py-premium-sm text-premium-body font-medium text-white shadow-sm transition-all duration-premium hover:scale-[0.98] hover:bg-brand-deep hover:shadow active:scale-[0.96]"
				>
					<ArrowRight class="mr-premium-xs h-5 w-5" />
					Generate Tree Now
				</button>
			</div>
		</div>
	</div>
{/if}
