/**
 * The limits the upload path actually enforces.
 *
 * SOURCE OF TRUTH: src/data/shared/HyPhyGlobals.ibf
 *   :10  maxDMSites     = 12000   -> rejects when the CODON filter has more sites than this
 *   :15  maxSLACSize    = 10000   -> above this, datareader.bf:489 refuses to build an NJ tree,
 *                                    so the file must carry its own
 *   :33  maxUploadSize  = 25000   -> datareader.bf:359 rejects more sequences than this
 *
 * The copy these produce is deliberately about UPLOAD, not about analysis. Individual methods are
 * lower (HyPhyGlobals.ibf:17 maxMEMESize = 10000, :27 maxGARDSize = 500), so advertising 25,000 as
 * "the limit" full stop would swap one wrong number for another. The method-specific ceilings
 * belong next to the method, not next to the file input.
 */
export const uploadLimits = {
	maxSequences: 25000,
	maxCodons: 12000,
	treeRequiredAbove: 10000
};

const groupDigits = (n) => Number(n).toLocaleString('en-US');

/**
 * The single sentence shown under the file input. Built from the constants above so a limit change
 * in HyPhyGlobals.ibf has exactly one place to land on this side.
 * @returns {string}
 */
export function uploadLimitsCopy(limits = uploadLimits) {
	return (
		`Up to ${groupDigits(limits.maxSequences)} sequences and ${groupDigits(limits.maxCodons)} codons ` +
		`(about ${groupDigits(limits.maxCodons * 3)} nucleotides). ` +
		`Above ${groupDigits(limits.treeRequiredAbove)} sequences, your file must include a tree.`
	);
}
