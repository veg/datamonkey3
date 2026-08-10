#!/usr/bin/env node
/**
 * score_gate.mjs — score feature vectors with the SHIPPED JS walker.
 *
 * Reads {"rows": [[num_seqs, num_sites, median_pos_dist], ...]} on stdin and writes
 * {"scores": [...], "meta": {...}} on stdout.
 *
 * It imports xgbEnsemble.js — the real module the browser runs — rather than a reimplementation of
 * it, so verify_parity.py is comparing XGBoost against the actual shipped code path, including its
 * arity guard (which verify_parity.py checks by feeding this a deliberately wrong-width row and
 * requiring a non-zero exit).
 *
 * It does NOT call loadXgbModel(): that uses `import('./meme_gate.json?raw')`, a Vite specifier
 * plain node cannot resolve. The bytes are the same either way — readFileSync here, the `?raw`
 * string literal in the bundle — and `prepareXgbModel` is the shared half that does all the
 * validation and compilation. Vitest exercises the `?raw` path; this exercises the same parse.
 *
 * Rows are passed to the walker UNCLIPPED: MODEL_INPUT_CLIP lives upstream in hitLikelihoodModel.js,
 * and parity is a claim about the walker, not about the clip.
 *
 * Usage: node score_gate.mjs [model.json] < rows.json
 *   The optional model path defaults to the shipped src/lib/services/prescreen/meme_gate.json. It
 *   exists so verify_parity.py --self-test can point the JS side at a deliberately CORRUPTED copy
 *   while XGBoost scores the pristine file. That one-sidedness is the whole point: corrupting the
 *   shipped model would leave both sides agreeing on the corrupt model and the gate green.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRESCREEN = join(HERE, '..', '..', 'src', 'lib', 'services', 'prescreen');

const { prepareXgbModel, evalXgbModel } = await import(join(PRESCREEN, 'xgbEnsemble.js'));

const modelPath = process.argv[2] ? resolve(process.argv[2]) : join(PRESCREEN, 'meme_gate.json');
const model = prepareXgbModel(JSON.parse(readFileSync(modelPath, 'utf8')));

const input = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(
	JSON.stringify({
		scores: input.rows.map((r) => evalXgbModel(model, r)),
		meta: model.meta
	})
);
