/**
 * gate.js — client-side AxoMEME STAGE-1 GATE for DataMonkey (DM3).
 *
 * Label-free, geometry-only pre-screen: given a codon alignment (FASTA or NEXUS) and a
 * newick tree, it decides whether a full HyPhy MEME run is worthwhile. No server, no HyPhy.
 *
 * Feature extraction is an EXACT port of lib/gate_features.py (pure string parsing, no deps).
 * Scoring runs the exported GradientBoostingClassifier via ONNX Runtime — the SAME runtime
 * the stage-2 PhyloAxialTransformer will use — so DM3 has one inference path. Tier thresholds
 * mirror prescreen.py (GREEN >= 0.70, RED < 0.35).
 *
 * Feature order is FROZEN: [num_seqs, num_sites, median_pos_dist, frac_p_defined].
 *
 * The module is runtime-agnostic: the caller supplies an ONNX InferenceSession (created from
 * `onnxruntime-web` in the browser, or `onnxruntime-node` in tests) plus the `Tensor` ctor.
 * This keeps gate.js free of a hard dependency on a specific ORT package.
 *
 * Usage (browser):
 *   import * as ort from 'onnxruntime-web';
 *   import { createGateSession, runGate } from './gate.js';
 *   const session = await createGateSession(ort, '/prescreen/meme_power_gate.onnx');
 *   const res = await runGate(alignmentString, newickString, session, ort.Tensor);
 *   // -> { tier, gate_score, num_seqs, num_sites, median_pos_dist, frac_p_defined,
 *   //      recommend_full_meme }
 */

// ---------------------------------------------------------------------------
// Feature extraction — mirrors lib/gate_features.py exactly.
// ---------------------------------------------------------------------------

/**
 * Parse a FASTA or NEXUS alignment string. Autodetects: leading '>' => FASTA.
 * Returns { taxa, seqs }. Mirrors gate_features.parse_alignment (py:22-62).
 * NOTE: no gzip handling here — DM3's canonicalFasta is already decompressed.
 */
export function parseAlignment(text) {
  const head = text.length ? text[0] : "";
  if (head === ">") {
    // FASTA
    const taxa = [];
    const seqs = [];
    let cur = [];
    const lines = text.split(/\r?\n/);
    for (let raw of lines) {
      const line = raw.trim();
      if (line.startsWith(">")) {
        if (cur.length) {
          seqs.push(cur.join(""));
          cur = [];
        }
        // taxa.append(line[1:].split()[0])
        const rest = line.slice(1).trim();
        taxa.push(rest.split(/\s+/)[0]);
      } else if (line) {
        cur.push(line);
      }
    }
    if (cur.length) seqs.push(cur.join(""));
    return { taxa, seqs };
  }

  // NEXUS
  const taxa = [];
  const seqs = [];
  let inTl = false;
  let inMx = false;
  const lines = text.split(/\r?\n/);
  for (let raw of lines) {
    const s = raw.trim();
    if (!s) continue;
    const u = s.toUpperCase();
    if (u.startsWith("TAXLABELS")) {
      inTl = true;
      continue;
    }
    if (inTl) {
      // s.replace("'","").replace(";","").split()
      const cleaned = s.replace(/'/g, "").replace(/;/g, "").trim();
      if (cleaned) {
        for (const tok of cleaned.split(/\s+/)) if (tok) taxa.push(tok);
      }
      if (s.endsWith(";")) inTl = false;
      continue;
    }
    if (u.startsWith("MATRIX")) {
      inMx = true;
      continue;
    }
    if (inMx) {
      if (s === ";" || s.endsWith(";")) {
        if (s !== ";") {
          seqs.push(s.slice(0, -1).trim());
        }
        inMx = false;
        continue;
      }
      seqs.push(s);
    }
  }
  return { taxa, seqs };
}

/**
 * Read a newick tree string; return { medDist, nTips }.
 * medDist = median of POSITIVE branch lengths (0.0 if none). NOT patristic.
 * Mirrors gate_features.parse_newick_distances (py:65-78).
 */
export function parseNewickDistances(nwk) {
  const s = (nwk || "").trim();
  const re = /:(-?\d+\.?\d*(?:[eE][-+]?\d+)?)/g;
  const bls = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    bls.push(parseFloat(m[1]));
  }
  const pos = bls.filter((b) => b > 0);
  const medDist = pos.length ? median(pos) : 0.0;
  // n_tips = nwk.count(",") + 1
  let commas = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ",") commas++;
  const nTips = commas + 1;
  return { medDist, nTips };
}

/**
 * numpy.median: average of the two middle elements for even-length arrays.
 */
export function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0.0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return a[mid];
  return (a[mid - 1] + a[mid]) / 2;
}

/**
 * Return the frozen feature vector [num_seqs, num_sites, median_pos_dist, frac_p_defined].
 * Mirrors gate_features.extract_gate_features (py:81-93).
 */
export function extractGateFeatures(alignmentText, newickText) {
  const { seqs: rawSeqs } = parseAlignment(alignmentText);
  const seqs = rawSeqs.filter((s) => s && s.length > 0);
  let numSeqs = seqs.length;
  const numSites = seqs.length ? Math.floor(seqs[0].length / 3) : 0; // codons
  const { medDist, nTips } = parseNewickDistances(newickText || "");
  if (numSeqs === 0) numSeqs = nTips; // fall back to tree tip count
  const fracPDefined = 1.0; // placeholder (only known post-MEME)
  return [numSeqs, numSites, medDist, fracPDefined];
}

// ---------------------------------------------------------------------------
// Model inference — ONNX Runtime (onnxruntime-web in the browser).
// ---------------------------------------------------------------------------

// The exported classifier emits a 2-column probabilities tensor; class 1 is P(MEME finds signal).
const PROB_OUTPUT = "probabilities";

/**
 * Create an ONNX InferenceSession for the gate model.
 * @param {object} ort - the onnxruntime module (onnxruntime-web or onnxruntime-node)
 * @param {string|ArrayBuffer|Uint8Array} model - URL/path or the raw .onnx bytes
 * @returns {Promise<object>} an InferenceSession
 */
export async function createGateSession(ort, model) {
  return await ort.InferenceSession.create(model);
}

/**
 * Score P(class 1) for a feature vector via the ONNX session.
 * @param {number[]} features - [num_seqs, num_sites, median_pos_dist, frac_p_defined]
 * @param {object} session - an ONNX InferenceSession
 * @param {Function} Tensor - the ORT Tensor constructor (ort.Tensor)
 * @returns {Promise<number>} P(class 1)
 */
export async function scoreGate(features, session, Tensor) {
  const input = new Tensor("float32", Float32Array.from(features), [1, features.length]);
  const feeds = { [session.inputNames[0]]: input };
  const out = await session.run(feeds);
  const probs = out[PROB_OUTPUT] ?? out[session.outputNames[session.outputNames.length - 1]];
  // probs.data is [P(class0), P(class1)] for the single input row.
  return Number(probs.data[1]);
}

/**
 * Assign a tier from a gate score. Mirrors prescreen.py:99-100,110-115.
 * GREEN >= green_thresh; RED < red_thresh; YELLOW in between.
 */
export function tierOf(score, greenThresh = 0.7, redThresh = 0.35) {
  if (score >= greenThresh) return "GREEN";
  if (score < redThresh) return "RED";
  return "YELLOW";
}

// ---------------------------------------------------------------------------
// Combined gate — the single entry point for DM3.
// ---------------------------------------------------------------------------

/**
 * Run the full gate on in-memory alignment + tree strings.
 * @param {string} alignmentText - FASTA or NEXUS alignment
 * @param {string} newickText - newick tree (with branch lengths)
 * @param {object} session - an ONNX InferenceSession (see createGateSession)
 * @param {Function} Tensor - the ORT Tensor constructor (ort.Tensor)
 * @param {{greenThresh?: number, redThresh?: number}} [opts]
 * @returns {Promise<object>} { tier, gate_score, num_seqs, num_sites, median_pos_dist,
 *   frac_p_defined, recommend_full_meme }
 */
export async function runGate(alignmentText, newickText, session, Tensor, opts = {}) {
  const greenThresh = opts.greenThresh ?? 0.7;
  const redThresh = opts.redThresh ?? 0.35;
  const features = extractGateFeatures(alignmentText, newickText);
  const score = await scoreGate(features, session, Tensor);
  const tier = tierOf(score, greenThresh, redThresh);
  return {
    tier,
    gate_score: score,
    num_seqs: features[0],
    num_sites: features[1],
    median_pos_dist: features[2],
    frac_p_defined: features[3],
    recommend_full_meme: tier !== "RED",
  };
}
