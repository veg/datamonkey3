<script>
	/**
	 * AxomemeResults — DataMonkey's wrapper around hyphy-scope's AxoMEME visualization.
	 *
	 * THE SPLIT. The plots and the per-site table live in hyphy-scope, because they are a property of
	 * the ANALYSIS and every consumer of AxoMEME output wants them. What stays here is the part that is
	 * a property of THIS APPLICATION: what DataMonkey did to the user's data before the model saw it.
	 *
	 * That distinction is not bookkeeping. DM3's own neighbour-joining inference emits negative branch
	 * lengths, sequences absent from the tree are silently dropped, and taxa past the 512 cap are
	 * subsampled — none of which is visible in a per-site score, all of which changes it. hyphy-scope
	 * has no business knowing about NJ.bf, and a user reading these numbers has every business knowing
	 * their tree was altered.
	 */
	import { TriangleAlert } from 'lucide-svelte';
	import { AxomemeVisualization } from 'hyphy-scope';

	export let data = null;

	$: summary = data?.summary ?? {};
	// Only worth interrupting the reader for. Sequences dropped, taxa repeated, a tree negative beyond
	// float noise, or branch-length problems the sanitiser judged worth reporting.
	$: hasCaveats =
		summary.speciesUsed !== summary.speciesInAlignment ||
		summary.treeWarnings?.length > 0 ||
		summary.duplicateSelections > 0 ||
		summary.mostNegativeDistance < -0.001;
</script>

{#if data}
	<div class="axomeme-results">
		{#if hasCaveats}
			<div class="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
				<div class="mb-1 flex items-center gap-2 font-semibold text-amber-800">
					<TriangleAlert class="h-4 w-4" />
					What the model was given
				</div>
				<ul class="list-inside list-disc space-y-1 text-amber-900">
					{#if summary.speciesUsed !== summary.speciesInAlignment}
						<li>
							{summary.speciesUsed} of {summary.speciesInAlignment} sequences were used — the rest
							were not found in the tree{summary.speciesUsed === 512
								? ', or fell outside the 512-taxon limit'
								: ''}.
						</li>
					{/if}
					{#if summary.duplicateSelections > 0}
						<li>
							{summary.duplicateSelections} taxon slots repeated the same sequence, which happens when
							a tree carries no usable branch lengths.
						</li>
					{/if}
					{#if summary.mostNegativeDistance < -0.001}
						<li>
							The tree contains negative branch lengths — the most negative pairwise distance was
							{summary.mostNegativeDistance.toFixed(4)}. Those distances were treated as zero, which
							is what the model was trained on, but a tree this far negative is worth checking.
						</li>
					{/if}
					{#each summary.treeWarnings ?? [] as warning}
						<li>{warning}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<AxomemeVisualization {data} />
	</div>
{/if}
