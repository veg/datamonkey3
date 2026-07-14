<script>
	import { onMount, afterUpdate, createEventDispatcher } from 'svelte';
	import * as phylotree from 'phylotree';
	import * as d3 from 'd3';
	// Removed hyphy-scope import - only using phylotree viewer

	export let newickString;
	export let height = 600;
	export let width = 800;
	export let branchTestMode = true;
	export let selectedBranches = [];
	export let viewerType = 'phylotree'; // Fixed to phylotree viewer
	export let selectable = true; // Enable/disable branch selection

	let treeContainer;
	let tree;
	let renderedTree;
	let selection_set = []; // For parsed tags
	let current_selection_id = 0; // Current active selection index
	// Removed hypyScopeData - not needed for phylotree viewer

	// Color scheme for different tags
	const color_scheme = d3.scaleOrdinal(d3.schemeCategory10);

	const dispatch = createEventDispatcher();

	onMount(() => {
		renderTree();
	});

	afterUpdate(() => {
		if (newickString) {
			renderTree();
		}
	});

	// Removed convertToHyphyScopeData - not needed for phylotree viewer

	// Node colorizer function that applies colors based on annotations/tags
	function nodeColorizer(element, data) {
		try {
			if (!data || !selection_set || selection_set.length === 0) {
				return;
			}

			let count_class = 0;
			// The structure might vary depending on the phylotree version, so we need to safely access it
			let annotation = null;

			// Different possible paths to annotation data
			if (data.annotation) {
				annotation = data.annotation;
			} else if (data.data && data.data.annotation) {
				annotation = data.data.annotation;
			}

			if (annotation) {
				selection_set.forEach(function (tag, i) {
					// Check if the node has this tag
					if (annotation === tag) {
						count_class++;
						element.style('fill', color_scheme(i), i === current_selection_id ? 'important' : null);
					}
				});
			}

			// If no tag was applied, reset the style
			if (count_class === 0) {
				element.style('fill', null);
			}
		} catch (e) {
			console.error('Error in nodeColorizer:', e);
		}
	}

	// Edge colorizer function that applies colors based on annotations/tags
	function edgeColorizer(element, data) {
		try {
			let count_class = 0;
			// The structure might vary depending on the phylotree version, so we need to safely access it
			let annotation = null;

			// Different possible paths to annotation data
			if (data.target && data.target.annotation) {
				annotation = data.target.annotation;
			} else if (data.target && data.target.data && data.target.data.annotation) {
				annotation = data.target.data.annotation;
			} else if (data.annotation) {
				annotation = data.annotation;
			}

			if (annotation && selection_set.length > 0) {
				selection_set.forEach(function (tag, i) {
					// Check if the target node has this tag
					if (annotation === tag) {
						count_class++;
						element.style(
							'stroke',
							color_scheme(i),
							i === current_selection_id ? 'important' : null
						);
					}
				});
			}

			// Handle multiple classes or reset style if needed
			if (count_class > 1) {
				element.classed('branch-multiple', true);
			} else if (count_class === 0) {
				element.style('stroke', null).classed('branch-multiple', false);
			}
		} catch (e) {
			console.error('Error in edgeColorizer:', e);
		}
	}

	function renderTree() {
		try {
			// Make sure we have a valid Newick string
			if (!newickString || newickString.trim() === '') {
				return;
			}

			// Always use phylotree rendering
			renderPhylotreeViewer();
		} catch (e) {
			console.error('Error in renderTree:', e);
		}
	}

	function renderPhylotreeViewer() {
		// Ensure we have a valid container
		if (!treeContainer) {
			return;
		}

		// Ensure newick string ends with semicolon (required by phylotree parser)
		let normalizedNewick = newickString.trim();
		if (!normalizedNewick.endsWith(';')) {
			normalizedNewick += ';';
		}

		// Initialize tree from Newick string
		tree = new phylotree.phylotree(normalizedNewick);

		// Check for parsed tags in the tree
		if (tree.parsed_tags && tree.parsed_tags.length) {
			selection_set = [...tree.parsed_tags];

			// Dispatch the parsed tags to the parent component using a timeout
			// to avoid the initial rendering error
			setTimeout(() => {
				try {
					dispatch('parsedtags', {
						parsed_tags: selection_set
					});
				} catch (dispatchError) {
					console.error('Error dispatching parsed tags:', dispatchError);
				}
			}, 0);

			// If we have tags and in branch test mode, update selections
			if (branchTestMode) {
				try {
					updateSelectedBranchesFromTags();
				} catch (updateError) {
					console.error('Error updating branches from tags:', updateError);
				}
			}
		}

		// Clear the container first
		treeContainer.innerHTML = '';

		// Render the tree with colorizers - use the specific container element
		renderedTree = tree.render({
			container: treeContainer,
			height: height,
			width: width,
			'left-right-spacing': 'fit-to-size',
			'top-bottom-spacing': 'fit-to-size',
			'show-menu': true, // Enable menu functionality
			selectable: selectable, // Enable/disable node selection
			collapsible: true, // Enable collapse/expand
			reroot: true, // Enable rerooting
			hide: true, // Enable hiding nodes
			'node-styler': nodeColorizer, // Apply node colorizer
			'edge-styler': edgeColorizer // Apply edge colorizer
		});

		// Append the SVG element
		if (treeContainer) {
			treeContainer.appendChild(renderedTree.show());

			// Add click handlers for the nodes
			d3.select(treeContainer)
				.selectAll('.node')
				.on('click', (event, d) => {
					event.preventDefault();
					renderedTree.handle_node_click(d, event);

					// If in branch test mode, update selected branches
					if (branchTestMode) {
						updateSelectedBranches();
					}
				});
		}
	}

	// Removed handleHyphyScopeParsedTags - not needed for phylotree viewer

	// Update selected branches based on the current tree selection
	function updateSelectedBranches() {
		if (renderedTree) {
			// Get current selection from tree
			const current_selection = renderedTree.get_selection();
			selectedBranches = current_selection.map((node) => {
				// Get node name or identifier
				return node.name || `node_${node.id}`;
			});

			// Generate tagged Newick string and dispatch event
			const taggedNewick = generateTaggedNewick();
			dispatch('branchselection', {
				selectedBranches,
				taggedNewick
			});
		}
	}

	// Generate Newick string with tags based on current selection
	function generateTaggedNewick() {
		if (!renderedTree) return '';

		// Get current selection
		const current_selection = renderedTree.get_selection();

		// Tag name based on the first selection set
		const tagName = selection_set.length > 0 ? selection_set[0] : 'TAG';

		// Generate Newick string with annotations
		return renderedTree.get_newick((node) => {
			if (current_selection.includes(node)) {
				return node.name + `{${tagName}}`;
			}
			return node.name;
		});
	}

	// Update selected branches based on existing tags in the tree
	function updateSelectedBranchesFromTags() {
		if (!tree || !selection_set.length) return;

		const nodesWithTags = [];

		// Traverse the tree and find nodes with tags that match the selection_set
		function traverseNodes(node) {
			if (node.annotation && selection_set.includes(node.annotation)) {
				nodesWithTags.push(node.name || `node_${node.id}`);

				// If using the renderedTree, we can also select these nodes
				if (renderedTree) {
					renderedTree.modify_selection(
						function (n) {
							return n.name === node.name;
						},
						'add',
						true, // rerender
						true // as_attr
					);
				}
			}

			if (node.children) {
				node.children.forEach((child) => traverseNodes(child));
			}
		}

		// Start traversal from root
		if (tree.json) {
			traverseNodes(tree.json);
		}

		// Update selected branches
		selectedBranches = nodesWithTags;

		// Dispatch the event with the tagged Newick (which is already tagged)
		dispatch('branchselection', {
			selectedBranches,
			taggedNewick: newickString
		});
	}
</script>

<!-- Always include phylotree CSS -->
<link rel="stylesheet" href="https://unpkg.com/phylotree@1.0.0-alpha.24/dist/phylotree.css" />

<!-- Tree viewer fixed to phylotree -->

<!-- Always use phylotree viewer -->
<div bind:this={treeContainer} class="tree-container"></div>

<style>
	/* Removed viewer-controls and hyphy-scope-container styles - not needed anymore */

	:global(.dropdown-menu) {
		position: absolute;
		background: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 5px 0;
		min-width: 160px;
		z-index: 1000;
	}

	:global(.dropdown-item) {
		display: block;
		padding: 3px 20px;
		clear: both;
		font-weight: normal;
		line-height: 1.42857143;
		color: #333;
		white-space: nowrap;
		cursor: pointer;
	}

	:global(.dropdown-item:hover) {
		background-color: #f5f5f5;
	}

	:global(.dropdown-divider) {
		height: 1px;
		margin: 5px 0;
		background-color: #e5e5e5;
	}

	:global(.dropdown-header) {
		display: block;
		padding: 3px 20px;
		font-size: 12px;
		line-height: 1.42857143;
		color: #777;
	}

	/* Styling for tagged nodes */
	:global(.tagged-node) {
		fill: #007bff;
		font-weight: bold;
	}

	:global(.tagged-node circle) {
		fill: #007bff;
		stroke: #0056b3;
		stroke-width: 2px;
	}

	/* Multiple tag styling */
	:global(.branch-multiple) {
		stroke-dasharray: 5, 3;
		stroke-width: 3px !important;
	}
</style>
