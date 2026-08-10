/**
 * xgbEnsemble.js — the entire browser-side runtime for the MEME hit-likelihood gate.
 *
 * It reads XGBoost's OWN `Booster.save_model()` output (meme_gate.json) and walks it. There is no
 * converter in this pipeline any more: the bytes the ML team exports are the bytes this file
 * parses. The previous shape — sklearn -> an interchange graph -> a converter script -> a
 * coefficient table -> a JS walker — had four hops where the contract could drift, and it drifted
 * twice in three days (the exported classifier node silently became a regressor plus a sigmoid; the
 * monotone HistGBM would not export at all, so the shipped model was a different model family from
 * the validated one). That whole limb is deleted, which is why a repo-wide grep for the old
 * interchange format now comes back empty — see scripts/prescreen/verify_parity.py --self-test.
 *
 * The cost of removing the converter is that this file now has to do the converter's other job:
 * REFUSING a model it does not understand. A converter fails at build time when it meets an
 * unsupported construct. A walker that just walks will happily produce a confident, wrong number.
 * So `prepareXgbModel` validates before it compiles, and every check below throws rather than
 * degrades. See "WHAT THIS REFUSES" for the list and the reason each one is not paranoia.
 *
 * Verified against xgboost 3.4.0's own `Booster.inplace_predict` on the shipped meme_gate.json.
 * EVERY NUMBER BELOW IS PRINTED BY A COMMAND IN THIS REPO — none of them is a remembered figure
 * from a run nobody can reproduce, which is the failure mode a file like this one is most prone to:
 *
 *   scripts/prescreen/verify_parity.py
 *     5,532 vectors — a 2,520-point grid, 3,000 real production feature rows and 12 adversarial /
 *     on-threshold rows — agree to max |Δ| = 4.409e-07 with ZERO band disagreements. (The corpus
 *     third needs MEME_VALIDATION_TSV; without it the run is 2,532 vectors and says so.)
 *   scripts/prescreen/verify_parity.py --boundary
 *     4,799 rows with at least one feature sitting EXACTLY on one of this model's own split
 *     thresholds: max |Δ| = 4.106e-07, zero band disagreements. See the note on `<` in evalXgbModel.
 *
 * The residual is float32 (XGBoost accumulates leaf values in float32) vs float64 (we accumulate
 * in float64). It cannot move a user-visible band: verify_parity.py asserts the band agreement
 * rather than the delta, and reports how close any score comes to a cut (4.474e-04, three orders
 * above the delta) so that margin is a measurement rather than an assumption.
 */

/** Frozen feature contract. Must match FEATURE_NAMES in hitLikelihoodModel.js and the sidecar. */
export const EXPECTED_FEATURES = ['num_seqs', 'num_sites', 'median_pos_dist'];
export const EXPECTED_FEATURE_COUNT = EXPECTED_FEATURES.length;

/** The only booster / objective this walker implements. Anything else is refused, not approximated. */
const SUPPORTED_BOOSTER = 'gbtree';
const SUPPORTED_OBJECTIVE = 'binary:logistic';

/**
 * XGBoost format major versions whose gbtree JSON layout this walker has been verified against.
 *
 * THE LOWER BOUND IS NOT TIDINESS, IT IS THE base_score SEMANTICS. Before XGBoost 2.0,
 * `learner_model_param.base_score` was serialised in MARGIN space — the exporter had already
 * applied the objective's ProbToMargin — while 2.x and 3.x write the untransformed PROBABILITY and
 * apply the link at load. This walker takes it as a probability and computes `log(p / (1 - p))`
 * itself (see prepareXgbModel), so on a 1.x export it would logit an already-logitted number.
 *
 * That is the worst shape a bug can have here: it scores WITHOUT ERROR and WRONGLY, on the one
 * field that shifts every score in the model. It is also only half-caught by parseBaseScore's
 * (0, 1) range check — a 1.x binary:logistic default saves margin 0, which is refused, but any
 * margin that happens to land inside (0, 1) is accepted and silently rescales the whole model.
 * Measured: a doc labelled [1, 7, 6] with base_score "0.3" scores [50, 200, 0.02] at 0.6135
 * ('uncertain') where the shipped model gives 0.9551 ('likely') — a band move on a live input.
 *
 * scripts/prescreen/verify_parity.py's contract check has always refused version < 2 for exactly
 * this reason. The browser is the only place that actually loads a model, so it must not be the
 * weaker of the two. Widening this range means re-running that gate against the new export first.
 */
const SUPPORTED_FORMAT_MAJORS = [2, 3];

const fail = (msg) => {
	throw new Error(`meme_gate.json: ${msg}`);
};

// ---------------------------------------------------------------------------
// Lazy load
// ---------------------------------------------------------------------------

let _modelPromise = null;

/**
 * Load + validate + compile the shipped booster. Memoised: at most one fetch and one validation
 * pass per page.
 *
 * Two things about this one line are load-bearing.
 *
 * DYNAMIC. It is the only reference to meme_gate.json anywhere in the app, and it is inside a
 * function. Rollup therefore emits the model as its own chunk
 * (_app/immutable/chunks/meme_gate.<hash>.js) and nothing fetches it until something scores. A user
 * who selects BUSTED transfers zero estimator bytes; e2e/18 asserts that by summing response
 * bodies, not by looking for elements.
 *
 * `?raw`. This is what makes "the bytes the ML team exports are the bytes the browser parses"
 * literally true rather than nearly true. Vite's DEFAULT JSON handling re-serialises the file at
 * build time (`JSON.stringify(JSON.parse(src))`): 38,184 of the model's 98,972 numeric tokens come
 * out reformatted — `-3.8970377E-2` becomes `-0.038970377` — and the chunk is 52,008 bytes smaller
 * than the file. That transform is value-preserving (verified: 0 bit-differences across all 96,964
 * numbers) but it is still a re-encode of the artifact, performed by a bundler upgrade away from
 * anyone's attention, on the one file this whole change exists to stop transforming. `?raw` hands
 * us the file's exact bytes as a string and we parse them ourselves; the emitted chunk is the
 * 735,876-byte file verbatim inside a 33-byte wrapper (`const E='…';export{E as default};` —
 * esbuild quotes with `'`, so the JSON's own `"` need no escaping). That means the sha256 the
 * parity gate pins is a hash of the bytes the browser actually parses, not of a sibling of them.
 *
 * Cost of `?raw`: one JSON.parse at runtime, measured at 7 ms for this file (a JS object literal
 * would have to be parsed by the JS parser instead, which is slower — see V8's "cost of JSON").
 *
 * @returns {Promise<PreparedModel>}
 */
export async function loadXgbModel() {
	if (!_modelPromise) {
		_modelPromise = import('./meme_gate.json?raw').then((m) => prepareXgbModel(JSON.parse(m.default)));
	}
	return _modelPromise;
}

/** Drop the memoised model — test hook only. */
export function _resetXgbModel() {
	_modelPromise = null;
}

// ---------------------------------------------------------------------------
// base_score
// ---------------------------------------------------------------------------

/** A JSON number, in the forms XGBoost's float-to-string actually emits. No hex, no Infinity. */
const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parse `learner_model_param.base_score`.
 *
 * XGBoost has shipped this field in two forms and both are in the wild:
 *   - a plain JSON number, e.g. `0.5`   (some 2.x writers)
 *   - a BRACKETED STRING, e.g. `"[8.516667E-1]"`  (what 3.4 writes, and what the shipped file has)
 * Both are read as a PROBABILITY. That is only correct from XGBoost 2 onwards, which is why
 * SUPPORTED_FORMAT_MAJORS refuses 1.x before this function is ever reached — see the note there.
 * The bracketed form is the trap that got the ML team's own walker: `parseFloat("[8.5e-1]")` is
 * NaN, and a NaN base makes every score NaN — which at least is loud — but `Number("[8.5e-1]")`
 * is also NaN while `parseFloat("8.5e-1]")` is 0.85, so a half-hearted strip silently works by
 * accident on some strings and not others. Hence: strip, then require the remainder to be a
 * complete number, and reject anything that is not.
 *
 * `parseFloat` is deliberately NOT used anywhere here — it stops at the first bad character and
 * returns a plausible prefix, which is precisely the silent-wrong-answer behaviour being removed.
 *
 * The multi-element bracketed form (`"[0.3,0.3,0.4]"`) is the multi-class / multi-target intercept.
 * It is refused here as well as by the num_class check, because two independent refusals are what
 * you want on the one field that scales every score in the model.
 *
 * @param {unknown} raw
 * @returns {number} the base score as a PROBABILITY (XGBoost stores the intercept in probability
 *   space and applies the objective's link when boosting; for binary:logistic that link is logit)
 */
export function parseBaseScore(raw) {
	let value;
	if (typeof raw === 'number') {
		value = raw;
	} else if (typeof raw === 'string') {
		const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
		if (inner.includes(',')) {
			fail(`base_score has ${inner.split(',').length} components (${raw}) — this walker scores a single-output binary model only`);
		}
		if (!NUMERIC_RE.test(inner)) {
			fail(`base_score ${JSON.stringify(raw)} is not a number this walker will guess at`);
		}
		value = Number(inner);
	} else {
		fail(`base_score is ${raw === undefined ? 'missing' : typeof raw} — expected a number or a bracketed numeric string`);
	}
	if (!Number.isFinite(value)) fail(`base_score ${JSON.stringify(raw)} is not finite`);
	// The margin is log(p / (1 - p)); 0 and 1 make it infinite and would saturate every score.
	if (!(value > 0 && value < 1)) {
		fail(`base_score ${value} is outside (0, 1) — binary:logistic stores a probability here`);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Validation + compile
// ---------------------------------------------------------------------------

/**
 * WHAT THIS REFUSES, and why each refusal is load-bearing rather than defensive decoration.
 *
 * Every item below is a construct that this walker would score WITHOUT ERROR and WRONGLY. That is
 * the whole hazard class: a researcher reading "unlikely to find sites" has no way to tell a
 * correct 0.19 from a 0.19 produced by summing the wrong output group.
 *
 *  - booster != gbtree           `dart` scales each tree by a dropout weight that lives outside
 *                                the tree arrays; summing raw leaves gives a systematically
 *                                inflated margin. `gblinear` has no `trees` key at all.
 *  - objective != binary:logistic  The link is objective-specific. `reg:squarederror` needs NO
 *                                sigmoid, `count:poisson` needs exp, `rank:pairwise` has no
 *                                probability meaning at all — and all three would come out of a
 *                                sigmoid as a number in [0,1] that looks exactly like a
 *                                probability. `binary:logitraw` is the same tree table with the
 *                                sigmoid already the caller's job.
 *  - num_class not 0/1           multi:softprob interleaves K trees per boosting round; a naive
 *                                walk sums all K groups into one margin. The result is a
 *                                plausible-looking number with no meaning.
 *  - tree_info not all 0         The same failure detected structurally rather than from a
 *                                declared field. Both are checked: a hand-edited or
 *                                partially-written file can have one without the other.
 *  - num_parallel_tree != 1      Random-forest mode: trees within a round are AVERAGED, not
 *                                summed. Summing n_estimators * num_parallel_tree leaves
 *                                overshoots by exactly the factor nobody would notice.
 *  - size_leaf_vector != 1       Vector-leaf (multi-output) trees pack k values per leaf; the leaf
 *                                value is then no longer `split_conditions[i]` and every leaf read
 *                                is off by a stride.
 *  - any categorical split       A categorical node stores a BITSET in `categories` and
 *                                `split_conditions[i]` is an index into `categories_segments`, not
 *                                a threshold. Comparing a feature value against that index is
 *                                nonsense that still routes somewhere. Checked twice — `split_type`
 *                                per node AND the `categories_nodes` array — because a file can
 *                                carry one and not the other.
 *  - feature arity mismatch      Silent in BOTH directions. A 4-wide row into a 3-feature model
 *                                scores identically to a 3-wide one (the extra slot is never
 *                                indexed). A 3-wide row into a 4-feature model routes every split
 *                                on the missing feature by `undefined < threshold`, which is
 *                                false, i.e. consistently down the right child. Neither errors.
 *  - feature_names disagree      If the exporter recorded names, a reordered training frame is
 *                                caught for free. Reordered features produce a fully valid model
 *                                that scores confident nonsense. (This model ships with the array
 *                                empty, so this check is dormant here — it is written now so a
 *                                future export that DOES carry names is checked, rather than
 *                                needing someone to notice and add it.)
 *  - malformed tree topology     Cycles hang the browser; a child index past the end reads
 *                                `undefined` and compares false forever. Both are cheap to prove
 *                                absent once, at load, and impossible to check for free in the
 *                                hot loop.
 *  - format major outside 2..3   BELOW: a 1.x export writes base_score as a MARGIN, so the logit
 *                                below is applied to an already-logitted number and every score in
 *                                the model shifts — silently, and past the (0, 1) guard whenever
 *                                the margin happens to land inside (0, 1). ABOVE: a future XGBoost
 *                                that changes the gbtree layout should stop this walker rather than
 *                                be walked with the old assumptions. See SUPPORTED_FORMAT_MAJORS.
 *
 * @param {object} doc - the parsed meme_gate.json, verbatim
 * @returns {PreparedModel}
 */
export function prepareXgbModel(doc) {
	if (!doc || typeof doc !== 'object') fail('not an object');

	// --- format version ------------------------------------------------------
	const version = doc.version;
	if (!Array.isArray(version) || typeof version[0] !== 'number') {
		fail('no `version` array — this does not look like XGBoost save_model() output');
	}
	if (!SUPPORTED_FORMAT_MAJORS.includes(version[0])) {
		fail(
			`written by XGBoost ${version.join('.')}; this walker is verified against major versions ` +
				`${SUPPORTED_FORMAT_MAJORS.join('/')}. Re-run scripts/prescreen/verify_parity.py against ` +
				`the new version and widen SUPPORTED_FORMAT_MAJORS if it passes.`
		);
	}

	const learner = doc.learner;
	if (!learner || typeof learner !== 'object') fail('no `learner` object');

	// --- booster + objective -------------------------------------------------
	const gb = learner.gradient_booster;
	if (!gb || gb.name !== SUPPORTED_BOOSTER) {
		fail(`booster is ${JSON.stringify(gb?.name)}, this walker implements ${SUPPORTED_BOOSTER} only`);
	}
	const objective = learner.objective?.name;
	if (objective !== SUPPORTED_OBJECTIVE) {
		fail(
			`objective is ${JSON.stringify(objective)}, this walker implements ${SUPPORTED_OBJECTIVE} ` +
				`only — the output transform is objective-specific and a wrong one still returns a ` +
				`number in [0, 1]`
		);
	}

	// --- learner_model_param -------------------------------------------------
	const lmp = learner.learner_model_param ?? {};
	const numClass = intField(lmp.num_class, 'num_class');
	// XGBoost writes 0 for binary/regression; some writers use 1 for the same thing.
	if (numClass > 1) {
		fail(`num_class=${numClass} — multi-class models interleave one tree group per class and this walker sums a single group`);
	}
	const numTarget = lmp.num_target === undefined ? 1 : intField(lmp.num_target, 'num_target');
	if (numTarget !== 1) fail(`num_target=${numTarget} — multi-output models are not scored here`);

	const numFeature = intField(lmp.num_feature, 'num_feature');
	if (numFeature !== EXPECTED_FEATURE_COUNT) {
		fail(
			`model takes ${numFeature} features, this build of DM3 extracts ${EXPECTED_FEATURE_COUNT} ` +
				`(${EXPECTED_FEATURES.join(', ')}) — a mismatch scores silently in both directions`
		);
	}

	// Free check, dormant on this export (feature_names is []), live the moment anyone exports
	// with a named DataFrame. A reordered frame is otherwise undetectable from the model alone.
	const names = learner.feature_names;
	if (Array.isArray(names) && names.length) {
		if (names.length !== EXPECTED_FEATURE_COUNT || names.some((n, i) => n !== EXPECTED_FEATURES[i])) {
			fail(`feature_names ${JSON.stringify(names)} != ${JSON.stringify(EXPECTED_FEATURES)} — feature ORDER is frozen`);
		}
	}
	const types = learner.feature_types;
	if (Array.isArray(types) && types.some((t) => t !== 'float' && t !== 'int' && t !== 'q' && t !== 'i')) {
		fail(`feature_types ${JSON.stringify(types)} include a non-numeric type`);
	}

	const baseProb = parseBaseScore(lmp.base_score);

	// --- gbtree model params -------------------------------------------------
	const model = gb.model ?? {};
	const gbp = model.gbtree_model_param ?? {};
	const numParallelTree = gbp.num_parallel_tree === undefined ? 1 : intField(gbp.num_parallel_tree, 'num_parallel_tree');
	if (numParallelTree !== 1) {
		fail(`num_parallel_tree=${numParallelTree} — forest mode AVERAGES trees within a round, this walker sums them`);
	}

	/**
	 * DROPOUT. This one is not hypothetical and the obvious check does not catch it.
	 *
	 * In xgboost 3.4 `booster='dart'` is DEPRECATED IN NAME ONLY: dropout moved onto the ordinary
	 * tree booster as the `rate_drop` / `skip_drop` / `one_drop` parameters, and the export writes
	 *   gradient_booster.name === "gbtree"
	 * exactly like a normal model. The only trace is a per-tree multiplier array at
	 * gradient_booster.model.weight_drop, which XGBoost applies AT PREDICT TIME.
	 *
	 * So a `name === 'gbtree'` check — the obvious one, and the one this walker had first — passes
	 * a dropout model straight through. Measured on a real 3.4 export (8 rounds, rate_drop=0.2,
	 * weight_drop ranging 0.30..1.0): summing leaves without the multipliers is wrong by up to
	 * 0.176 in probability; applying them reproduces XGBoost to 8.2e-08. That is a silently wrong
	 * answer of exactly the size that changes which band a researcher is shown.
	 *
	 * Refused rather than implemented, on the same principle as default_left: multiplying by
	 * weight_drop is a one-line change, but it would be an untested line supporting a model family
	 * nobody has shipped. When someone ships one, this throw is the conversation.
	 * The shipped meme_gate.json has no weight_drop key at all.
	 */
	const weightDrop = model.weight_drop;
	if (Array.isArray(weightDrop) && weightDrop.some((w) => w !== 1)) {
		fail(
			`carries per-tree dropout weights (weight_drop, ${weightDrop.length} entries, min ` +
				`${Math.min(...weightDrop)}) — this is a DART/rate_drop model and xgboost 3.4 still ` +
				`labels it "gbtree". Summing its leaves unweighted is wrong by ~0.2 in probability.`
		);
	}

	const rawTrees = model.trees;
	if (!Array.isArray(rawTrees) || rawTrees.length === 0) fail('no trees');
	if (gbp.num_trees !== undefined && intField(gbp.num_trees, 'num_trees') !== rawTrees.length) {
		fail(`gbtree_model_param.num_trees=${gbp.num_trees} but ${rawTrees.length} trees are present`);
	}

	const treeInfo = model.tree_info;
	if (Array.isArray(treeInfo)) {
		if (treeInfo.length !== rawTrees.length) fail('tree_info length != number of trees');
		const group = treeInfo.find((g) => g !== 0);
		if (group !== undefined) {
			fail(`tree_info contains output group ${group} — more than one tree group means multi-class/multi-output`);
		}
	}

	/**
	 * Model-level categorical encoding table. Checked for CONTENT, not presence: xgboost 3.4 writes
	 * `cats: {enc: [], feature_segments: [], sorted_idx: []}` on a purely numerical model (the
	 * shipped file has exactly that) but writes one `enc` entry PER FEATURE on a categorical one,
	 * most of them empty. `enc.length > 0` would therefore be both a false alarm and, on a
	 * hypothetical writer that always emits placeholders, a missed catch.
	 */
	const cats = model.cats;
	if (cats && Array.isArray(cats.enc) && cats.enc.some((e) => Array.isArray(e?.values) && e.values.length)) {
		fail('model carries a categorical encoding table (cats.enc) — categorical splits are not implemented');
	}

	// --- per tree ------------------------------------------------------------
	const trees = rawTrees.map((t, ti) => compileTree(t, ti, numFeature));

	let maxDepth = 0;
	let nodes = 0;
	let leaves = 0;
	let defaultLeftNodes = 0;
	for (const t of trees) {
		maxDepth = Math.max(maxDepth, t.depth);
		nodes += t.left.length;
		leaves += t.leaves;
		defaultLeftNodes += t.defaultLeftNodes;
	}

	return {
		/** logit(base_score) — the margin every tree's leaf sum is added to. */
		base: Math.log(baseProb / (1 - baseProb)),
		trees: trees.map((t) => ({ feat: t.feat, thr: t.thr, left: t.left, right: t.right })),
		meta: {
			xgboostFormatVersion: version.join('.'),
			objective,
			booster: gb.name,
			baseScore: baseProb,
			features: EXPECTED_FEATURES.slice(),
			nTrees: trees.length,
			nNodes: nodes,
			nLeaves: leaves,
			maxDepth,
			/**
			 * How many interior nodes route MISSING input left. Reported, never acted on: this
			 * walker refuses non-finite input rather than implementing default_left (see
			 * evalXgbModel). Surfacing the count means a retrain that starts relying on
			 * missingness is visible in a diff of the parity report instead of invisible.
			 */
			defaultLeftNodes,
			splitCountsByFeature: countSplits(trees, numFeature)
		}
	};
}

function intField(raw, name) {
	// These are strings in XGBoost's JSON ("0", "3"); accept numbers too.
	const n = typeof raw === 'number' ? raw : typeof raw === 'string' && NUMERIC_RE.test(raw.trim()) ? Number(raw) : NaN;
	if (!Number.isInteger(n)) fail(`${name} is ${JSON.stringify(raw)}, expected an integer`);
	return n;
}

function countSplits(trees, numFeature) {
	const counts = new Array(numFeature).fill(0);
	for (const t of trees) for (let i = 0; i < t.left.length; i++) if (t.left[i] !== -1) counts[t.feat[i]]++;
	return Object.fromEntries(EXPECTED_FEATURES.map((n, i) => [n, counts[i]]));
}

/**
 * Validate one tree and pack it into typed arrays.
 *
 * XGBoost's per-tree layout, all parallel arrays indexed by node id:
 *   left_children[i] / right_children[i]   child node ids, or -1 on a leaf (BOTH are -1)
 *   split_indices[i]                       feature index, on interior nodes
 *   split_conditions[i]                    THRESHOLD on an interior node, LEAF VALUE on a leaf.
 *                                          One array, two meanings, discriminated only by
 *                                          left_children[i] === -1. Reading it as a threshold on a
 *                                          leaf, or vice versa, is silent.
 *   default_left[i]                        where a MISSING value routes (see evalXgbModel)
 *   split_type[i]                          0 numerical, 1 categorical
 */
function compileTree(t, ti, numFeature) {
	const where = `tree ${ti}`;
	const left = t.left_children;
	const right = t.right_children;
	const feat = t.split_indices;
	const cond = t.split_conditions;
	for (const [name, arr] of [
		['left_children', left],
		['right_children', right],
		['split_indices', feat],
		['split_conditions', cond]
	]) {
		if (!Array.isArray(arr)) fail(`${where}: ${name} is not an array`);
	}
	const n = left.length;
	if (n === 0) fail(`${where}: empty`);
	if (right.length !== n || feat.length !== n || cond.length !== n) {
		fail(`${where}: node arrays disagree in length (${n}/${right.length}/${feat.length}/${cond.length})`);
	}
	const declared = t.tree_param?.num_nodes;
	if (declared !== undefined && intField(declared, `${where} tree_param.num_nodes`) !== n) {
		fail(`${where}: tree_param.num_nodes=${declared} but ${n} nodes present`);
	}
	if (t.tree_param?.size_leaf_vector !== undefined && intField(t.tree_param.size_leaf_vector, `${where} size_leaf_vector`) !== 1) {
		fail(`${where}: size_leaf_vector=${t.tree_param.size_leaf_vector} — vector leaves change the meaning of split_conditions`);
	}
	if (t.tree_param?.num_feature !== undefined && intField(t.tree_param.num_feature, `${where} num_feature`) !== numFeature) {
		fail(`${where}: tree_param.num_feature disagrees with learner_model_param.num_feature`);
	}

	// Categorical splits — refused twice, from two independent fields.
	if (Array.isArray(t.categories_nodes) && t.categories_nodes.length) {
		fail(`${where}: ${t.categories_nodes.length} categorical split node(s) — not implemented`);
	}
	if (Array.isArray(t.categories) && t.categories.length) fail(`${where}: non-empty categories bitset`);
	// Hoisted out of the loop: these are per-tree facts, and re-deriving them per node made this
	// validation pass ~9x slower than the DFS it precedes.
	const splitType = Array.isArray(t.split_type) ? t.split_type : null;
	const defaultLeft = Array.isArray(t.default_left) ? t.default_left : null;

	let leaves = 0;
	let defaultLeftNodes = 0;
	for (let i = 0; i < n; i++) {
		const l = left[i];
		const r = right[i];
		const isLeaf = l === -1;
		if (isLeaf !== (r === -1)) {
			fail(`${where}: node ${i} has one child set to -1 and one not (${l}/${r})`);
		}
		if (!Number.isFinite(cond[i])) fail(`${where}: node ${i} split_conditions is ${cond[i]}`);
		if (isLeaf) {
			leaves++;
			continue;
		}
		if (splitType !== null && splitType[i] !== 0) {
			fail(`${where}: node ${i} has split_type ${splitType[i]} (categorical) — not implemented`);
		}
		const f = feat[i];
		if (!Number.isInteger(f) || f < 0 || f >= numFeature) {
			fail(`${where}: node ${i} splits on feature ${f}, out of range for ${numFeature} features`);
		}
		// Child 0 would be the root, i.e. a cycle; >= n is off the end. The DFS below catches
		// cycles too, but only if the indices are safe to dereference first.
		if (!Number.isInteger(l) || l <= 0 || l >= n) fail(`${where}: node ${i} child index ${l} out of range`);
		if (!Number.isInteger(r) || r <= 0 || r >= n) fail(`${where}: node ${i} child index ${r} out of range`);
		if (defaultLeft !== null && defaultLeft[i]) defaultLeftNodes++;
	}

	// Prove it is a tree rooted at 0: every node reached exactly once, no cycles. That is what lets
	// evalXgbModel's walk loop have no depth counter and no bounds check in it — the hot path runs
	// ~4,500 iterations per score and the guarantee is bought once here instead. Measured at
	// 0.45 ms for the whole 500-tree model; flat Int32Array stacks rather than [i, depth] tuples
	// so it does not allocate 9,546 short-lived arrays per load.
	const seen = new Uint8Array(n);
	const stackNode = new Int32Array(n);
	const stackDepth = new Int32Array(n);
	let top = 0;
	stackNode[top] = 0;
	stackDepth[top] = 1;
	top = 1;
	let visited = 0;
	let depth = 0;
	while (top > 0) {
		top--;
		const i = stackNode[top];
		const d = stackDepth[top];
		if (seen[i]) fail(`${where}: node ${i} reachable by two paths — not a tree`);
		seen[i] = 1;
		visited++;
		if (d > depth) depth = d;
		if (left[i] !== -1) {
			// `top + 2 > n` can only happen if some node were pushed twice, which `seen` already
			// catches — but the array write must not run past the end before that check fires.
			if (top + 2 > n) fail(`${where}: node stack overflow — malformed topology`);
			stackNode[top] = left[i];
			stackDepth[top++] = d + 1;
			stackNode[top] = right[i];
			stackDepth[top++] = d + 1;
		}
	}
	if (visited !== n) fail(`${where}: ${n - visited} node(s) unreachable from the root`);

	return {
		feat: Int32Array.from(feat),
		// Round thresholds to float32 so a borderline comparison resolves the way XGBoost's
		// float32 comparison does. XGBoost writes them as float32 values printed to JSON; the
		// decimal round-trips, but fround makes that explicit rather than lucky.
		thr: Float64Array.from(cond, Math.fround),
		left: Int32Array.from(left),
		right: Int32Array.from(right),
		leaves,
		defaultLeftNodes,
		depth
	};
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * P(MEME reports at least one site at p <= 0.1) for one feature row.
 *
 * MISSING VALUES ARE REFUSED, NOT ROUTED — a deliberate choice, not an omission.
 *
 * XGBoost encodes `default_left` per interior node and routes NaN there. We do not implement it:
 *   1. There is no "missing" in this domain. The three features are geometry read off an
 *      alignment and a tree that both parsed. When they cannot be computed, the caller's domain
 *      guard returns status 'cannot-assess' — an explanation — rather than a row with a hole in it.
 *      A NaN arriving here therefore means feature extraction is broken, and the only correct
 *      response to that is an exception, not a probability.
 *   2. Implementing it would put a per-node NaN test on a hot loop that executes ~4,500 times per
 *      score, to support a path no test can legitimately reach and that would therefore rot. In
 *      THIS model every default_left is 0, i.e. missing routes RIGHT — the opposite of what the
 *      field's name suggests to a reader. Writing that branch, getting it backwards, and never
 *      exercising it is a very ordinary way to ship a silent bug.
 *   3. The refusal is the forcing function. If missingness ever becomes real (say a future model
 *      is trained with "no tree supplied" as a signal), this throw fires on day one and the
 *      default_left semantics get implemented and tested on purpose. `meta.defaultLeftNodes`
 *      exists so that change is visible in the parity report before anyone hits the throw.
 *
 * @param {PreparedModel} model
 * @param {number[]|Float64Array} features - [num_seqs, num_sites, median_pos_dist]
 * @returns {number} probability in (0, 1)
 */
export function evalXgbModel(model, features) {
	if (!features || features.length !== EXPECTED_FEATURE_COUNT) {
		fail(`scorer expects ${EXPECTED_FEATURE_COUNT} features, got ${features?.length}`);
	}
	// float32 round the INPUTS too: XGBoost compares a float32 feature against a float32
	// threshold. A float64 input that is a hair under a threshold can be a hair over it once
	// rounded, and that is a real routing difference, not noise.
	const x = new Float64Array(EXPECTED_FEATURE_COUNT);
	for (let f = 0; f < EXPECTED_FEATURE_COUNT; f++) {
		const v = features[f];
		if (typeof v !== 'number' || !Number.isFinite(v)) {
			fail(`feature ${EXPECTED_FEATURES[f]} is ${v} — non-finite input is a caller bug, not a missing value (see the note on default_left)`);
		}
		x[f] = Math.fround(v);
	}

	let margin = model.base;
	for (const t of model.trees) {
		const { feat, thr, left, right } = t;
		let i = 0;
		// STRICTLY LESS THAN. XGBoost's own predictor is `fvalue < split_value ? left : right`
		// (RegTree::Node::LeftChild is taken on <). `<=` would differ only for a value sitting
		// EXACTLY on a threshold — rare, never noticed in a random test, and wrong every time it
		// happens. Reproduce with `python3 scripts/prescreen/verify_parity.py --boundary`, which
		// builds 4,799 rows placed exactly on this model's own split values and walks them twice
		// over the same compiled trees, changing nothing but this operator: `<` agrees with xgboost
		// on all 4,799 (max |Δ| 4.106e-07, zero band moves), `<=` differs on 3,528 of them and
		// moves the user-visible band on 579. That mode exits non-zero if either half stops being
		// true, so the claim in this comment is a gate rather than a note.
		while (left[i] !== -1) i = x[feat[i]] < thr[i] ? left[i] : right[i];
		// The leaf VALUE, read out of split_conditions — same array as the thresholds.
		margin += thr[i];
	}
	return 1 / (1 + Math.exp(-margin));
}

/**
 * @typedef {object} PreparedModel
 * @property {number} base - logit(base_score)
 * @property {{feat: Int32Array, thr: Float64Array, left: Int32Array, right: Int32Array}[]} trees
 * @property {object} meta
 */
