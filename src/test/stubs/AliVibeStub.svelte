<script>
	// Stand-in for the AliVibe widget. AlignmentViewer only ever calls these three methods on it,
	// and getAlignment() is the one that matters: it is the edited alignment leaving the viewer.
	export let height = null;
	export let features = null;
	export let rows = [
		{ name: 'a', seq: 'ACGACG' },
		{ name: 'b', seq: 'ACGTTT' }
	];

	export function getAlignment() {
		return rows;
	}
	export function loadFasta() {}
	export function loadTree() {}
</script>

<div data-testid="alivibe-stub" data-height={height} data-features={features ? 'yes' : 'no'}></div>
