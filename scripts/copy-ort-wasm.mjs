/**
 * Copy onnxruntime-web's WASM runtime into static/ so DataMonkey serves it itself.
 *
 * WHY THIS EXISTS. onnxruntime-web does not bundle its WASM binary; it fetches it at runtime, and
 * with no configuration it resolves to a jsDelivr CDN URL. That breaks two things at once:
 *
 *   1. THE PROJECT'S CORE CONSTRAINT. CLAUDE.md: "The website needs to be entirely self-contained so
 *      that it can be served locally. No pulling down from other domains." A CDN fetch is exactly
 *      that, and it fails closed on an air-gapped or offline install rather than degrading.
 *   2. It fails in dev anyway, which is how this was found — the runtime aborts with "both async and
 *      sync fetching of the wasm failed" and onnxruntime reports "no available backend found",
 *      which reads like a broken model rather than a missing asset.
 *
 * WHY COPY RATHER THAN COMMIT. The file is 12.9 MB of third-party build output that is already
 * pinned by package.json and present in node_modules. Committing it would put a binary in git
 * history that goes stale the moment onnxruntime-web is upgraded, and nothing would notice. Copying
 * at build time means the served asset always matches the installed package.
 *
 * ONLY THE BASE VARIANT IS COPIED. onnxruntime-web ships ~128 MB of dist covering four builds —
 * jsep (WebGPU), asyncify, jspi and the plain SIMD+threads one. AxoMEME runs on CPU with a single
 * thread, so it needs the last of those and nothing else. Copying all of them would multiply the
 * deploy size for capabilities this feature does not use.
 */

import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(repo, 'node_modules', 'onnxruntime-web', 'dist');
const to = join(repo, 'static', 'ort');

/** The plain SIMD+threads build and its loader. Nothing else is used at runtime. */
const ASSETS = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];

if (!existsSync(from)) {
	// Not fatal: `npm run build` in an environment without the optional dependency should say so
	// clearly rather than emit a site whose AxoMEME path fails at the last moment.
	console.warn('[ort-wasm] onnxruntime-web is not installed; skipping. AxoMEME will not run.');
	process.exit(0);
}

mkdirSync(to, { recursive: true });
let total = 0;
for (const name of ASSETS) {
	const src = join(from, name);
	if (!existsSync(src)) {
		console.error(
			`[ort-wasm] expected ${name} in onnxruntime-web/dist — has the package layout changed?`
		);
		process.exit(1);
	}
	copyFileSync(src, join(to, name));
	total += statSync(src).size;
}
console.log(
	`[ort-wasm] copied ${ASSETS.length} files (${(total / 1024 / 1024).toFixed(1)} MB) to static/ort/`
);
