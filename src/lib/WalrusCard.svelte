<script>
	import { Workflow, ExternalLink } from 'lucide-svelte';
	import { WALRUS_URL } from './config/externalLinks.js';
	import { trackEvent } from './utils/analytics.js';
</script>

<!-- WALRUS (HyPhy 3 workbench) landing-page link card -->
<div
	class="mb-4 flex flex-col gap-premium-md rounded-premium border border-border-platinum bg-white p-premium-lg shadow-premium sm:flex-row sm:items-center"
	data-testid="walrus-card"
>
	<div
		class="hidden h-12 w-12 shrink-0 items-center justify-center rounded-premium bg-brand-whisper text-brand-royal sm:flex"
	>
		<Workflow size={24} />
	</div>
	<div class="min-w-0 flex-1">
		<h3 class="flex items-center gap-2 text-base font-bold text-text-rich">
			WALRUS: a HyPhy 3 workbench
			<span class="rounded bg-accent-copper px-1.5 py-0.5 text-xs font-semibold text-white">
				NEW
			</span>
		</h3>
		<p class="mt-1 text-sm text-text-slate">
			Go from raw coding sequences to alignment, phylogeny and selection analysis in one flow, in
			your browser.
		</p>
	</div>
	<a
		href={WALRUS_URL}
		target="_blank"
		rel="noopener noreferrer"
		class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-premium-sm bg-brand-royal px-4 py-2 text-sm font-semibold text-white transition-colors duration-premium hover:bg-brand-deep"
		onclick={() => trackEvent('walrus-link-clicked', { placement: 'landing-card' })}
	>
		Open WALRUS <ExternalLink size={13} />
	</a>
</div>
