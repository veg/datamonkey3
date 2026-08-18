/**
 * AxomemeAnalysisRunner — runs AxoMEME 2.0 entirely in the browser.
 *
 * WHY THIS IS A THIRD RUNNER RATHER THAN A METHOD IN THE OTHER TWO. The project's checklist for
 * adding an analysis is written for HyPhy methods, and every step of it assumes one: a `command` to
 * pass to hyphy.wasm, an `outputSuffix` naming the HyPhy JSON it writes, CLI argument mapping in
 * WasmAnalysisRunner, a socket event in BackendAnalysisRunner, and a hyphy-eye visualiser keyed on
 * the shape of that JSON. AxoMEME has none of those. It is a 3.78 MB neural network evaluated by
 * onnxruntime-web against tensors this codebase builds itself, and it emits per-site predictions
 * rather than a HyPhy results document. Bending it into WasmAnalysisRunner would mean threading a
 * non-HyPhy path through every one of those assumptions.
 *
 * So it implements the same BaseAnalysisRunner lifecycle — createAnalysis, startAnalysisTracking,
 * updateProgress, completeAnalysis — which is the part that actually matters for the UI, and shares
 * nothing else.
 *
 * WHAT IT IS NOT. This is a SURROGATE for MEME, not MEME. It predicts what MEME's per-site
 * statistics would be, in seconds instead of hours, and it is wrong sometimes in ways a fitted model
 * is not. Nothing in this file should present its output as a completed selection analysis; that
 * framing belongs in the UI copy and is why `isSurrogate` is on the result rather than implied.
 *
 * MAIN-THREAD COST, stated because it is the known weak point: the MDS eigendecomposition runs on the
 * padded 512 x 512 matrix regardless of taxon count and takes ~600 ms for a small alignment, ~1.9 s
 * at 512 taxa. That is synchronous and blocks rendering. It is tolerable against the hours a real
 * MEME run takes, and the loop below yields between phases so progress paints, but a Web Worker is
 * the right home for it and is the first thing to do if this feels slow.
 */

import { BaseAnalysisRunner } from './BaseAnalysisRunner.js';
import { parseAlignment } from '../utils/fastaValidation.js';
import { prepareAlignment, batchSizeFor } from './axomeme/assemble.js';
import { loadSession, runSites, isSessionLoaded } from './axomeme/session.js';
import { buildPredictions, siteVariability, CALL_DEFAULTS } from './axomeme/postprocess.js';
import { validateInputBundle, VERIFIED_MODEL_SHA256 } from './axomeme/modelContract.js';
import { inspectBranchLengths } from '../utils/treeSanitation.js';

/**
 * Below this magnitude a negative branch length is float noise from NJ's unclamped subtraction, not a
 * broken tree. Matches the threshold the results page uses for the distance-clamping notice.
 */
const NOISY_NEGATIVE = -0.001;

/** Let the browser paint between phases; the heavy stages are synchronous. */
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

export class AxomemeAnalysisRunner extends BaseAnalysisRunner {
	/**
	 * Analyses the user has cancelled.
	 *
	 * The base class cancels by walking `activeAnalyses`, which the other two runners populate with a
	 * backend job id or a WASM handle. This runner has neither — its work is a plain loop on the main
	 * thread — so without this a cancelled AxoMEME run kept scoring, kept calling updateProgress
	 * (re-animating a row the user had cancelled), and finally wrote `completed` over the cancelled
	 * record and popped a success toast.
	 */
	cancelledAnalyses = new Set();

	async cancelAnalysis(analysisId) {
		this.cancelledAnalyses.add(analysisId);
		await super.cancelAnalysis(analysisId);
	}

	/**
	 * @param {string} method ignored — this runner serves one method
	 * @param {object} config
	 * @param {string} fastaData
	 * @param {string} treeData
	 * @param {string|null} fileId
	 */
	async runAnalysis(method, config, fastaData, treeData, fileId = null) {
		const analysisId = await this.createAnalysis(fileId, 'AXOMEME');
		// 'wasm', NOT 'browser'. This value is persisted to IndexedDB and read by consumers that know
		// only two vocabularies: analysisStore.cleanupInterruptedAnalyses() reaps stale runs by testing
		// `executionMode === 'wasm'`, and the result viewer and progress row label the mode from it. A
		// third value made an interrupted AxoMEME run unreapable — stuck at `running` forever after a
		// refresh during the ~600 ms-2 s synchronous MDS — and rendered "Execution: Unknown". AxoMEME
		// runs in the browser like the WASM path, so it shares that label.
		this.startAnalysisTracking(analysisId, 'AXOMEME', 'wasm', 'Starting AxoMEME prediction...');

		try {
			this.updateProgress(analysisId, 'parsing', 5, 'Reading alignment...');
			const parsed = parseAlignment(fastaData);
			const names = parsed.sequences.map((s) => s.header);
			const sequences = parsed.sequences.map((s) => s.sequence);
			if (names.length === 0) throw new Error('No sequences found in the alignment');
			await yieldToBrowser();

			// A tree is not strictly required — the reference falls back to an all-zero distance
			// matrix — but the result is close to meaningless, so it is recorded rather than hidden.
			const treeReport = treeData ? inspectBranchLengths(treeData) : null;

			this.updateProgress(analysisId, 'preparing', 15, 'Computing tree distances and embedding...');
			await yieldToBrowser();
			const prepared = prepareAlignment({
				names,
				sequences,
				treeText: treeData || undefined,
				maxSpecies: config?.maxSpecies,
				referenceName: config?.referenceSequence
			});
			if (prepared.totalCodons === 0) {
				throw new Error('The reference sequence is shorter than one codon');
			}

			// Loading is 3.78 MB of model plus ~13 MB of runtime on the FIRST run of a session, and
			// nothing at all afterwards. Saying which is happening matters — a user who has already run
			// one alignment should not be told to wait for a download that will not occur.
			const firstLoad = !isSessionLoaded();
			this.updateProgress(
				analysisId,
				'loading',
				30,
				firstLoad ? 'Downloading the AxoMEME model (first run only)...' : 'Preparing the model...'
			);
			const { session, sha256 } = await loadSession();
			// Same CPU-only subpath the session uses. Importing the default entry here instead would
			// pull a second, WebGPU-enabled copy of the runtime into the graph.
			const ort = await import('onnxruntime-web/wasm');

			const batch = batchSizeFor(prepared.speciesCount);
			// dist_matrix, mds_coords and padding_mask are per-ALIGNMENT — batch() emits b memcpy'd
			// copies of one array. Validating every batch rescanned up to the whole 64 MB budget three
			// times over, on the main thread, to re-check the same N x N block b times. Validate in full
			// once; after that the invariant tensors cannot have changed.
			let fullyValidated = false;
			const accumulated = { lrt: [] };
			for (let start = 0; start < prepared.totalCodons; start += batch) {
				const bundle = prepared.batch(start, batch);
				// The contract check is cheap next to inference and catches the whole class of errors
				// that produce a well-formed tensor meaning something the model never saw.
				if (!fullyValidated) {
					const check = validateInputBundle(bundle, {
						batch: bundle.msa_codons.dims[0],
						numSpecies: prepared.speciesCount,
						windowSize: prepared.windowSize
					});
					if (!check.ok) {
						throw new Error(`AxoMEME input check failed: ${check.errors.slice(0, 3).join('; ')}`);
					}
					fullyValidated = true;
				}
				const out = await runSites(session, bundle, ort);
				// NOT `push(...out[key])`. batchSizeFor scales as 1/N^2, so a few-taxon alignment gets
				// batches of 10^5-10^6 sites, and spreading that many elements into a call blows V8's
				// argument limit with "Maximum call stack size exceeded" at ~90% progress. Measured: it
				// throws at 167,772, which is exactly the batch size for a 10-taxon alignment.
				for (const key of Object.keys(accumulated)) {
					const src = out[key];
					for (let i = 0; i < src.length; i++) accumulated[key].push(src[i]);
				}

				// Between batches is the only place this loop yields, so it is the only place a cancel can
				// take effect. Returning without calling completeAnalysis leaves the cancelled record as
				// the user left it.
				if (this.cancelledAnalyses.has(analysisId)) {
					this.cancelledAnalyses.delete(analysisId);
					return { analysisId, cancelled: true };
				}

				const done = Math.min(start + batch, prepared.totalCodons);
				this.updateProgress(
					analysisId,
					'running',
					40 + Math.round((done / prepared.totalCodons) * 50),
					`Scoring site ${done} of ${prepared.totalCodons}...`
				);
				await yieldToBrowser();
			}

			this.updateProgress(analysisId, 'processing', 95, 'Building per-site results...');
			// Variability is judged over the SELECTED species, which is what the model saw — not over
			// every sequence in the file, which may include taxa the tree did not contain.
			// By INDEX, not `names.indexOf(name)`. With duplicate FASTA headers indexOf returns the FIRST
			// match while orderSpecies keeps the LAST, so the variability flags would come from a
			// different sequence than the one the model was tokenised from.
			const selectedSeqs = prepared.selectedIndices.map((i) => sequences[i] ?? '');
			const variable = siteVariability(selectedSeqs, prepared.totalCodons);
			const refSeq = sequences[prepared.referenceIndex] ?? sequences[0];
			const refCodons = Array.from({ length: prepared.totalCodons }, (_, i) =>
				refSeq.slice(i * 3, i * 3 + 3)
			);
			// ONE source of truth for the calling mode. This and the summary below used to resolve it
			// with OPPOSITE precedence, so a config carrying both could score with percentile gates
			// while the footer told the reader the calls meant "Z >= 2.5".
			const callConfig = {
				...(config?.calling ?? {}),
				...(config?.callMode ? { mode: config.callMode } : {})
			};
			const sites = buildPredictions(accumulated, { refCodons, variable }, callConfig);

			const result = {
				method: 'AxoMEME',
				modelVersion: 'v1-viral',
				modelSha256: sha256 ?? VERIFIED_MODEL_SHA256,
				// Load-bearing for the UI: these are PREDICTIONS of what MEME would report, not MEME.
				isSurrogate: true,
				surrogateFor: 'MEME',
				sites,
				summary: {
					totalSites: prepared.totalCodons,
					variableSites: sites.filter((s) => s.isVariable).length,
					calledSites: sites.filter((s) => s.call !== 'Neutral').length,
					speciesUsed: prepared.speciesCount,
					speciesInAlignment: names.length,
					referenceSequence: prepared.referenceName,
					// Named in the footer: it changes what a "call" means, and the default is not the
					// reference driver's.
					callMode: callConfig.mode ?? CALL_DEFAULTS.mode,
					matchedFromTree: prepared.matchedFromTree,
					duplicateSelections: prepared.duplicateSelections,
					// Reported, not hidden. Clamping matches the model's training pipeline, so it is not
					// an error — but a tree whose distances are meaningfully negative is a different
					// situation from one carrying float noise, and only the magnitude distinguishes them.
					clampedDistances: prepared.clampedDistances,
					mostNegativeDistance: prepared.mostNegativeDistance,
					// Only surface tree problems worth acting on. inspectBranchLengths reports ANY negative
					// branch, and DM3's NJ routinely emits float noise around -1e-5 — the bundled
					// large.nex demo has two. Those are clamped (matching the model's training pipeline)
					// and warning about them trains users to ignore the warning box, which is worse than
					// not having one. A meaningfully negative tree still gets through, via this filter and
					// via the mostNegativeDistance line the results page renders.
					treeWarnings:
						treeReport && !treeReport.ok
							? treeReport.reasons.filter(
									(r) => !/negative/.test(r) || (treeReport.min ?? 0) <= NOISY_NEGATIVE
								)
							: []
				}
			};

			await this.completeAnalysis(analysisId, true, result);
			this.cancelledAnalyses.delete(analysisId);
			return { analysisId, result };
		} catch (error) {
			await this.completeAnalysis(analysisId, false, null, error.message);
			this.cancelledAnalyses.delete(analysisId);
			throw error;
		}
	}
}

const axomemeAnalysisRunner = new AxomemeAnalysisRunner();
export default axomemeAnalysisRunner;
export { axomemeAnalysisRunner };
