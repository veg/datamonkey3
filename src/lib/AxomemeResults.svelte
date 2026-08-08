<script>
	/**
	 * AxomemeResults — per-site predictions from the AxoMEME 2.0 surrogate.
	 *
	 * THE COPY IN HERE IS LOAD-BEARING. AxoMEME estimates what MEME would report; it did not run MEME.
	 * A researcher reading "Tier 1 (High)" next to a site is one step from writing it up, so the page
	 * has to make three things unmissable without nagging:
	 *
	 *   1. These are PREDICTIONS. The word appears in the heading, not only in fine print.
	 *   2. A zero at an invariant site means NOT APPLICABLE, not "no selection". The reference zeroes
	 *      those before consulting the model, so rendering them as 0.000 alongside real zeros would
	 *      conflate "the model said nothing" with "we never asked".
	 *   3. What got dropped. Taxa absent from the tree, a tree with negative branch lengths, taxa cut
	 *      by the 512 cap — each changes what the model saw, and none of it is visible in the numbers.
	 *
	 * Everything else is an ordinary table.
	 */
	import { Sparkles, TriangleAlert, Info } from 'lucide-svelte';

	export let data = null;

	/** Rendering every row of a 12,000-codon alignment is ~100k DOM nodes. Raise on request instead. */
	const PAGE = 500;
	let limit = PAGE;
	let onlyCalled = true;

	$: sites = data?.sites ?? [];
	$: summary = data?.summary ?? {};
	$: called = sites.filter((s) => s.call !== 'Neutral');
	// With nothing called, the checkbox is disabled — so it must also READ unchecked. Leaving it
	// ticked while the table shows every site is a small lie about what the filter is doing.
	$: if (called.length === 0) onlyCalled = false;
	// Default to the called sites when there are any, because that is what the page is for. With none,
	// showing an empty table would look like a failure rather than a result.
	$: shown = (onlyCalled && called.length > 0 ? called : sites).slice(0, limit);
	$: total = (onlyCalled && called.length > 0 ? called : sites).length;

	const fmt = (v, dp = 3) => (Number.isFinite(v) ? v.toFixed(dp) : '—');
	const callClass = (call) =>
		call?.startsWith('Tier 1')
			? 'bg-red-50 text-red-700'
			: call?.startsWith('Tier 2')
				? 'bg-amber-50 text-amber-700'
				: 'text-slate-500';
</script>

{#if data}
	<div class="axomeme-results">
		<header class="mb-4">
			<div class="mb-1 flex items-center gap-2">
				<Sparkles class="h-5 w-5 text-violet-600" />
				<h3 class="text-lg font-bold">AxoMEME predictions</h3>
			</div>
			<p class="text-sm text-slate-600">
				Estimates of what MEME would report for each site, from a neural model. MEME was not run.
				Treat these as a fast preview and confirm anything you rely on with the full analysis.
			</p>
		</header>

		<!-- What the model actually saw. Each of these changes the result and none of it shows up in
		     the numbers themselves. -->
		{#if summary.speciesUsed !== summary.speciesInAlignment || summary.treeWarnings?.length || summary.duplicateSelections > 0}
			<div class="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
				<div class="mb-1 flex items-center gap-2 font-semibold text-amber-800">
					<TriangleAlert class="h-4 w-4" />
					What the model was given
				</div>
				<ul class="list-inside list-disc space-y-1 text-amber-900">
					{#if summary.speciesUsed !== summary.speciesInAlignment}
						<li>
							{summary.speciesUsed} of {summary.speciesInAlignment} sequences were used — the rest were
							not found in the tree{summary.speciesUsed === 512
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
					{#each summary.treeWarnings ?? [] as warning}
						<li>{warning}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded bg-slate-50 p-3">
				<div class="text-2xl font-bold">{called.length}</div>
				<div class="text-xs text-slate-600">sites predicted under selection</div>
			</div>
			<div class="rounded bg-slate-50 p-3">
				<div class="text-2xl font-bold">{summary.variableSites ?? 0}</div>
				<div class="text-xs text-slate-600">variable sites scored</div>
			</div>
			<div class="rounded bg-slate-50 p-3">
				<div class="text-2xl font-bold">{summary.totalSites ?? sites.length}</div>
				<div class="text-xs text-slate-600">codon sites</div>
			</div>
			<div class="rounded bg-slate-50 p-3">
				<div class="text-2xl font-bold">{summary.speciesUsed ?? '—'}</div>
				<div class="text-xs text-slate-600">sequences used</div>
			</div>
		</div>

		{#if called.length === 0}
			<div
				class="mb-4 flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm"
			>
				<Info class="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
				<span>
					No site cleared the calling threshold. That is a prediction of what MEME would find, not a
					result from MEME — a real run can still report sites here.
				</span>
			</div>
		{/if}

		<div class="mb-2 flex items-center justify-between gap-3">
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={onlyCalled} disabled={called.length === 0} />
				Show only predicted sites
			</label>
			<span class="text-xs text-slate-500">
				showing {shown.length} of {total}
			</span>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
					<tr>
						<th class="px-2 py-2">Site</th>
						<th class="px-2 py-2">Codon</th>
						<th class="px-2 py-2">AA</th>
						<th class="px-2 py-2 text-right">LRT</th>
						<th class="px-2 py-2 text-right">dN⁺</th>
						<th class="px-2 py-2 text-right">dS</th>
						<th class="px-2 py-2 text-right">p⁺</th>
						<th class="px-2 py-2">Call</th>
					</tr>
				</thead>
				<tbody>
					{#each shown as row (row.site)}
						<tr class="border-b border-slate-100">
							<td class="px-2 py-1 font-mono">{row.site}</td>
							<td class="px-2 py-1 font-mono">{row.refCodon}</td>
							<td class="px-2 py-1 font-mono">{row.refAa}</td>
							{#if row.isVariable}
								<td class="px-2 py-1 text-right font-mono">{fmt(row.lrt)}</td>
								<td class="px-2 py-1 text-right font-mono">{fmt(row.betaPosDn)}</td>
								<td class="px-2 py-1 text-right font-mono">{fmt(row.alphaDs)}</td>
								<td class="px-2 py-1 text-right font-mono">{fmt(row.pPos, 4)}</td>
							{:else}
								<!-- Invariant sites are zeroed before the model is consulted. Printing 0.000 here
								     would read as "no selection" when it means "not applicable". -->
								<td class="px-2 py-1 text-right text-slate-400" colspan="4">
									not scored — no amino-acid variation
								</td>
							{/if}
							<td class="px-2 py-1">
								<span class="rounded px-1.5 py-0.5 text-xs {callClass(row.call)}">{row.call}</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if shown.length < total}
			<button
				class="mt-3 rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
				on:click={() => (limit += PAGE)}
			>
				Show {Math.min(PAGE, total - shown.length)} more
			</button>
		{/if}

		<footer class="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
			AxoMEME {data.modelVersion}
			{#if summary.referenceSequence}
				· reference sequence <span class="font-mono">{summary.referenceSequence}</span>
			{/if}
			{#if data.modelSha256}
				· model <span class="font-mono">{data.modelSha256.slice(0, 12)}</span>
			{/if}
		</footer>
	</div>
{/if}
