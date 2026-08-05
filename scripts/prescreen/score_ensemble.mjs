#!/usr/bin/env node
/**
 * score_ensemble.mjs — score feature vectors with the SHIPPED JS evaluator.
 *
 * Reads {"rows": [[num_seqs, num_sites, median_pos_dist, frac_p_defined], ...]} on stdin and
 * writes {"scores": [...]} on stdout. It deliberately imports treeEnsemble.js and the ensemble
 * JSON exactly as the browser does, so verify_parity.py is comparing ONNX against the real
 * shipped code path rather than a reimplementation of it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESCREEN = join(HERE, '..', '..', 'src', 'lib', 'services', 'prescreen');

const { prepareTreeEnsemble, evalTreeEnsemble } = await import(join(PRESCREEN, 'treeEnsemble.js'));
const doc = JSON.parse(readFileSync(join(PRESCREEN, 'meme_hit_likelihood.ensemble.json'), 'utf8'));
const model = prepareTreeEnsemble(doc);

const input = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(
	JSON.stringify({ scores: input.rows.map((r) => evalTreeEnsemble(model, r)) })
);
