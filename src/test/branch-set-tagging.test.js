import { describe, it, expect } from 'vitest';
import * as phylotree from 'phylotree';
import {
	assignBranchToSet,
	branchSetOf,
	listBranches,
	multiSetTag
} from '../lib/utils/branchSetTagging.js';

const NEWICK = '((A:0.1,B:0.2)AB:0.3,(C:0.1,D:0.2)CD:0.3)root;';
const SETS = ['TEST', 'REFERENCE'];

/** A real phylotree, no DOM: only `render()` touches the document. */
function makeTree() {
	const tree = new phylotree.phylotree(NEWICK);
	return { tree, nodes: tree.nodes.descendants() };
}

function taggedNewick(tree) {
	return tree.getNewick((node) => multiSetTag(node, SETS));
}

describe('assignBranchToSet', () => {
	it('tags exactly the assigned branches in the Newick', () => {
		const { tree, nodes } = makeTree();

		expect(assignBranchToSet(nodes, 'A', 'TEST', SETS)).toBe(true);
		expect(assignBranchToSet(nodes, 'CD', 'REFERENCE', SETS)).toBe(true);

		const out = taggedNewick(tree);
		expect(out).toContain('A{TEST}');
		expect(out).toContain('CD{REFERENCE}');
		// And nothing else picked up a tag.
		expect(out.match(/\{/g)).toHaveLength(2);
		expect(out).toContain('B:0.2');
	});

	it('MOVES a tag on reassignment instead of accumulating two', () => {
		const { tree, nodes } = makeTree();

		assignBranchToSet(nodes, 'A', 'TEST', SETS);
		assignBranchToSet(nodes, 'A', 'REFERENCE', SETS);

		const out = taggedNewick(tree);
		expect(out).toContain('A{REFERENCE}');
		expect(out).not.toContain('{TEST}');
		expect(out).not.toContain('{TEST,REFERENCE}');
		expect(out.match(/\{/g)).toHaveLength(1);
	});

	it('clears a branch when the target set is empty', () => {
		const { tree, nodes } = makeTree();

		assignBranchToSet(nodes, 'A', 'TEST', SETS);
		assignBranchToSet(nodes, 'A', '', SETS);

		expect(taggedNewick(tree)).not.toContain('{');
		expect(branchSetOf(nodes.find((n) => n.data.name === 'A'))).toBe('');
	});

	it('clears legacy per-set boolean flags so they cannot resurrect a stale tag', () => {
		const { tree, nodes } = makeTree();
		const a = nodes.find((n) => n.data.name === 'A');

		// How sets were recorded before _selectionSet existed. multiSetTag still reads these as a
		// fallback, so merely SETTING _selectionSet on top would mask the stale flag rather than
		// remove it — and unassigning the branch later would resurrect the old tag.
		a.TEST = true;
		expect(taggedNewick(tree)).toContain('A{TEST}');

		assignBranchToSet(nodes, 'A', 'REFERENCE', SETS);
		expect(taggedNewick(tree)).toContain('A{REFERENCE}');

		assignBranchToSet(nodes, 'A', '', SETS);
		expect(taggedNewick(tree)).not.toContain('{');
	});

	it('reports a miss for an unknown branch name and changes nothing', () => {
		const { tree, nodes } = makeTree();
		expect(assignBranchToSet(nodes, 'NOT_A_BRANCH', 'TEST', SETS)).toBe(false);
		expect(taggedNewick(tree)).not.toContain('{');
	});
});

describe('listBranches', () => {
	it('lists every named branch except the root, with its current set', () => {
		const { nodes } = makeTree();
		assignBranchToSet(nodes, 'B', 'TEST', SETS);

		const rows = listBranches(nodes);
		const names = rows.map((r) => r.name);

		expect(names).not.toContain('root');
		expect(names).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D', 'AB', 'CD']));
		expect(rows.find((r) => r.name === 'B').set).toBe('TEST');
		expect(rows.find((r) => r.name === 'A').set).toBe('');
		expect(rows.find((r) => r.name === 'A').isLeaf).toBe(true);
		expect(rows.find((r) => r.name === 'AB').isLeaf).toBe(false);
	});

	it('survives a tree that has not been parsed', () => {
		expect(listBranches(null)).toEqual([]);
		expect(listBranches(undefined)).toEqual([]);
	});
});
