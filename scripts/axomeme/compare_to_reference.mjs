/**
 * Compare the JS AxoMEME pipeline against the reference implementation, per site.
 *
 * WHAT THIS DOES AND DOES NOT MEASURE. This is a PORT-CORRECTNESS check, not a model-quality one.
 * It runs both implementations over the same alignments and compares their per-site output, so a
 * disagreement means our JS differs from their Python. It says nothing about whether the model is
 * any good — for that you need MEME's own results on data the model never trained on, and most of
 * our corpus is AxoMEME fine-tuning data.
 *
 * The reference CSVs must come from a TOKENIZER-PATCHED copy of predict_regression_nexus.py. Its
 * shipped tokenizer disagrees with the model's training vocabulary on 63 of 64 codons, so comparing
 * against it unpatched would measure that bug rather than this port.
 *
 * Usage:
 *   node scripts/axomeme/compare_to_reference.mjs --refdir <dir of {jobid}.csv> --data <corpus/data/meme>
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web/wasm';
import { parseAlignment } from '../../src/lib/utils/fastaValidation.js';
import { prepareAlignment, batchSizeFor } from '../../src/lib/services/axomeme/assemble.js';
import { buildPredictions, siteVariability } from '../../src/lib/services/axomeme/postprocess.js';

const arg = (f, d) => {
	const i = process.argv.indexOf(f);
	return i > 0 ? process.argv[i + 1] : d;
};
const refDir = arg('--refdir');
const dataDir = arg('--data');
const fastaDir = arg('--fasta');
const modelPath = arg('--model');
if (!refDir || !dataDir || !modelPath || !fastaDir) {
	console.error('usage: --refdir <dir> --data <dir> --fasta <dir> --model <onnx>');
	process.exit(2);
}

ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(new Uint8Array(readFileSync(modelPath)));

/** Pearson correlation. */
function pearson(a, b) {
	const n = a.length;
	if (n < 2) return NaN;
	const ma = a.reduce((x, y) => x + y, 0) / n;
	const mb = b.reduce((x, y) => x + y, 0) / n;
	let num = 0,
		da = 0,
		db = 0;
	for (let i = 0; i < n; i++) {
		const x = a[i] - ma,
			y = b[i] - mb;
		num += x * y;
		da += x * x;
		db += y * y;
	}
	return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
}

/** Spearman: Pearson on average-tied ranks — the metric the ML team reports. */
function spearman(a, b) {
	const rank = (v) => {
		const idx = v.map((x, i) => i).sort((i, j) => v[i] - v[j]);
		const r = new Array(v.length);
		let i = 0;
		while (i < v.length) {
			let j = i;
			while (j + 1 < v.length && v[idx[j + 1]] === v[idx[i]]) j++;
			const avg = (i + j) / 2 + 1;
			for (let k = i; k <= j; k++) r[idx[k]] = avg;
			i = j + 1;
		}
		return r;
	};
	return pearson(rank(a), rank(b));
}

const rows = [];
for (const f of readdirSync(refDir)
	.filter((x) => x.endsWith('.csv'))
	.sort()) {
	const id = f.replace(/\.csv$/, '');
	// FASTA dumped by the REFERENCE's own parser, so both sides see byte-identical sequences and a
	// disagreement is a pipeline disagreement rather than two parsers reading a file differently.
	const fa = join(fastaDir, `${id}.fa`);
	const tre = join(dataDir, `${id}.tre`);
	if (!existsSync(fa) || !existsSync(tre)) continue;

	// --- reference ---
	const csv = readFileSync(join(refDir, f), 'utf8').trim().split(/\r?\n/);
	const header = csv[0].split(',');
	const cLrt = header.indexOf('predicted_lrt');
	const cVar = header.indexOf('is_variable');
	if (cLrt < 0) {
		console.log(`${id}: no predicted_lrt column`);
		continue;
	}
	const refLrt = [],
		refVar = [];
	for (let i = 1; i < csv.length; i++) {
		const p = csv[i].split(',');
		refLrt.push(Number(p[cLrt]));
		refVar.push(Number(p[cVar]));
	}

	// --- ours ---
	let mine;
	try {
		const parsed = parseAlignment(readFileSync(fa, 'utf8'));
		const names = parsed.sequences.map((s) => s.header);
		const seqs = parsed.sequences.map((s) => s.sequence);
		const prep = prepareAlignment({ names, sequences: seqs, treeText: readFileSync(tre, 'utf8') });
		const size = batchSizeFor(prep.speciesCount);
		const acc = { lrt: [], alpha: [], beta_neg: [], beta_pos: [], p_neg: [] };
		for (let s = 0; s < prep.totalCodons; s += size) {
			const b = prep.batch(s, size);
			const out = await session.run({
				msa_codons: new ort.Tensor('int64', b.msa_codons.data, b.msa_codons.dims),
				msa_aas: new ort.Tensor('int64', b.msa_aas.data, b.msa_aas.dims),
				dist_matrix: new ort.Tensor('float32', b.dist_matrix.data, b.dist_matrix.dims),
				mds_coords: new ort.Tensor('float32', b.mds_coords.data, b.mds_coords.dims),
				padding_mask: new ort.Tensor('bool', b.padding_mask.data, b.padding_mask.dims)
			});
			for (const k of Object.keys(acc)) acc[k].push(...out[k].data);
		}
		const selected = prep.selectedNames.map((n) => seqs[names.indexOf(n)] ?? '');
		const variable = siteVariability(selected, prep.totalCodons);
		const refSeq = seqs[names.indexOf(prep.referenceName)] ?? seqs[0];
		const refCodons = Array.from({ length: prep.totalCodons }, (_, i) =>
			refSeq.slice(i * 3, i * 3 + 3)
		);
		mine = buildPredictions(acc, { refCodons, variable });
	} catch (e) {
		console.log(`${id}: JS threw — ${e.message}`);
		continue;
	}

	const n = Math.min(mine.length, refLrt.length);
	if (n === 0 || mine.length !== refLrt.length) {
		console.log(`${id}: SITE COUNT MISMATCH js=${mine.length} ref=${refLrt.length}`);
		continue;
	}
	// Compare only sites BOTH sides consider variable; invariant sites are hard zeros on both and
	// would inflate every correlation toward 1.
	const ja = [],
		ra = [];
	let worst = 0,
		varMismatch = 0;
	for (let i = 0; i < n; i++) {
		if (Boolean(mine[i].isVariable) !== Boolean(refVar[i])) varMismatch++;
		if (!mine[i].isVariable || !refVar[i]) continue;
		ja.push(mine[i].lrt);
		ra.push(refLrt[i]);
		worst = Math.max(worst, Math.abs(mine[i].lrt - refLrt[i]));
	}
	rows.push({
		id,
		sites: n,
		compared: ja.length,
		varMismatch,
		worst,
		pearson: pearson(ja, ra),
		spearman: spearman(ja, ra)
	});
	console.log(
		`${id}  sites=${String(n).padStart(5)}  compared=${String(ja.length).padStart(5)}` +
			`  varMismatch=${String(varMismatch).padStart(4)}  max|Δ|=${worst.toExponential(2)}` +
			`  r=${pearson(ja, ra).toFixed(6)}  rho=${spearman(ja, ra).toFixed(6)}`
	);
}

console.log('\n=== SUMMARY ===');
console.log(`alignments compared: ${rows.length}`);
if (rows.length) {
	const meanBy = (k) =>
		rows.reduce((s, r) => s + (Number.isFinite(r[k]) ? r[k] : 0), 0) / rows.length;
	console.log(`total sites: ${rows.reduce((s, r) => s + r.sites, 0).toLocaleString()}`);
	console.log(
		`variable-site classification mismatches: ${rows.reduce((s, r) => s + r.varMismatch, 0)}`
	);
	console.log(
		`worst per-site |Δ| overall: ${Math.max(...rows.map((r) => r.worst)).toExponential(3)}`
	);
	console.log(`mean Pearson r:  ${meanBy('pearson').toFixed(6)}`);
	console.log(`mean Spearman ρ: ${meanBy('spearman').toFixed(6)}`);
	const bad = rows.filter((r) => !(r.pearson > 0.99));
	if (bad.length) {
		console.log(`\n[!] ${bad.length} alignments with r <= 0.99:`);
		for (const b of bad)
			console.log(`      ${b.id}  r=${b.pearson.toFixed(4)}  max|Δ|=${b.worst.toExponential(2)}`);
	}
}
