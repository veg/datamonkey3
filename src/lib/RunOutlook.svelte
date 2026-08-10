<!-- src/lib/RunOutlook.svelte -->
<!--
  "Before you run" panel: one box holding everything we can say about a submission before it is
  submitted. One row per dimension — how long the run will take, and (MEME only) whether it is
  likely to report anything.

  These were previously two separate bordered boxes stacked directly on top of each other, both
  drawing a coloured icon, a bold label, a right-pinned value and a muted detail line, in the same
  palette. Two boxes in one palette read as two competing verdicts; one panel with labelled rows
  reads as one summary. The panel owns the border and background; the rows are chromeless
  (AnalysisTimingEstimate variant="row").
-->
<script>
	import AnalysisTimingEstimate from './AnalysisTimingEstimate.svelte';
	import { hasHitLikelihood } from './services/prescreen/scope.js';

	// Props — the timing row's inputs, plus the alignment/tree the MEME estimate needs.
	export let method = null;
	export let methodOptions = {};
	export let geneticCode = 'Universal';
	export let executionMode = 'backend'; // 'backend' or 'wasm'
	export let alignment = '';
	export let tree = '';
	/** 'user' | 'nj' | 'unknown' — an inferred tree's branch lengths carry a caveat. */
	export let treeSource = 'unknown';

	// The hit-likelihood row is mounted ONLY for the method it is calibrated for, and imported
	// dynamically so the estimator's modules and its model file (~735 KB, ~169 KB gzipped: XGBoost's
	// own JSON, read as-is with no conversion step) are fetched only when there is something to
	// estimate. Mounting it everywhere — and eagerly loading a model in its onMount — is what made
	// all ~15 methods pay for a badge that would never render, and the model got 40x bigger when the
	// converter was deleted, so the gate matters more now, not less. hasHitLikelihood comes from an
	// import-free leaf module so this decision costs nothing: this gate, not the render inside the
	// component, is what keeps a non-MEME method at zero bytes.
	//
	// The gate is necessary but was NOT sufficient. A dynamic import() keeps JS lazy and does not
	// keep CSS lazy: SvelteKit puts a dynamically-imported component's stylesheet into this route's
	// own stylesheet list so it cannot flash unstyled, so MemeHitLikelihood's `style` block was
	// arriving as a render-blocking <link> for every visitor and every method in the production
	// build. Its CSS is now a string inside the lazy chunk — see MemeHitLikelihood.css, which
	// explains why, and do not move it back into a `style` block. e2e/18 asserts the invariant by
	// classifying response BODIES rather than URLs, so it holds against a production build too.
	$: showHitLikelihood = hasHitLikelihood(method);
</script>

{#if method}
	<div class="run-outlook" data-testid="run-outlook">
		<div class="outlook-title">Before you run</div>
		{#if showHitLikelihood}
			{#await import('./MemeHitLikelihood.svelte')}
				<!-- Hold the row's place while its chunk loads. The panel sits above the Run button, so
				     content arriving late must not move the button out from under the pointer. -->
				<div class="outlook-row outlook-row-pending" aria-hidden="true"></div>
			{:then module}
				<div class="outlook-row">
					<svelte:component this={module.default} {method} {alignment} {tree} {treeSource} />
				</div>
			{/await}
		{/if}
		<div class="outlook-row">
			<AnalysisTimingEstimate
				{method}
				{methodOptions}
				{geneticCode}
				{executionMode}
				variant="row"
			/>
		</div>
	</div>
{/if}

<style>
	.run-outlook {
		border: 1px solid #e2e8f0;
		background-color: #f8fafc;
		border-radius: 0.375rem;
		padding: 12px;
	}

	.outlook-title {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #94a3b8;
		margin-bottom: 8px;
	}

	/* Rows are separated by a rule rather than by their own borders, so the panel reads as one
	   object with two lines instead of two objects. */
	.outlook-row-pending {
		/* Matches the mounted row rather than guessing at it: MemeHitLikelihood's 23.5px header line
		   plus the body reserve it keeps for its copy, which is 97.5px below the layout's 1024px
		   breakpoint and 80px above it. MEASURED in the running app — the previous value was 5.5px
		   short of the real row, which is small but is exactly the kind of nudge that moves the Run
		   button out from under a pointer already travelling towards it. The panel sits above that
		   button, so neither the chunk arriving nor the estimate resolving a moment later may change
		   this height. Change these whenever MemeHitLikelihood's .hit-body reserve changes. */
		min-height: 121px;
	}

	@media (min-width: 1024px) {
		.outlook-row-pending {
			min-height: 103.5px;
		}
	}

	.outlook-row + .outlook-row {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid #e9eef5;
	}
</style>
