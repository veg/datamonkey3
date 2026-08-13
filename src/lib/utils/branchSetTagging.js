/**
 * Branch-set tagging, extracted from BranchSelector so it can be unit-tested without a DOM.
 *
 * Phylotree keeps set membership on the d3 hierarchy nodes as `node._selectionSet`, and
 * `tree.getNewick(annotator)` turns that into the `name{TEST}:0.1` tags HyPhy reads. The rule that
 * matters and is easy to get wrong: sets are MUTUALLY EXCLUSIVE, so assigning a branch that is
 * already in one set must MOVE its tag, never add a second. `tree.display.addToSet` enforces that
 * for the interactive tree; these helpers enforce the same thing for the list view and for the case
 * where no display exists yet.
 *
 * Note on shape: an earlier version of this code traversed `tree.json`. That property does not
 * exist on phylotree 2.2.1 — the tree is `tree.nodes`, a d3 hierarchy — so every one of those
 * traversals was dead code. These functions take the descendant ARRAY
 * (`tree.nodes.descendants()`), which keeps them free of both the DOM and phylotree itself.
 */

/** Name of a hierarchy node, tolerating both `{data:{name}}` and plain `{name}` shapes. */
export function branchNameOf(node) {
	if (!node) return '';
	return node.data?.name ?? node.name ?? '';
}

/** The set a branch currently belongs to, or '' when it is unassigned. */
export function branchSetOf(node) {
	return node?._selectionSet || '';
}

/**
 * Assign one branch to one set, or clear it when `setName` is falsy.
 *
 * @param {Array} nodes      descendants of the tree (tree.nodes.descendants())
 * @param {string} branchName name of the branch to change
 * @param {string} setName    target set, or '' / null to unassign
 * @param {string[]} allSets  every set name in play; their legacy per-set boolean flags are cleared
 *                            too, because generateTaggedNewick still falls back to reading them
 * @returns {boolean} whether a matching branch was found
 */
export function assignBranchToSet(nodes, branchName, setName, allSets = []) {
	if (!Array.isArray(nodes) || !branchName) return false;

	const node = nodes.find((n) => branchNameOf(n) === branchName);
	if (!node) return false;

	// Clear first, unconditionally: this is what makes reassignment a MOVE rather than an
	// accumulation, and it is the behaviour the tagged Newick depends on ({TEST,REFERENCE} on one
	// branch is not a thing HyPhy accepts).
	delete node._selectionSet;
	allSets.forEach((s) => {
		delete node[s];
	});

	if (setName) {
		node._selectionSet = setName;
	}
	return true;
}

/**
 * Rows for the list view, in tree order.
 *
 * The root is excluded: it has no branch, so there is nothing to tag. Unnamed nodes are excluded
 * for the same practical reason — a branch with no name cannot be identified in the Newick output,
 * so offering it in the list would produce an assignment that silently goes nowhere.
 *
 * @returns {Array<{name: string, set: string, isLeaf: boolean}>}
 */
export function listBranches(nodes) {
	if (!Array.isArray(nodes)) return [];

	return nodes
		.filter((n) => (n.depth ?? 0) > 0)
		.map((n) => ({
			name: branchNameOf(n),
			set: branchSetOf(n),
			isLeaf: !(n.children && n.children.length)
		}))
		.filter((row) => row.name);
}

/**
 * The `{SET}` suffix for a node, shared by the tree and list paths so both produce the same Newick.
 * Falls back to the legacy per-set boolean properties for trees tagged before `_selectionSet`.
 */
export function multiSetTag(node, allSets = []) {
	const direct = branchSetOf(node);
	if (direct) return `{${direct}}`;

	const legacy = allSets.filter((s) => node && node[s]);
	return legacy.length > 0 ? `{${legacy.join(',')}}` : '';
}
