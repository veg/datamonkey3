<!--
  RunStrip — one row per run, directly beneath the Run button.

  WHY A NEW COMPONENT rather than a second mount of AnalysisProgress.svelte, which the original
  proposal suggested. Four reasons, each independently sufficient:

    - AnalysisProgress hides itself 5 s after completion (:151-157). Five seconds is calibrated for
      a user who is watching. This row exists for the user who was NOT.
    - It falls back to $activeAnalysisProgress, i.e. activeAnalyses[0] (analyses.js:835-848) — an
      arbitrary choice the moment two jobs exist.
    - It renders a five-line log tail through `marked`, which does not belong under a button.
    - It draws a sliding bar, which reads as motion toward completion.

  Threading a suppressAutoHide prop through all of that is more code than this file.

  PLACEMENT is below the button, never above: at the top of the tab it would shift the button 44 px
  down at the instant the pointer is travelling toward it. RunOutlook.svelte:96-102 documents the
  same concern at length.

  NO PROGRESS BAR, determinate or indeterminate. WasmAnalysisRunner emits 10/20/40/80/95 and the
  40→80 step spans the entire computation, so a bar would be a fiction. AnalysisProgress already
  refuses to draw one; that refusal is preserved here.

  NO STOP BUTTON ON LOCAL RUNS. WasmAnalysisRunner has no cancelAnalysis override — cancelling marks
  the record and the WASM keeps running, then writes 'completed' over it. Offering a control that
  does not do what it says is worse than offering none. Server runs can genuinely be stopped, but
  that affordance is deliberately left to a follow-up rather than added here.

  See design/03-run-feedback/.
-->
<script>
	import { onDestroy } from 'svelte';
	import { analysisStore } from '../stores/analyses';
	import { runStatusLine, isTerminal } from './utils/runStatusLine.js';
	import { X } from 'lucide-svelte';

	/** Only show runs for the file currently being worked on. */
	export let fileId = null;

	/** Rows the user has dismissed. Terminal rows persist until dismissed — they do not time out. */
	let dismissed = new Set();

	// 1 Hz. The clock is the only thing that moves in this component.
	let now = Date.now();
	const ticker = setInterval(() => (now = Date.now()), 1000);
	onDestroy(() => clearInterval(ticker));

	function startedAt(analysis) {
		const raw = analysis?.metadata?.startTime ?? analysis?.createdAt;
		const ms = typeof raw === 'string' ? Date.parse(raw) : raw;
		return Number.isFinite(ms) ? ms : null;
	}

	function elapsedSeconds(analysis) {
		const start = startedAt(analysis);
		if (!start) return 0;
		const end = isTerminal(analysis.status) ? (analysis.completedAt ?? now) : now;
		return Math.max(0, (end - start) / 1000);
	}

	// `datareader` is the invisible file-reader job; it is not a run the user started and has no
	// place under the Run button.
	$: rows = ($analysisStore.analyses ?? [])
		.filter((a) => a.method !== 'datareader')
		.filter((a) => !fileId || a.fileId === fileId)
		.filter((a) => !dismissed.has(a.id))
		.filter((a) => !isTerminal(a.status) || a.completedAt)
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
		.slice(0, 4)
		.map((a) => ({
			id: a.id,
			status: a.status,
			line: runStatusLine({
				method: a.method,
				status: a.status,
				executionMode: a.metadata?.executionMode,
				elapsedSeconds: elapsedSeconds(a),
				// Captured at submission by BaseAnalysisRunner.startAnalysisTracking. Absent for methods
				// with no fitted equation, which runStatusLine handles by saying nothing.
				estimateSeconds: a.metadata?.estimateSeconds,
				error: a.error
			})
		}));

	function dismiss(id) {
		dismissed = new Set([...dismissed, id]);
	}
</script>

{#if rows.length}
	<div class="run-strip" data-testid="run-strip">
		{#each rows as row (row.id)}
			<div class="run-row" data-testid="run-row" data-status={row.status}>
				<span class="dot dot-{row.line.tone}" aria-hidden="true"></span>

				<span class="run-label">{row.line.label}</span>
				<span class="sep">·</span>
				<span class="run-detail">{row.line.detail}</span>

				{#if row.line.clock}
					<span class="sep">·</span>
					<span class="run-clock" data-testid="run-clock">{row.line.clock}</span>
				{/if}

				<span class="spacer"></span>

				{#if row.status === 'completed'}
					<button class="run-action" on:click={() => analysisStore.setCurrentAnalysis(row.id)}>
						View results
					</button>
				{/if}

				<!-- Terminal rows are dismissed by hand, never on a timer: this row's whole purpose is to
				     still be there for someone who was on another tab when the run ended. -->
				{#if isTerminal(row.status)}
					<button class="run-dismiss" on:click={() => dismiss(row.id)} aria-label="Dismiss">
						<X size={14} />
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.run-strip {
		margin-top: 0.75rem;
		border-top: 1px solid var(--color-border, #e5e7eb);
	}

	.run-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		/* 44 px: a touch target, and enough that two rows do not read as one block of text. */
		min-height: 44px;
		padding: 0 0.25rem;
		font-size: 0.8125rem;
		border-bottom: 1px solid var(--color-border, #e5e7eb);
	}
	.run-row:last-child {
		border-bottom: none;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}
	/* The only motion in the component. No sliding bar: there is no real progress to report. */
	.dot-running {
		background: #2563eb;
		animation: pulse 2s ease-in-out infinite;
	}
	.dot-slow {
		background: #b45309;
		animation: pulse 2s ease-in-out infinite;
	}
	.dot-done {
		background: #16a34a;
	}
	.dot-failed {
		background: #b91c1c;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dot-running,
		.dot-slow {
			animation: none;
		}
	}

	.run-label {
		font-weight: 600;
	}
	.sep {
		opacity: 0.4;
	}
	.run-detail {
		color: #4b5563;
	}
	.run-clock {
		/* Tabular figures so the row does not jitter once a second. */
		font-variant-numeric: tabular-nums;
		color: #4b5563;
	}
	.spacer {
		flex: 1;
	}

	.run-action {
		font-size: 0.8125rem;
		font-weight: 500;
		color: #2563eb;
		padding: 0.25rem 0.5rem;
	}
	.run-action:hover {
		text-decoration: underline;
	}
	.run-dismiss {
		color: #9ca3af;
		padding: 0.25rem;
	}
	.run-dismiss:hover {
		color: #4b5563;
	}
</style>
