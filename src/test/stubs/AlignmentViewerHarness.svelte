<script>
	// Thin harness so a test can observe the editsSaved event without depending on how the
	// testing-library version of the day exposes component events.
	import AlignmentViewer from '../../lib/AlignmentViewer.svelte';

	export let alignmentFile = null;
	export let onSaved = () => {};
</script>

<AlignmentViewer {alignmentFile} on:editsSaved={(e) => onSaved(e.detail)} />
