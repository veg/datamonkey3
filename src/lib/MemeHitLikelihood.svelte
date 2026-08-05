<!-- src/lib/MemeHitLikelihood.svelte -->
<!--
  MEME hit-likelihood row. For a MEME submission it estimates whether a full MEME run would report
  any selected site, and — when the answer is "probably not" — says what to do instead.

  Designed as a ROW inside RunOutlook, which owns the surrounding chrome: this used to be a second
  coloured box stacked on top of the runtime estimate, in the same palette, competing for the same
  glance.

  Three rules this component follows:
    1. It never blocks a run and never uses vocabulary that implies it could. It is an estimate of
       an OUTCOME, not a verdict on the user's data.
    2. It never renders a bare number. The headline is a coarse level; the probability, the features
       it was computed from, the thresholds and the caveats live one click away, together.
    3. It never renders blank space to mean two different things. Every state the estimator can
       reach has copy — see the four STATUS values in services/prescreen/hitLikelihood.js.

  Nothing here is loaded for a non-MEME method: RunOutlook only mounts the component when
  hasHitLikelihood(method), and the ~37 KB coefficient chunk is fetched on first score.
-->
<script>
	import { createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	// Barrel import, like every other component here. The deep-subpath form
	// (lucide-svelte/icons/signal) was the only one in the codebase, and because this component is
	// dynamically imported those four subpaths were node_modules deps the dev server never saw at
	// startup. Touching them mid-session triggered a Vite dependency re-optimization and a full page
	// reload, which dropped the selected file and left this row unmountable. The barrel is already
	// in the eager graph, so nothing new is discovered here; production output is tree-shaken either way.
	import { Signal, HelpCircle, AlertTriangle, Loader2 } from 'lucide-svelte';
	import {
		hasHitLikelihood,
		loadHitLikelihoodModel,
		estimateHitLikelihood,
		hitLikelihoodError,
		STATUS,
		MODEL_BASIS,
		LIVE_FEATURES,
		LIKELY_MIN,
		UNLIKELY_MAX
	} from './services/prescreen/hitLikelihood.js';

	// Props
	export let method = null;
	export let alignment = '';
	export let tree = '';
	/** 'user' | 'nj' | 'unknown' — decides which branch-length caveat applies. */
	export let treeSource = 'unknown';

	const dispatch = createEventDispatcher();

	let result = null; // an estimate object (never a bare null once we have run), see hitLikelihood.js
	let computing = false;
	let model = null;
	let showBasis = false;

	// Level -> how it is drawn and how it is said. Muted on purpose: this is one advisory line in a
	// panel, not an alarm, and a red box above the Run button reads as a refusal.
	//
	// One glyph for all three levels, tinted. The signal-high/medium/low triad was ordinal but not
	// legible: lucide draws only the ACTIVE bars, so signal-low is a single 3px mark that reads as
	// a smudge next to the runtime row's icon, and a gauge that renders at three different visual
	// weights implies the estimate resolves finer than the three buckets it actually has. Colour
	// plus the words on the right carry the level; the icon only has to be findable.
	const LEVEL = {
		likely: { color: 'text-emerald-700', value: 'Likely to report a site' },
		uncertain: { color: 'text-amber-700', value: 'Could go either way' },
		unlikely: { color: 'text-text-slate', value: 'Unlikely to report a site' }
	};

	// Only recompute when something that feeds the estimate changes. `seq` makes a late response
	// from a superseded input drop out instead of overwriting a newer one.
	let seq = 0;
	$: if (browser) estimate(method, alignment, tree, treeSource);

	async function estimate(m, aln, tr, src) {
		const mine = ++seq;
		if (!hasHitLikelihood(m)) {
			result = null;
			computing = false;
			return;
		}
		computing = true;
		try {
			// Loaded here rather than in onMount so the coefficients are fetched only for the method
			// that has an estimate — every other method used to pay for a model it never rendered.
			if (!model) model = await loadHitLikelihoodModel();
		} catch (e) {
			console.error('MEME hit-likelihood model failed to load:', e);
			if (mine === seq) {
				result = hitLikelihoodError('The hit-likelihood estimator could not be loaded.');
				computing = false;
			}
			return;
		}
		// estimateHitLikelihood does not throw: failures come back as status 'error'.
		const next = await estimateHitLikelihood({
			method: m,
			alignment: aln,
			tree: tr,
			treeSource: src,
			model
		});
		if (mine !== seq) return;
		result = next;
		computing = false;
	}

	$: applicable = hasHitLikelihood(method);
	$: shown = result && result.status !== STATUS.NOT_APPLICABLE ? result : null;
	$: style = shown && shown.level ? LEVEL[shown.level] : null;
	$: percent =
		shown && shown.hit_probability !== null ? `${(shown.hit_probability * 100).toFixed(0)}%` : null;
	$: featureLine = shown && shown.num_seqs !== null ? describeFeatures(shown) : null;

	function describeFeatures(r) {
		// "codon sites", not "codons": the runtime row directly below counts the same quantity and
		// calls it "sites", and two words for one number four lines apart reads as two numbers.
		const parts = [`${r.num_seqs} sequences`, `${r.num_sites} codon sites`];
		if (r.median_pos_dist !== null && r.median_pos_dist > 0) {
			parts.push(`median branch length ${Number(r.median_pos_dist.toPrecision(3))} subs/site`);
		}
		return parts.join(' · ');
	}

	function act(action) {
		if (!action) return;
		if (action.kind === 'switch-method') dispatch('selectMethod', { method: action.method });
	}
</script>

{#if applicable}
	<div
		class="hit-likelihood"
		data-testid="meme-hit-likelihood"
		data-status={shown ? shown.status : 'pending'}
		data-level={shown && shown.level ? shown.level : ''}
		data-tree-source={shown && shown.tree_source ? shown.tree_source : ''}
	>
		<div class="hit-header">
			{#if !shown}
				<span class="hit-icon text-gray-400"><Loader2 class="h-4 w-4 animate-spin" /></span>
				<span class="hit-label text-text-slate">MEME outcome</span>
				<span class="hit-value text-gray-500">estimating…</span>
			{:else if shown.status === STATUS.OK}
				<span class="hit-icon {style.color}"><Signal class="h-4 w-4" /></span>
				<span class="hit-label text-text-slate">MEME outcome</span>
				<span class="hit-value {style.color}">{style.value}</span>
			{:else if shown.status === STATUS.CANNOT_ASSESS}
				<span class="hit-icon text-gray-500"><HelpCircle class="h-4 w-4" /></span>
				<span class="hit-label text-text-slate">MEME outcome</span>
				<span class="hit-value text-gray-600">No estimate</span>
			{:else}
				<span class="hit-icon text-amber-600"><AlertTriangle class="h-4 w-4" /></span>
				<span class="hit-label text-text-slate">MEME outcome</span>
				<span class="hit-value text-amber-700">Estimate unavailable</span>
			{/if}
		</div>

		<div class="hit-body">
			{#if shown && shown.status !== STATUS.OK}
				<!-- Why there is no number. Blank space here used to mean "not applicable", "out of
				     range" and "the estimator crashed" all at once. -->
				<p class="hit-detail">{shown.detail}</p>
			{/if}

			{#if shown && shown.recommendation}
				<p class="hit-detail">{shown.recommendation.message}</p>
				{#if shown.recommendation.action}
					<button
						type="button"
						class="hit-action"
						data-testid="hit-likelihood-action"
						on:click={() => act(shown.recommendation.action)}
					>
						{shown.recommendation.action.label}
					</button>
				{/if}
				{#each shown.recommendation.secondary || [] as alt}
					<p class="hit-detail hit-secondary">
						{alt.message}
						{#if alt.action && alt.action.kind === 'switch-method'}
							<button
								type="button"
								class="hit-action hit-action-inline"
								on:click={() => act(alt.action)}
							>
								{alt.action.label}
							</button>
						{/if}
					</p>
				{/each}
			{/if}

			{#if shown}
				<!-- The claim is falsifiable, so what produced it has to be reachable from where it is
				     made. Collapsed rather than omitted: it is four lines of provenance, not a footnote. -->
				<button
					type="button"
					class="hit-basis-toggle"
					aria-expanded={showBasis}
					data-testid="hit-likelihood-basis-toggle"
					on:click={() => (showBasis = !showBasis)}
				>
					{showBasis ? 'Hide' : 'How this is estimated'}
				</button>
				{#if showBasis}
					<div class="hit-basis" data-testid="hit-likelihood-basis">
						<!-- What the number is NOT is the thing most likely to be misread, so it leads and it
						     is the only line given emphasis. Everything below it is provenance, and the
						     limits are split out rather than buried at the tail of a long sentence. -->
						<p class="hit-basis-lead">{shown.caveat}</p>
						{#if featureLine}
							<p><span class="hit-basis-key">Read from your data</span> {featureLine}.</p>
						{/if}
						<p><span class="hit-basis-key">How it was built</span> {MODEL_BASIS}</p>
						{#if percent}
							<p>
								<span class="hit-basis-key">Estimated probability</span>
								{percent}, bucketed at the upstream defaults — likely at {Math.round(
									LIKELY_MIN * 100
								)}% and above, unlikely below {Math.round(UNLIKELY_MAX * 100)}%.
							</p>
							<p>
								<span class="hit-basis-key">Read it as a bucket, not a number</span> the model is a
								step function of {LIVE_FEATURES.length} inputs, so two similar alignments can land on
								opposite sides of a threshold.
							</p>
						{/if}
						{#if shown.tree_source_caveat}
							<p><span class="hit-basis-key">Branch lengths</span> {shown.tree_source_caveat}</p>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.hit-likelihood {
		font-size: 13px;
	}

	.hit-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.hit-label {
		font-weight: 500;
	}

	.hit-value {
		font-weight: 600;
		margin-left: auto;
		text-align: right;
	}

	/* The panel sits above the Run button, so the row keeps room for its copy from the first frame
	   instead of pushing the button down once the estimate resolves. */
	.hit-body {
		padding-left: 22px; /* Align with text after icon, as in AnalysisTimingEstimate */
		min-height: 18px;
	}

	.hit-detail {
		color: #64748b;
		font-size: 12px;
		line-height: 1.45;
		margin: 0 0 4px 0;
	}

	.hit-secondary {
		color: #94a3b8;
	}

	.hit-action {
		font-size: 11px;
		font-weight: 600;
		color: #1d4ed8;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}

	.hit-action:hover {
		color: #1e40af;
	}

	.hit-action-inline {
		margin-left: 2px;
	}

	.hit-basis-toggle {
		font-size: 11px;
		color: #64748b;
		background: none;
		border: none;
		padding: 0;
		margin-top: 2px;
		cursor: pointer;
		text-decoration: underline dotted;
	}

	.hit-basis-toggle:hover {
		color: #475569;
	}

	.hit-basis {
		margin-top: 4px;
		border-left: 2px solid #e2e8f0;
		padding-left: 8px;
	}

	.hit-basis p {
		color: #64748b;
		font-size: 11px;
		line-height: 1.5;
		margin: 0 0 4px 0;
	}

	/* The scope line: what this estimate is not. Darker than the provenance beneath it. */
	.hit-basis-lead {
		color: #475569;
		font-weight: 500;
		margin-bottom: 6px !important;
	}

	/* Turns four undifferentiated paragraphs into scannable rows. */
	.hit-basis-key {
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 9px;
		font-weight: 600;
		margin-right: 4px;
	}
</style>
