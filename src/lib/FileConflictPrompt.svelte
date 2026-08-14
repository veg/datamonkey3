<!--
	Shown when an UPLOAD would land on a filename that already has a record.

	Not window.confirm, for two reasons: a store should not open a browser dialog, and a native
	dialog cannot be driven from Playwright the way a real element can.

	Deliberately two choices, no cancel. By the time this is on screen +page.svelte has already
	cleared fileMetricsJSON / fileMetricsStore / alignmentFileStore for the incoming file, so a
	cancel would leave the user looking at the empty state with nothing selected — a third button
	that produces a worse outcome than either real answer.
-->
<script>
	import { createEventDispatcher } from 'svelte';
	import { AlertTriangle } from 'lucide-svelte';

	/** @type {{ filename: string, keepBothName: string, analysisCount: number }|null} */
	export let conflict = null;

	const dispatch = createEventDispatcher();

	function choose(choice) {
		dispatch('choose', choice);
	}
</script>

{#if conflict}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="file-conflict-title"
		data-testid="file-conflict-prompt"
	>
		<div
			class="w-full max-w-md rounded-premium border border-border-platinum bg-white p-6 shadow-premium"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100"
				>
					<AlertTriangle class="h-5 w-5 text-amber-600" />
				</div>
				<div class="min-w-0">
					<h2 id="file-conflict-title" class="text-premium-body font-semibold text-text-rich">
						You already have a file called {conflict.filename}
					</h2>
					<p class="mt-1 text-sm text-text-slate">
						Replacing it keeps its history, so
						{conflict.analysisCount === 1
							? 'the 1 analysis already filed under this name'
							: `the ${conflict.analysisCount} analyses already filed under this name`}
						will be listed against the new contents. Keeping both starts a separate file with its own
						history.
					</p>
				</div>
			</div>

			<div class="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
				<button
					class="rounded-lg border border-border-platinum px-4 py-2 text-sm font-medium text-text-slate hover:bg-brand-whisper"
					on:click={() => choose('replace')}
				>
					Replace it
				</button>
				<button
					class="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-deep"
					on:click={() => choose('keep-both')}
				>
					Keep both — save as {conflict.keepBothName}
				</button>
			</div>
		</div>
	</div>
{/if}
