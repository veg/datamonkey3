<!-- src/lib/MemeHitLikelihood.svelte -->
<!--
  MEME hit-likelihood row. For a MEME submission it estimates whether a full MEME run would report
  any selected site, and — when the answer is "rarely" — says what about the data would change that.

  Designed as a ROW inside RunOutlook, which owns the surrounding chrome: this used to be a second
  coloured box stacked on top of the runtime estimate, in the same palette, competing for the same
  glance.

  Four rules this component follows:
    1. It never blocks a run and never uses vocabulary that implies it could. It is an estimate of
       an OUTCOME, not a verdict on the user's data.
    2. The headline is a band, and the underlying score is never rendered at all. Three bands are
       what 5,982 outcomes establish; a per-alignment percentage would advertise a resolution this
       estimate does not have, and it would invite reading a rate over a population as a probability
       about one alignment. What the disclosure shows instead is the BAND's own track record — how
       many of the runs that landed in it had MEME report a site — which is a number about the
       corpus, phrased as one.
    3. Every band states the OTHER side of its own rate, and the population rate, in the same
       breath. Nothing here may leave a reader to invert a fraction: "rarely" is spelled out as
       "about 1 in 20 did, the other 19 did not". The panel states each band's own rate once and
       read as a comparison against nothing.
    4. It never renders blank space to mean two different things. Five states, all of them with
       copy: loading, no alignment yet, an estimate, cannot-assess, and estimator error — see the
       four STATUS values in services/prescreen/hitLikelihood.js plus this component's own pending
       state.

  WHY THE LOW BAND IS ALLOWED TO SAY "RARELY". The band fires below a score of 0.10, and on the
  5,982 production MEME runs the model never trained on, 6 of the 111 alignments that landed there
  had MEME report a site at p <= 0.1 — 5.4%, 95% CI [2.0%, 11.4%], and only 1 of 111 at p <= 0.05.
  That is what makes the word defensible; at the 0.30 cut the ML package proposed it would have been
  28.6%, i.e. wrong for more than one user in four. The copy still may not say "will find nothing"
  or "not worth running": 1 in 20 is small, not zero, and the runs are cheap.

  Nothing here is loaded for a non-MEME method: RunOutlook only mounts the component when
  hasHitLikelihood(method), and the model file (~735 KB, ~169 KB gzipped — XGBoost's own JSON, read
  with no conversion step) is fetched on first score. That includes this component's CSS, which is
  imported as a string and injected below rather than living in a `style` block — see
  MemeHitLikelihood.css for why a `style` block here is NOT lazy in a production build.
-->
<script>
	import { browser } from '$app/environment';
	// Barrel import, like every other component here. The deep-subpath form
	// (lucide-svelte/icons/signal) was the only one in the codebase, and because this component is
	// dynamically imported those four subpaths were node_modules deps the dev server never saw at
	// startup. Touching them mid-session triggered a Vite dependency re-optimization and a full page
	// reload, which dropped the selected file and left this row unmountable. The barrel is already
	// in the eager graph, so nothing new is discovered here; production output is tree-shaken either way.
	import { Signal, HelpCircle, AlertTriangle, Loader2 } from 'lucide-svelte';
	/**
	 * This row's CSS, as a STRING, injected below — see MemeHitLikelihood.css for the full reason.
	 *
	 * Short version: a component `style` block here does not stay lazy. SvelteKit puts the CSS of a
	 * dynamically-imported component into the ROUTE's stylesheet list so it cannot flash unstyled,
	 * which makes it an unconditional `<link rel="stylesheet">` in the served HTML — fetched on every
	 * page load, before a method is chosen, and therefore for FEL and the ~14 other estimate-less
	 * methods. Measured at 1,233 B raw / 363 B brotli. `?inline` keeps the text inside this
	 * component's own lazily-imported chunk instead, so the byte count for a non-MEME method is zero
	 * rather than nearly zero.
	 */
	import styleText from './MemeHitLikelihood.css?inline';
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

	// Injected at component-init time, i.e. the moment this chunk is imported, which is before the
	// row's DOM exists — so there is no unstyled frame. Idempotent by id: mounting the row again
	// (switching to FEL and back) must not append a second copy.
	const STYLE_ID = 'meme-hit-likelihood-css';
	if (browser && !document.getElementById(STYLE_ID)) {
		const el = document.createElement('style');
		el.id = STYLE_ID;
		el.textContent = styleText;
		document.head.appendChild(el);
	}

	let result = null; // an estimate object (never a bare null once we have run), see hitLikelihood.js
	let computing = false;
	let model = null;
	let showBasis = false;

	// Level -> how it is drawn, what it is called, and the sentences that go under it. Muted on
	// purpose: this is one advisory line in a panel, not an alarm, and a red box above the Run
	// button reads as a refusal.
	//
	// One glyph for all three levels, tinted. The signal-high/medium/low triad was ordinal but not
	// legible: lucide draws only the ACTIVE bars, so signal-low is a single 3px mark that reads as
	// a smudge next to the runtime row's icon, and a gauge that renders at three different visual
	// weights implies the estimate resolves finer than the three buckets it actually has. Colour
	// plus the words on the right carry the level; the icon only has to be findable.
	//
	// EVERY RATE BELOW IS AN OBSERVED HISTORICAL FREQUENCY over the 5,982 production MEME runs this
	// model never trained on, against an 84.79% base rate. Label = MEME reported at least one site at
	// p <= 0.1. Out of sample the three bands run 5.4% / 51.9% / 92.6% and fire on 1.86% / 15.16% /
	// 82.98% of submissions (Clopper-Pearson 95% CIs: [2.0, 11.4] / [48.6, 55.2] / [91.8, 93.3]).
	// They are stable: splitting those runs into quarters by submit time, the low band runs
	// 7.1 / 9.1 / 6.3 / 2.2% and the high band 92.4 / 92.2 / 94.4 / 91.2%.
	//
	// `lead` is mandatory and above the fold, never behind the disclosure: it is what stops a
	// three-word band name being read as a verdict. `bandRate` is the same claim with the counts
	// behind it, and lives in the disclosure because n and the confidence interval are what a
	// sceptical reader wants and nobody else does.
	const LEVEL = {
		likely: {
			color: 'text-emerald-700',
			value: 'Likely to report a site',
			// States its own rate and stops. How that rate compares to MEME's overall hit rate is a
			// claim about the corpus rather than about this alignment, and it is not the estimate's
			// to make — the lift check in the test suite still holds the band to beating it.
			lead: 'About 93% of alignments scoring this high had MEME report at least one site (p ≤ 0.1).',
			bandRate:
				'4,595 of the 4,964 runs that landed in this band — 93% — had MEME report at least one site at p ≤ 0.1, and 85% of them did at the stricter p ≤ 0.05.'
		},
		uncertain: {
			color: 'text-amber-700',
			value: 'Could go either way',
			lead: 'Alignments scoring in this range split about evenly — 52% had MEME report at least one site (p ≤ 0.1).',
			bandRate:
				'471 of the 907 runs that landed in this band — 52% — had MEME report at least one site at p ≤ 0.1, falling to 35% at the stricter p ≤ 0.05. The interval around that 52% is [49%, 55%], so "about half" is the whole of what this band says.'
		},
		unlikely: {
			color: 'text-text-slate',
			value: 'Rarely reports a site',
			lead: 'About 1 in 20 alignments scoring this low had MEME report even one site (p ≤ 0.1) — the other 19 reported none. A caution, not a reason to skip the run.',
			// Only the low band gets this. It is the band a user acts on, and it fires on 1.9% of real
			// submissions — worth saying, because "rare" is part of what the badge means. "Fewer than 3
			// in 100" rather than the tighter "fewer than 2": 1.86% is the out-of-sample figure, and the
			// same band is 1.96% over every run on record and 2.17% on the training rows.
			rarity:
				'Fewer than 3 in 100 submissions score this low, and they are typically tiny — a median of 4 sequences and about 140 codons.',
			bandRate:
				'6 of the 111 runs that landed in this band — 5% — had MEME report at least one site at p ≤ 0.1, and only 1 of the 111 did at p ≤ 0.05. With 111 runs the true rate could be as high as about 1 in 9, so read this as "rarely", not as "never"; the six that did report found one or two sites each.'
		}
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
			// Loaded here rather than in onMount so the model file is fetched only for the method that
			// has an estimate — every other method used to pay for a model it never rendered.
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
	// `!computing` is load-bearing. `seq` stops a superseded RESPONSE overwriting a newer one, but it
	// does not clear what is on screen while the new one is in flight — so selecting a second
	// alignment kept rendering the first one's band, and its "about 93%" sentence, against data that
	// had nothing to do with it. `computing` was assigned in three places and read in none; this is
	// where it earns its keep, by letting the pending branch fire.
	$: shown = result && !computing && result.status !== STATUS.NOT_APPLICABLE ? result : null;
	// MEME is selected but there is nothing to score yet. Split out from `shown` because it is not a
	// failure and must not be drawn as one — and split out from the pending state because it is not
	// transient. It is reachable: a rejected upload leaves the method dropdown on screen with no
	// alignment behind it, and this row then spun "estimating…" for as long as the page was open.
	$: idle = result && !computing && result.status === STATUS.NOT_APPLICABLE ? result : null;
	$: style = shown && shown.level ? LEVEL[shown.level] : null;
	$: detailText = shown && shown.status !== STATUS.OK ? joinDetail(shown) : null;
	$: featureLine = shown && shown.num_seqs !== null ? describeFeatures(shown) : null;
	// Rendered rather than hard-coded so the disclosure cannot drift from the cuts the levels are
	// actually assigned at (levelOf() in hitLikelihoodModel.js reads the same two constants).
	$: unlikelyPct = Math.round(UNLIKELY_MAX * 100);
	$: likelyPct = Math.round(LIKELY_MIN * 100);

	function describeFeatures(r) {
		// "codon sites", not "codons": the runtime row directly below counts the same quantity and
		// calls it "sites", and two words for one number four lines apart reads as two numbers.
		const parts = [`${r.num_seqs} sequences`, `${r.num_sites} codon sites`];
		if (r.median_pos_dist !== null && r.median_pos_dist > 0) {
			parts.push(`median branch length ${Number(r.median_pos_dist.toPrecision(3))} subs/site`);
		}
		return parts.join(' · ');
	}

	function joinDetail(r) {
		return [r.detail, detailNoteFor(r)].filter(Boolean).join(' ');
	}

	/**
	 * The second sentence of a no-estimate state. It lives here rather than in the service layer
	 * because each one is about what the PANEL is doing, not about the input: the service can say
	 * which feature it could not use, but only the panel knows that its silence sits directly above
	 * the Run button and will be read as a warning unless it says otherwise.
	 */
	function detailNoteFor(r) {
		if (r.status === STATUS.ERROR) {
			return 'This does not affect your run — MEME will submit normally.';
		}
		if (r.reason === 'no-branch-lengths') {
			return `Branch lengths are one of the ${LIVE_FEATURES.length} inputs, so there is no estimate without them.`;
		}
		const reasons = (r.domain && r.domain.reasons) || [];
		// A large alignment going quiet must not read as a red flag — large alignments are the ones
		// MEME does best on. Unreachable today: v2's guard is an input-validity check with no upper
		// bound on sequences or codons (FEATURE_DOMAIN), and the one remaining above-max is the
		// median-branch-length units check, which is a real diagnosis and keeps its own message.
		// Kept for the same reason aboveMessage() keeps its unreachable branches — the case is
		// unreachable because of the DATA, not because the code forgot it.
		if (
			reasons.length > 0 &&
			reasons.every((x) => x.code === 'above-max' && x.feature !== 'median_pos_dist')
		) {
			return 'Nothing is wrong with the alignment — it is simply larger than the runs this estimate was fitted on.';
		}
		return null;
	}
</script>

{#if applicable}
	<div
		class="hit-likelihood"
		data-testid="meme-hit-likelihood"
		data-status={shown ? shown.status : idle ? idle.status : 'pending'}
		data-level={shown && shown.level ? shown.level : ''}
		data-tree-source={shown && shown.tree_source ? shown.tree_source : ''}
	>
		<div class="hit-header">
			{#if idle}
				<span class="hit-icon text-gray-400"><HelpCircle class="h-4 w-4" /></span>
				<span class="hit-label text-text-slate">MEME outcome</span>
				<span class="hit-value text-gray-600">No estimate yet</span>
			{:else if !shown}
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
			{#if idle}
				<!-- Not an error and not a wait: there is simply no alignment behind the method yet. -->
				<p class="hit-detail" data-testid="hit-likelihood-idle">
					This estimates whether a MEME run would report any sites; it needs an alignment first.
				</p>
			{/if}

			{#if shown && shown.status === STATUS.OK && style}
				<!-- The band name is three words, and three words cannot carry a rate. This line is what
				     stops the badge being read as a verdict, so it is not optional and it is not behind
				     the disclosure. -->
				<p class="hit-detail hit-lead" data-testid="hit-likelihood-lead">{style.lead}</p>
			{/if}

			{#if detailText}
				<!-- Why there is no number. Blank space here used to mean "not applicable", "out of
				     range" and "the estimator crashed" all at once. -->
				<p class="hit-detail" data-testid="hit-likelihood-detail">{detailText}</p>
			{/if}

			{#if shown && shown.recommendation}
				<!-- Text only. The guidance is about this alignment and MEME, so there is nothing here
				     for the UI to act on: the fix is collecting different data, not clicking a
				     control. The one action recommendFor can still emit (set MEME's resample) is
				     gated behind an option the MEME panel does not expose yet, so wiring a button
				     for it now would be plumbing for something that cannot fire. -->
				<p class="hit-detail" data-testid="hit-likelihood-guidance">
					{shown.recommendation.message}
				</p>
				{#each shown.recommendation.secondary || [] as alt}
					<p class="hit-detail hit-secondary">{alt.message}</p>
				{/each}
			{/if}

			{#if shown && shown.status === STATUS.OK && style && style.rarity}
				<p class="hit-detail hit-secondary" data-testid="hit-likelihood-rarity">{style.rarity}</p>
			{/if}

			{#if shown}
				<!-- The claim is falsifiable, so what produced it has to be reachable from where it is
				     made. Collapsed rather than omitted: it is provenance and calibration, not a footnote. -->
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
						<!-- What the estimate is NOT is the thing most likely to be misread, so it leads and
						     it is the only line given emphasis. The second sentence is the one that stops a
						     low band being read as a biological negative. -->
						<p class="hit-basis-lead">
							{shown.caveat} A low estimate means the data may be too thin for MEME's tests to resolve
							anything — not that there is nothing to find.
						</p>
						<p>
							<span class="hit-basis-key">What it predicts</span> whether a full MEME run on this alignment
							reports at least one site at p ≤ 0.1 — the same sites, at the same cutoff, that would appear
							in your results table.
						</p>
						{#if featureLine}
							<p><span class="hit-basis-key">Read from your data</span> {featureLine}.</p>
						{/if}
						<p>
							<span class="hit-basis-key">How it was built</span>
							{MODEL_BASIS} It is an XGBoost model fitted on DataMonkey's own completed MEME jobs, so
							it describes alignments people actually chose to run; your browser reads the file XGBoost
							itself wrote, with no conversion step in between that could drift.
						</p>
						<p>
							<span class="hit-basis-key">How well it is calibrated</span>
							the model scores an alignment from 0 to 100% and the bands are drawn at {unlikelyPct}%
							and {likelyPct}%. Measured on 5,982 completed MEME runs it never saw during training:
							below {unlikelyPct}%, a site was reported 5% of the time; between {unlikelyPct}% and {likelyPct}%,
							52% of the time; at {likelyPct}% and above, 93%. Ranking accuracy (AUC) is 0.88.
						</p>
						<p>
							<span class="hit-basis-key">What it is measured against</span>
							about 85% of those runs reported at least one site, so most alignments are expected to.
							A high estimate is close to typical and says little; a low estimate is the informative
							case, and it is rare — under 3% of submissions score below {unlikelyPct}%.
						</p>
						<p>
							<span class="hit-basis-key">How it behaves</span> the score moves one way only: adding
							sequences, adding codons, or deeper branches can raise it and never lower it. That
							holds at every input the model can score, not just on average. It is still coarse — it
							reads {LIVE_FEATURES.length} numbers off your alignment and tree and nothing about the
							sequences themselves — so read it as a rate over similar alignments rather than a property
							of yours.
						</p>
						{#if style && style.bandRate}
							<p data-testid="hit-likelihood-band-rate">
								<span class="hit-basis-key">This band's track record</span>
								{style.bandRate}
							</p>
							<p>
								<span class="hit-basis-key">Why there is no percentage</span> the model does produce
								a number, but the three bands are the part 5,982 outcomes establish. A per-alignment
								percentage would suggest a precision this estimate does not have, so what is shown is
								the band and how the runs in it actually turned out.
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
