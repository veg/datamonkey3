/**
 * analysisConfig — the analysis configuration a user has built up, held outside the component.
 *
 * WHY THIS EXISTS. +page.svelte mounts <AnalyzeTab> inside an {#if activeTab === 'analyze'} block, so
 * Svelte destroys it on every tab switch. MethodSelector kept the whole configuration in component
 * locals, which meant a glance at the Results tab silently discarded the method, the genetic code,
 * the execution mode and every advanced option — and the dropdown came back on "Select an analysis
 * method" as though nothing had been chosen.
 *
 * Deliberately NOT localStorage. Nothing in src/ persists to it, and the defect is tab switching
 * within a session, not reload. A configuration that outlived a reload would also outlive the file it
 * was built for, which is worse than losing it.
 */

import { writable, get } from 'svelte/store';
import { METHOD_ADVANCED_OPTIONS } from '../lib/config/methodAdvancedOptions.js';

const DEFAULTS = {
	selectedMethod: null,
	geneticCode: 'Universal',
	geneticCodeId: 0,
	executionMode: 'local',
	methodOptions: {},
	// Set by restoreFrom so the selector can say what it put back, and cleared once it has.
	restoredFromAnalysisId: null
};

/** Keys that belong to the top level of the configuration rather than to a method's option bag. */
const TOP_LEVEL_KEYS = new Set(['method', 'geneticCode', 'geneticCodeId', 'executionMode']);

function defaults() {
	return { ...DEFAULTS, methodOptions: {} };
}

/**
 * The settings a re-run should restore, from whichever shape the runner persisted.
 *
 * ORDER IS LOAD-BEARING. BackendAnalysisRunner stores `parameters` in the BACKEND's shape
 * (gencodeid, 'ds-variation', 'branch-set') and keeps the UI's own config under `originalConfig`;
 * WasmAnalysisRunner stores the UI config directly as `parameters`. Feeding backend-shaped keys into
 * methodOptions would inject controls the UI never had and silently change what the next run
 * submits, so originalConfig wins whenever it exists.
 */
function savedSettingsFor(analysis) {
	const args = analysis?.metadata?.arguments;
	if (!args) return null;
	return args.originalConfig ?? args.parameters ?? null;
}

function createAnalysisConfigStore() {
	const store = writable(defaults());
	const { subscribe, set, update } = store;

	return {
		subscribe,
		set,
		update,

		/** Back to a blank configuration (a new file, or a test). */
		reset() {
			set(defaults());
		},

		/**
		 * Rehydrate from a previous analysis so "Re-run" means what it says.
		 *
		 * `methodKeys` is the dropdown's own list of method ids (Object.keys(methodConfig)). Analyses
		 * are stored with `method.toUpperCase()`, but the selector's values are the config's exact
		 * casing — 'AxoMEME', 'aBSREL' — so without this the restored method would never match an
		 * <option> and the dropdown would fall back to its placeholder.
		 *
		 * Returns `{ method, restoredSettings }`. `restoredSettings` is false when the record carries
		 * no arguments at all — AxomemeAnalysisRunner calls startAnalysisTracking with four arguments,
		 * so its records have no `metadata.arguments` — and the caller must not then claim settings
		 * were restored.
		 */
		restoreFrom(analysis, methodKeys = []) {
			const raw = analysis?.method ? String(analysis.method) : null;
			const method = raw
				? (methodKeys.find((k) => k.toLowerCase() === raw.toLowerCase()) ?? raw)
				: null;
			const saved = savedSettingsFor(analysis);

			update((state) => {
				const next = {
					...state,
					selectedMethod: method ?? state.selectedMethod,
					restoredFromAnalysisId: analysis?.id ?? null,
					restoredSummary: ''
				};

				if (!saved || !method) return next;

				if (typeof saved.geneticCode === 'string') next.geneticCode = saved.geneticCode;
				if (Number.isFinite(saved.geneticCodeId)) next.geneticCodeId = saved.geneticCodeId;
				if (saved.executionMode === 'local' || saved.executionMode === 'backend') {
					next.executionMode = saved.executionMode;
				}

				// Everything else is a method option — but only if the method still HAS that option.
				// An option removed in a later release must not resurrect a control that no longer
				// exists, and a backend-shaped key must never reach the UI's bag.
				const schema = METHOD_ADVANCED_OPTIONS[method.toLowerCase()] ?? {};
				const restored = {};
				for (const [key, value] of Object.entries(saved)) {
					if (TOP_LEVEL_KEYS.has(key)) continue;
					if (!(key in schema)) continue;
					restored[key] = value;
				}

				next.methodOptions = {
					...state.methodOptions,
					[method]: { ...(state.methodOptions?.[method] ?? {}), ...restored }
				};
				// Built HERE, from the values that actually came back — not later from store state,
				// where a default would be indistinguishable from a restored value and the notice
				// would claim to have restored settings a record never carried.
				next.restoredSummary = describeRestoredSettings(method, {
					geneticCode: typeof saved.geneticCode === 'string' ? saved.geneticCode : null,
					options: restored
				});
				return next;
			});

			return { method, restoredSettings: Boolean(saved && method) };
		},

		/** Current value, for the one place that hydrates component locals (MethodSelector.onMount). */
		current() {
			return get(store);
		}
	};
}

export const analysisConfig = createAnalysisConfigStore();

/**
 * A one-line, human summary of what a restore actually put back.
 *
 * Takes the RESTORED values, not the store's current state: a default and a restored value look
 * identical once they are in the store, and a summary built from state would tell an AxoMEME re-run
 * that its genetic code had been restored when the record carried no settings at all.
 *
 * @param {string} method
 * @param {{geneticCode: string|null, options: Record<string, unknown>}} restored
 */
export function describeRestoredSettings(method, restored) {
	const parts = [];
	const schema = METHOD_ADVANCED_OPTIONS[String(method ?? '').toLowerCase()] ?? {};
	if (restored?.geneticCode) parts.push(`genetic code ${restored.geneticCode}`);
	for (const [key, value] of Object.entries(restored?.options ?? {})) {
		if (value === '' || value === null || value === undefined) continue;
		// Interactive-tree payloads are newick strings and branch-name arrays; naming them is
		// meaningless to a reader and unbounded in length.
		if (schema[key]?.type === 'interactive-tree' || Array.isArray(value)) continue;
		if (typeof value === 'object') continue;
		parts.push(`${(schema[key]?.label ?? key).toLowerCase()} ${value}`);
	}
	// Three is a line, not a manifest. The controls themselves are right below it.
	return parts.slice(0, 3).join(', ');
}
