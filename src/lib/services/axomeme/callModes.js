/**
 * callModes.js — the tier gates AxoMEME calls sites with, and one sentence saying what each mode
 * will actually do to this alignment.
 *
 * A LEAF MODULE ON PURPOSE. The gates used to live in postprocess.js, which imports tokenizer.js and
 * its 64-codon genetic-code table. MethodSelector is on every user's critical path and needs the
 * numbers to describe the choice before a run, so importing postprocess.js there would pull the
 * model's tokenizer into the main chunk for the fourteen methods that will never touch it — the same
 * leakage RunOutlook lazy-loads MemeHitLikelihood to avoid. postprocess.js re-exports CALL_DEFAULTS
 * from here, so every existing import site is unchanged and there is still exactly one definition.
 */

/**
 * Default tier gates.
 *
 * THE DEFAULT MODE IS `percentile`, WHICH IS NOT THE REFERENCE'S DEFAULT, and the reason is measured
 * rather than preferential. The reference defaults to `pvalue`, which compares the predicted LRT
 * against 4.45 and 3.12 — chi-square thresholds for a GENUINE likelihood ratio. The model's output
 * does not live on that scale. Across 12 real DataMonkey submissions and 662 variable sites, the
 * highest predicted LRT anywhere was 3.902; exactly one site cleared 3.12 and none cleared 4.45.
 * On an alignment where MEME itself reports 17 sites at p <= 0.05, the model's maximum was 2.484.
 *
 * So under `pvalue` this feature ships reporting nothing on real data. That is not a threshold worth
 * tuning — it reflects what the model is: a RANKER. The metric its authors report is Spearman rank
 * correlation, not calibration, and rank correlation can be good while absolute scale is off.
 * `percentile` asks the question the model can answer — which sites in THIS alignment look most
 * interesting — instead of one it cannot.
 *
 * The gates themselves are unchanged from the driver's argparse (lines 984-991), so switching modes
 * reproduces the reference exactly.
 */
export const CALL_DEFAULTS = Object.freeze({
	mode: 'percentile',
	tier1LrtGate: 4.45, // p <= 0.05
	tier2LrtGate: 3.12, // p <= 0.10
	tier1Zscore: 2.5,
	tier2Zscore: 2.0,
	tier1Percentile: 98.0,
	tier2Percentile: 95.0
});

/** Same rounding postprocess.js uses for the tier LABELS, so pre-run copy and the results table
 *  print the same percentage rather than two roundings of one number. */
const pct = (n) => n.toFixed(0);

/**
 * What choosing this mode will do to THIS alignment, in one sentence.
 *
 * WHY THIS EXISTS: `percentile` — the default — always calls a fixed share of the variable sites,
 * whether or not any site is under selection. Ranking is what the model is for, and the results
 * table is honest about it ("Top 2%" / "Top 5%"), but before the run the only copy was a three-way
 * comparison of the modes that never said a share is always called. A user running a conserved gene
 * gets 2% of its variable sites back and has no way to know that was arithmetic rather than a
 * finding.
 *
 * TWO WORDINGS THAT LOOK LIKE NITPICKS AND ARE NOT:
 *
 *   - VARIABLE sites, not sites. Percentiles are computed over variable sites only
 *     (postprocess.js:170-185); invariant sites are zeroed before the model is consulted. On the
 *     conserved alignments this line is written for, "top 2% of sites" overstates the count by
 *     whatever fraction of the gene does not vary — which is most of it.
 *   - The Tier 2 label is the CUMULATIVE "Top 5%", because that is the string the results table
 *     prints. The tier SET is exclusive (the 95th-98th percentile band, 3% of variable sites), so
 *     the sentence names both: the band it adds, and the label it will carry.
 *
 * @param {string} [mode] - 'percentile' | 'zscore' | 'pvalue'; anything else falls back to the
 *   default mode's sentence, because that is the mode a missing value actually runs as
 *   (METHOD_ADVANCED_OPTIONS.axomeme.callMode.default === CALL_DEFAULTS.mode).
 * @param {object} [cfg] - gates to describe; every number in the sentence is derived from these
 * @returns {string}
 */
export function describeCallMode(mode, cfg = CALL_DEFAULTS) {
	if (mode === 'zscore') {
		return (
			`Flags sites at Z ≥ ${cfg.tier1Zscore} as Tier 1 and Z ≥ ${cfg.tier2Zscore} as Tier 2, ` +
			`where Z counts standard deviations above this alignment's own mean predicted LRT over its ` +
			`variable sites — still relative to this alignment, not an absolute test of significance.`
		);
	}

	if (mode === 'pvalue') {
		return (
			`Flags variable sites with a predicted LRT ≥ ${cfg.tier1LrtGate} as Tier 1 and ` +
			`≥ ${cfg.tier2LrtGate} as Tier 2. These are fixed chi-square gates rather than ranks, and ` +
			`the model's predicted LRTs rarely reach them, so this usually reports nothing at all.`
		);
	}

	return (
		`Flags the top ${pct(100 - cfg.tier1Percentile)}% of this alignment's variable sites as Tier 1 ` +
		`and the next ${pct(cfg.tier1Percentile - cfg.tier2Percentile)}% as Tier 2 (labelled ` +
		`"Top ${pct(100 - cfg.tier2Percentile)}%"), whether or not any site is under selection. Use it to ` +
		`prioritise sites for a full MEME run, not to decide significance.`
	);
}
