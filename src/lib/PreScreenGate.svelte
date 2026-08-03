<!-- src/lib/PreScreenGate.svelte -->
<!--
  AxoMEME stage-1 pre-screen badge. For a MEME submission it shows a GREEN/YELLOW/RED
  triage tier ("will a full MEME run likely find anything at this tree depth?"), sitting
  just above the runtime estimate. Advisory only — never blocks a run.

  Runs entirely client-side (onnxruntime-web); guarded so it never executes during SSR.
-->
<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import ShieldCheck from 'lucide-svelte/icons/shield-check';
	import ShieldAlert from 'lucide-svelte/icons/shield-alert';
	import ShieldX from 'lucide-svelte/icons/shield-x';
	import { loadGateSession, computeAdvisory, isGatedMethod } from './services/prescreen/gateAdvisory.js';

	// Props
	export let method = null;
	export let alignment = '';
	export let tree = '';

	let advisory = null;
	let loading = false;
	let sessionCtx = null;

	const TIER_STYLE = {
		GREEN: { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', Icon: ShieldCheck, label: 'Likely worthwhile' },
		YELLOW: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', Icon: ShieldAlert, label: 'Uncertain' },
		RED: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', Icon: ShieldX, label: 'Likely underpowered' }
	};

	$: style = advisory ? TIER_STYLE[advisory.tier] : null;

	// Recompute whenever the method/alignment/tree change (client-side only).
	$: if (browser && sessionCtx) {
		recompute(method, alignment, tree);
	}

	async function recompute(m, aln, tr) {
		if (!isGatedMethod(m)) {
			advisory = null;
			return;
		}
		loading = true;
		try {
			advisory = await computeAdvisory({
				method: m,
				alignment: aln,
				tree: tr,
				session: sessionCtx.session,
				Tensor: sessionCtx.Tensor
			});
		} catch (e) {
			// Advisory is non-essential: on failure, render nothing rather than nag the user.
			console.error('Pre-screen gate failed:', e);
			advisory = null;
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		if (!browser) return;
		try {
			sessionCtx = await loadGateSession();
			// trigger the first computation now that the session exists
			recompute(method, alignment, tree);
		} catch (e) {
			console.error('Pre-screen gate failed to load:', e);
		}
	});
</script>

{#if isGatedMethod(method) && advisory && style}
	<div
		class="prescreen-gate {style.bg} {style.border} rounded-md border p-3"
		data-testid="prescreen-gate"
		data-tier={advisory.tier}
	>
		<div class="gate-header">
			<span class="gate-icon {style.color}">
				<svelte:component this={style.Icon} class="h-4 w-4" />
			</span>
			<span class="gate-label {style.color}">MEME pre-screen: {style.label}</span>
			<span class="gate-score {style.color}" title="Gate score (probability MEME finds signal)">
				{(advisory.gate_score * 100).toFixed(0)}%
			</span>
		</div>
		<div class="gate-note">{advisory.note}</div>
	</div>
{:else if isGatedMethod(method) && loading}
	<div class="prescreen-gate rounded-md border border-gray-200 bg-gray-50 p-3" data-testid="prescreen-gate-loading">
		<div class="gate-header">
			<span class="gate-icon text-gray-500"><ShieldAlert class="h-4 w-4" /></span>
			<span class="gate-label text-gray-600">MEME pre-screen…</span>
		</div>
	</div>
{/if}

<style>
	.prescreen-gate {
		font-size: 13px;
		transition: all 0.2s ease;
	}
	.gate-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.gate-label {
		font-weight: 600;
	}
	.gate-score {
		font-weight: 700;
		margin-left: auto;
	}
	.gate-note {
		margin-top: 4px;
		padding-left: 22px;
		color: #64748b;
		font-size: 12px;
	}
</style>
