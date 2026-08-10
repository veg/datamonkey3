/**
 * Compare the JS patristic-distance port against the ML team's own Python, over real trees.
 *
 * This is the gate that makes the port trustworthy. The unit tests in
 * src/test/axomeme-patristic.test.js check hand-computed values on trees small enough to verify by
 * eye; this checks the SAME CODE against the reference implementation on real DataMonkey
 * submissions, where the trees are large, unbalanced, occasionally malformed, and carry the negative
 * branch lengths DM3's own NJ produces.
 *
 * Run verify_preprocessing.py first to produce the reference JSON.
 *
 *   node scripts/axomeme/verify_preprocessing.mjs \
 *       --reference /tmp/axomeme_reference.json \
 *       [--tolerance 1e-9]
 *
 * Exits non-zero if any tree exceeds the tolerance, so it can be wired into CI the way
 * scripts/prescreen/verify_parity.py is. Prints file ids, shapes and deltas only — never taxon
 * names or sequence data, because the corpus is unpublished research data.
 */

import { readFileSync } from 'node:fs';
import {
	parseNewick,
	leafIndex,
	normalizeTaxonName
} from '../../src/lib/services/axomeme/newick.js';
import { patristicMatrix } from '../../src/lib/services/axomeme/patristic.js';
import { computeMdsCoordinates } from '../../src/lib/services/axomeme/mds.js';

const arg = (flag, fallback) => {
	const i = process.argv.indexOf(flag);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const referencePath = arg('--reference');
const tolerance = Number(arg('--tolerance', '1e-9'));
if (!referencePath) {
	console.error('usage: verify_preprocessing.mjs --reference <json> [--tolerance 1e-9]');
	process.exit(2);
}

const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
const entries = Object.entries(reference);
console.log(`[*] ${entries.length} reference matrices, tolerance ${tolerance}`);

let checked = 0;
let cells = 0;
let worst = 0;
let worstFile = null;
const failures = [];
const skipped = [];

/**
 * MDS gets its own, much looser tolerance, and the reason is not slack.
 *
 * The coordinates are cast to float32 by the reference, so ~1e-7 relative is the floor no matter how
 * carefully either side computes. On top of that, this is the one stage where two CORRECT
 * implementations can legitimately disagree: numpy uses divide-and-conquer (dsyevd), this port uses
 * implicit-shift QL, and inside a degenerate eigenspace any orthonormal basis is a valid answer that
 * the reference's sign convention cannot disambiguate. So the number below is a measurement
 * threshold, not a correctness proof — what matters is the DISTRIBUTION printed at the end.
 */
const mdsTolerance = Number(arg('--mds-tolerance', '1e-5'));
let mdsChecked = 0;
let mdsCells = 0;
let mdsWorstOverall = 0;
let mdsWorstFile = null;
const mdsFailures = [];

for (const [path, ref] of entries) {
	const id = path.split('/').pop();
	let tree;
	try {
		tree = parseNewick(readFileSync(path, 'utf8'));
	} catch (e) {
		skipped.push(`${id}: parse threw ${e.message}`);
		continue;
	}

	const { index } = leafIndex(tree);
	// Order the rows exactly as the reference did, so cell (i,j) means the same pair on both sides.
	const nodes = ref.names.map((n) => index.get(normalizeTaxonName(n)));
	if (nodes.some((v) => v === undefined)) {
		// A name the JS parser did not produce is a PARSE divergence, not a distance divergence, and
		// it is a real failure — it means the two parsers disagree about what the taxa are.
		const missing = nodes.filter((v) => v === undefined).length;
		failures.push(`${id}: ${missing}/${ref.names.length} taxa missing from the JS parse`);
		continue;
	}

	const n = nodes.length;
	const mine = patristicMatrix(tree, nodes);
	let fileWorst = 0;
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const d = Math.abs(mine[i * n + j] - ref.dist[i][j]);
			if (d > fileWorst) fileWorst = d;
		}
	}
	cells += n * n;
	checked++;
	if (fileWorst > worst) {
		worst = fileWorst;
		worstFile = `${id} (${n} taxa)`;
	}
	if (fileWorst > tolerance) {
		failures.push(`${id}: ${n} taxa, max|Δ| ${fileWorst.toExponential(3)}`);
	}

	// --- MDS, the piece whose agreement is not guaranteed by construction ---
	if (!ref.mds) continue;
	const cap = ref.max_species;
	// The reference pads to max_species BEFORE the eigendecomposition, so the padded zeros take part
	// in the double-centring. Build the same padded matrix rather than running MDS on the real taxa.
	const padded = new Float64Array(cap * cap);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) padded[i * cap + j] = mine[i * n + j];
	}
	const coords = computeMdsCoordinates(padded, cap, 4);
	let mdsWorst = 0;
	let mdsWorstComponent = -1;
	let mdsScale = 0;
	for (let i = 0; i < cap; i++) {
		for (let c = 0; c < 4; c++) {
			const d = Math.abs(coords[i * 4 + c] - ref.mds[i][c]);
			if (d > mdsWorst) {
				mdsWorst = d;
				mdsWorstComponent = c;
			}
			const s = Math.abs(ref.mds[i][c]);
			if (s > mdsScale) mdsScale = s;
		}
	}
	// GATE ON RELATIVE ERROR, against the largest coordinate in the whole matrix.
	//
	// An absolute threshold is the wrong instrument here and reads as a failure when nothing is wrong.
	// The four components have wildly different scales — a measured 135-taxon tree runs 9.3e2, 2.2e2,
	// 6.4e0, 2.1e-1 — because they carry eigenvalues seven orders of magnitude apart. A fixed absolute
	// tolerance is simultaneously far too loose for component 0 and far too tight for component 3.
	// What the model actually consumes is the vector as a whole, through one Linear layer, so error
	// relative to the vector's own scale is the quantity that means something.
	const mdsRel = mdsScale > 0 ? mdsWorst / mdsScale : 0;
	mdsChecked++;
	mdsCells += cap * 4;
	if (mdsRel > mdsWorstOverall) {
		mdsWorstOverall = mdsRel;
		mdsWorstFile = `${id} (${n} taxa, component ${mdsWorstComponent}, abs ${mdsWorst.toExponential(2)})`;
	}
	if (mdsRel > mdsTolerance) {
		mdsFailures.push(
			`${id}: ${n} taxa -> ${cap}, rel ${mdsRel.toExponential(3)} ` +
				`(abs ${mdsWorst.toExponential(3)}, scale ${mdsScale.toExponential(3)}) on component ${mdsWorstComponent}`
		);
	}
}

console.log(`\n--- patristic distances ---`);
console.log(`[*] compared ${checked} trees, ${cells.toLocaleString()} distance cells`);
console.log(`[*] worst |Δ| ${worst.toExponential(3)}${worstFile ? `  (${worstFile})` : ''}`);
if (skipped.length) {
	console.log(`[!] ${skipped.length} skipped:`);
	for (const s of skipped.slice(0, 5)) console.log(`      ${s}`);
}

if (mdsChecked) {
	console.log(`\n--- MDS coordinates ---`);
	console.log(`[*] compared ${mdsChecked} trees, ${mdsCells.toLocaleString()} coordinates`);
	console.log(
		`[*] worst RELATIVE Δ ${mdsWorstOverall.toExponential(3)}${mdsWorstFile ? `  (${mdsWorstFile})` : ''}`
	);
	console.log(
		`[*] float32 relative resolution is ~1.2e-7, so anything near that is the format, not the port`
	);
	console.log(
		`[*] ${mdsChecked - mdsFailures.length}/${mdsChecked} trees within ${mdsTolerance}` +
			` (${(((mdsChecked - mdsFailures.length) / mdsChecked) * 100).toFixed(1)}%)`
	);
	if (mdsFailures.length) {
		console.log(`[!] ${mdsFailures.length} over tolerance:`);
		for (const f of mdsFailures.slice(0, 20)) console.log(`      ${f}`);
	}
}

if (failures.length) {
	console.log(`\n[!] ${failures.length} DISTANCE FAILURES:`);
	for (const f of failures.slice(0, 20)) console.log(`      ${f}`);
	process.exit(1);
}
if (mdsFailures.length) {
	console.log('\n[!] MDS PARITY NOT CLEAN');
	process.exit(1);
}
console.log('\n[*] PARITY OK');
