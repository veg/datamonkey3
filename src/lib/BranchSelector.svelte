<!--
	BranchSelector Component - Interactive phylogenetic tree branch selection
-->

<script>
	import { onMount, createEventDispatcher, tick } from 'svelte';
	import * as phylotree from 'phylotree';
	import * as d3 from 'd3';

	const dispatch = createEventDispatcher();

	// Props - Core
	export let treeData = '';
	export let height = 400;
	export let width = 800;

	// Props - Selection mode
	export let mode = 'single-set'; // 'single-set' for FG/BG, 'multi-set' for contrast-fel
	export let selectionMode = 'foreground'; // 'foreground' or 'background' - maps to mode for Storybook compatibility
	export let initialSetNames = null; // Optional: custom names for sets (e.g., ['TEST', 'REFERENCE'] for RELAX)

	// Props - Storybook compatibility
	export let selectedBranches = []; // Initial selection (array of branch names or objects with .name/.id)
	export let allowMultiSelect = true; // Allow multiple branch selection
	export let disabled = false; // Disable all interactions

	// Component state
	let treeContainer;
	let tree;
	let internalSelectedBranches = []; // Internal tracking of selection

	// Unique container ID to avoid conflicts
	let containerId = `tree-container-${Math.random().toString(36).substring(2, 9)}`;

	// Multi-set selection state (for contrast-fel) - Initialize based on mode
	let currentSetIndex = 0;
	let setColors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00']; // d3 category colors

	// Map selectionMode prop to internal mode (for Storybook compatibility)
	$: effectiveMode =
		mode !== 'single-set'
			? mode
			: selectionMode === 'multi-set'
				? 'multi-set'
				: 'single-set';

	// Reactive: Update selection sets when mode changes
	$: selectionSets =
		effectiveMode === 'multi-set'
			? initialSetNames && initialSetNames.length > 0
				? initialSetNames
				: ['Set1', 'Set2']
			: ['Foreground'];

	// Reset current index when mode changes
	$: if (effectiveMode) {
		currentSetIndex = 0;
	}

	onMount(() => {
		if (treeData) {
			renderTree();
		}
	});

	// Watch for tree data changes
	$: if (treeData && treeContainer) {
		renderTree();
	}

	// Apply preselection when selectedBranches prop changes
	$: if (tree && selectedBranches && selectedBranches.length > 0) {
		applyPreselection(selectedBranches);
	}

	// Extract branch names from selection prop (handles both string[] and {name/id}[])
	function getBranchName(branch) {
		if (typeof branch === 'string') return branch;
		return branch.name || branch.id || null;
	}

	// Apply initial selection to tree
	function applyPreselection(branches) {
		if (!tree?.display) return;

		const branchNames = branches.map(getBranchName).filter(Boolean);
		if (branchNames.length === 0) return;

		// Use phylotree's selectNodes API - handles styling automatically
		tree.display.selectNodes(branchNames);
		updateSelectedBranches();
	}

	// Multi-set management functions
	function addNewSet() {
		const newSetName = `Set_${selectionSets.length + 1}`;
		selectionSets = [...selectionSets, newSetName];
		currentSetIndex = selectionSets.length - 1;

		// Reinitialize phylotree selection sets with the new set
		if (tree?.display?.initializeSelectionSets) {
			tree.display.initializeSelectionSets(
				selectionSets.map((name, i) => ({
					name,
					color: setColors[i] || setColors[i % setColors.length]
				}))
			);
			tree.display.setActiveSet(newSetName);
		}
	}

	function deleteCurrentSet() {
		if (selectionSets.length <= 1) {
			alert('Cannot delete the only remaining set');
			return;
		}
		// Remove branches tagged with this set
		const setToDelete = selectionSets[currentSetIndex];
		if (tree && tree.json) {
			traverseAndRemoveSet(tree.json, setToDelete);
		}
		selectionSets = selectionSets.filter((_, i) => i !== currentSetIndex);
		currentSetIndex = Math.max(0, currentSetIndex - 1);

		// Reinitialize phylotree selection sets after deletion
		if (tree?.display?.initializeSelectionSets) {
			tree.display.initializeSelectionSets(
				selectionSets.map((name, i) => ({
					name,
					color: setColors[i] || setColors[i % setColors.length]
				}))
			);
			tree.display.setActiveSet(selectionSets[currentSetIndex]);
		}

		updateSelectedBranches();
	}

	function renameCurrentSet(newName) {
		const oldName = selectionSets[currentSetIndex];
		selectionSets[currentSetIndex] = newName;
		selectionSets = [...selectionSets];

		// Update all nodes with old set name to new name
		if (tree && tree.json) {
			traverseAndRenameSet(tree.json, oldName, newName);
		}

		// Reinitialize phylotree selection sets with renamed set
		if (tree?.display?.initializeSelectionSets) {
			tree.display.initializeSelectionSets(
				selectionSets.map((name, i) => ({
					name,
					color: setColors[i] || setColors[i % setColors.length]
				}))
			);
			tree.display.setActiveSet(newName);
		}

		updateSelectedBranches();
	}

	function switchToSet(index) {
		currentSetIndex = index;
		// Use phylotree's setActiveSet API
		if (tree?.display?.setActiveSet) {
			tree.display.setActiveSet(selectionSets[index]);
		}
	}

	function traverseAndRemoveSet(node, setName) {
		if (node[setName]) {
			delete node[setName];
		}
		if (node.children) {
			node.children.forEach((child) => traverseAndRemoveSet(child, setName));
		}
	}

	function traverseAndRenameSet(node, oldName, newName) {
		if (node[oldName]) {
			node[newName] = true;
			delete node[oldName];
		}
		if (node.children) {
			node.children.forEach((child) => traverseAndRenameSet(child, oldName, newName));
		}
	}

	// Note: updateNodeStyling removed - phylotree handles styling automatically
	// via CSS classes like .phylotree-set-branch-{setName}

	function renderTree() {
		try {
			// Make sure we have a valid Newick string
			if (!treeData || treeData.trim() === '') {
				console.log('BranchSelector: No tree data provided');
				return;
			}

			// Initialize tree from Newick string
			tree = new phylotree.phylotree(treeData);

			// Render the tree with multi-set options if in multi-set mode
			const renderOptions = {
				container: `#${containerId}`,
				height: height,
				width: width,
				'show-menu': true,
				selectable: true,
				collapsible: true,
				'left-right-spacing': 'fit-to-size',
				'top-bottom-spacing': 'fit-to-size'
			};

			// Add multi-set selection options
			if (effectiveMode === 'multi-set') {
				renderOptions['selection-mode'] = 'multi-set';
				renderOptions['selection-sets'] = selectionSets.map((name, i) => ({
					name,
					color: setColors[i] || setColors[i % setColors.length]
				}));
			}

			tree.render(renderOptions);

			// Set up setChange event listener for multi-set mode
			if (effectiveMode === 'multi-set' && tree.display?.on) {
				tree.display.on('setChange', () => {
					updateSelectedBranches();
				});
			}

			// Insert the SVG into the container
			const container = document.getElementById(containerId);
			if (container && tree.display) {
				container.innerHTML = '';
				const svgElement = tree.display.show();
				container.appendChild(svgElement);

				// Fix SVG sizing with viewBox for proper scaling
				const svg = container.querySelector('svg');
				if (svg) {
					// Wait for SVG to fully render before calculating bounds
					requestAnimationFrame(() => {
						try {
							const bbox = svg.getBBox();
							const padding = 20;
							svg.setAttribute(
								'viewBox',
								`${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`
							);
							svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
							// Make SVG fill container
							svg.style.width = '100%';
							svg.style.height = '100%';
						} catch (e) {
							// getBBox can fail if SVG not visible, ignore
						}
					});
				}

				// Set up click handlers if not disabled
				if (!disabled) {
					setupClickHandlers(container);
				}
			}
		} catch (e) {
			console.error('BranchSelector: Error rendering tree:', e);
			dispatch('error', { message: e.message, error: e });
		}
	}

	// Set up event listeners for branch selection
	function setupClickHandlers(container) {
		// Phylotree already has built-in click handlers on branches (in edges.js)
		// that call modifySelection() and update(). Instead of overwriting those,
		// we listen for selection changes via phylotree's event system.

		// Use phylotree's selectionCallback to track selection changes
		// This is called after every selection modification
		if (tree?.display?.selectionCallback) {
			tree.display.selectionCallback((selection) => {
				updateSelectedBranches();
			});
		}

		// Also listen for the selectionChange event (newer event system)
		if (tree?.display?.on) {
			tree.display.on('selectionChange', (selection) => {
				updateSelectedBranches();
			});
		}

		// For multi-set mode, also listen for setChange events
		if (effectiveMode === 'multi-set' && tree?.display?.on) {
			tree.display.on('setChange', () => {
				updateSelectedBranches();
			});
		}

		// Set cursor style to indicate clickability
		d3.select(container)
			.selectAll('.branch, path.branch, .node circle')
			.style('cursor', 'pointer');
	}

	// Clear all selections (for single-select mode)
	function clearAllSelections() {
		if (!tree?.display) return;

		// Use phylotree's clearSelection API
		tree.display.clearSelection();

		// Also clear multi-set selections if in multi-set mode
		if (effectiveMode === 'multi-set') {
			// Use phylotree's removeFromSet API if available
			if (tree.display.getSetMembers && tree.display.removeFromSet) {
				selectionSets.forEach((setName) => {
					const members = tree.display.getSetMembers(setName);
					members.forEach((node) => {
						tree.display.removeFromSet(node, setName);
					});
				});
			} else if (tree.json) {
				// Fallback: manually clear properties
				function traverse(node) {
					selectionSets.forEach((setName) => delete node[setName]);
					delete node._selectionSet;
					node.children?.forEach(traverse);
				}
				traverse(tree.json);
			}
		}
	}

	// Update selected branches and dispatch events
	function updateSelectedBranches() {
		if (!tree) return;

		let current_selection = [];

		if (effectiveMode === 'multi-set') {
			// Multi-set mode: use phylotree's getSetMembers API
			if (tree.display?.getSetMembers) {
				selectionSets.forEach((setName) => {
					const members = tree.display.getSetMembers(setName);
					members.forEach((node) => {
						if (!current_selection.includes(node)) {
							current_selection.push(node);
						}
					});
				});
			} else {
				// Fallback: manually traverse to find nodes in any set
				function findSelectedNodes(node) {
					if (node._selectionSet || selectionSets.some(s => node[s])) {
						if (!current_selection.includes(node)) {
							current_selection.push(node);
						}
					}
					node.children?.forEach(findSelectedNodes);
				}
				if (tree.json) {
					findSelectedNodes(tree.json);
				}
			}
		} else {
			// Single-set mode: use phylotree's getSelection API
			current_selection = tree.display?.getSelection() || [];
		}

		internalSelectedBranches = current_selection.map((node) => {
			return node.data?.name || node.name || `node_${node.id || Math.random()}`;
		});

		// Generate tagged Newick string
		const taggedNewick = generateTaggedNewick();

		const eventData = {
			selectedBranches: internalSelectedBranches,
			taggedNewick,
			count: current_selection.length,
			...(effectiveMode === 'multi-set' && {
				selectionSets: selectionSets,
				mode: 'multi-set'
			})
		};

		dispatch('selectionChange', eventData);
	}

	// Validation method similar to React version
	function validateAndSubmit(callback) {
		if (!tree) return;

		const taggedNewick = generateTaggedNewick();
		const selectedCount = internalSelectedBranches.length;

		if (selectedCount > 0) {
			callback(taggedNewick);
		} else {
			alert(
				'No branch selections were made. Please select at least one branch.'
			);
		}
	}

	// Expose method for external access (matching React submit pattern)
	export function submit(callback) {
		validateAndSubmit(callback);
	}

	// Generate Newick string with FG tags for selected branches
	function generateTaggedNewick() {
		if (!tree || !tree.getNewick) {
			return treeData;
		}

		try {
			// Try phylotree's built-in getTaggedNewick if available
			if (effectiveMode === 'multi-set' && tree.getTaggedNewick) {
				return tree.getTaggedNewick({ multiSet: true });
			}

			const taggedNewick = tree.getNewick((node) => {
				const tags = [];

				if (effectiveMode === 'multi-set') {
					// Check phylotree's _selectionSet property first
					if (node._selectionSet) {
						tags.push(node._selectionSet);
					} else {
						// Fallback: check manual properties
						selectionSets.forEach((setName) => {
							if (node[setName]) {
								tags.push(setName);
							}
						});
					}
				} else {
					if (node.selected) {
						tags.push('FG');
					}
					if (node.test) {
						tags.push('TEST');
					}
					if (node.reference) {
						tags.push('REFERENCE');
					}
				}

				return tags.length > 0 ? '{' + tags.join(',') + '}' : '';
			});

			return taggedNewick;
		} catch (e) {
			console.error('BranchSelector: Error generating tagged Newick:', e);
			return treeData;
		}
	}
</script>

<!-- Phylotree CSS - using version matching our npm package -->
<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/phylotree@2.2.1/dist/phylotree.css" />
</svelte:head>

<div class="branch-selector" class:disabled>
	<h3>Branch Selection</h3>

	{#if effectiveMode === 'multi-set'}
		<div class="set-management-controls">
			<div class="set-selector-group">
				<label for="{containerId}-set-selector">Current Set:</label>
				<select
					id="{containerId}-set-selector"
					bind:value={currentSetIndex}
					on:change={() => switchToSet(currentSetIndex)}
					style="color: {setColors[currentSetIndex]}; font-weight: bold;"
					{disabled}
				>
					{#each selectionSets as setName, index}
						<option value={index} style="color: {setColors[index]}">
							{setName}
						</option>
					{/each}
				</select>
			</div>

			<div class="set-name-input">
				<label for="{containerId}-set-name">Rename:</label>
				<input
					id="{containerId}-set-name"
					type="text"
					value={selectionSets[currentSetIndex]}
					on:input={(e) => renameCurrentSet(e.target.value)}
					style="border-color: {setColors[currentSetIndex]}; color: {setColors[currentSetIndex]};"
					{disabled}
				/>
			</div>

			<div class="set-actions">
				<button on:click={addNewSet} class="btn-add-set" {disabled}>+ New Set</button>
				<button
					on:click={deleteCurrentSet}
					class="btn-delete-set"
					disabled={disabled || selectionSets.length <= 1}
				>
					Delete Set
				</button>
			</div>

			<div class="set-legend">
				<strong>Sets:</strong>
				{#each selectionSets as setName, index}
					<span
						class="set-tag"
						style="background-color: {setColors[index]}; opacity: {index === currentSetIndex
							? 1
							: 0.5};"
					>
						{setName}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<div
		id={containerId}
		bind:this={treeContainer}
		class="tree-container"
		class:tree-disabled={disabled}
		style="height: {height}px; width: {width}px;"
	></div>

	{#if !treeData}
		<p class="no-data-message">No tree data provided</p>
	{/if}

	{#if internalSelectedBranches.length > 0}
		<p class="selection-count">{internalSelectedBranches.length} branch{internalSelectedBranches.length !== 1 ? 'es' : ''} selected</p>
	{/if}
</div>

<style>
	.branch-selector {
		padding: 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: white;
		position: relative; /* Required for absolute positioned context menu */
	}

	.branch-selector.disabled {
		opacity: 0.6;
		pointer-events: none;
	}

	.tree-container {
		background: #f9fafb;
		overflow: auto;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.tree-container.tree-disabled {
		pointer-events: none;
		opacity: 0.7;
	}

	.no-data-message {
		color: #6b7280;
		font-style: italic;
		margin-top: 0.5rem;
	}

	.selection-count {
		color: #059669;
		font-weight: 500;
		margin-top: 0.5rem;
		font-size: 0.875rem;
	}

	/* Multi-set management controls */
	.set-management-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		padding: 1rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		margin-bottom: 1rem;
	}

	.set-selector-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.set-selector-group select {
		padding: 0.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 4px;
		font-size: 14px;
		min-width: 120px;
	}

	.set-name-input {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.set-name-input input {
		padding: 0.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 4px;
		font-size: 14px;
		font-weight: bold;
	}

	.set-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-add-set,
	.btn-delete-set {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-add-set {
		background: #10b981;
		color: white;
	}

	.btn-add-set:hover {
		background: #059669;
	}

	.btn-delete-set {
		background: #ef4444;
		color: white;
	}

	.btn-delete-set:hover:not(:disabled) {
		background: #dc2626;
	}

	.btn-delete-set:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.set-legend {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.set-tag {
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		color: white;
		font-size: 12px;
		font-weight: 600;
	}

	/* Styling for branches in multiple sets */
	:global(.branch-multiple) {
		stroke-width: 3px !important;
		stroke-dasharray: 5, 5 !important;
	}

	/* Phylotree context menu styles */
	:global(.phylotree-context-menu) {
		position: absolute;
		z-index: 1000;
		min-width: 10rem;
		padding: 0.5rem 0;
		margin: 0.125rem 0 0;
		background-color: #fff;
		background-clip: padding-box;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 0.25rem;
		box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.175);
		font-size: 14px;
	}

	:global(.phylotree-menu-item) {
		display: block;
		width: 100%;
		padding: 0.35rem 1rem;
		clear: both;
		font-weight: 400;
		color: #212529;
		text-align: inherit;
		text-decoration: none;
		white-space: nowrap;
		background-color: transparent;
		border: 0;
		cursor: pointer;
	}

	:global(.phylotree-menu-item:hover) {
		background-color: #f0f0f0;
		color: #000;
	}

	:global(.phylotree-menu-divider) {
		height: 0;
		margin: 0.5rem 0;
		overflow: hidden;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}

	:global(.phylotree-menu-header) {
		display: block;
		padding: 0.25rem 1rem;
		margin-bottom: 0;
		font-size: 0.75rem;
		color: #6c757d;
		white-space: nowrap;
		font-weight: 600;
		text-transform: uppercase;
	}

	/* Also support Bootstrap class names for compatibility */
	:global(.dropdown-menu) {
		position: absolute;
		z-index: 1000;
		min-width: 10rem;
		padding: 0.5rem 0;
		background-color: #fff;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 0.25rem;
		box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.175);
	}

	:global(.dropdown-item) {
		display: block;
		width: 100%;
		padding: 0.35rem 1rem;
		color: #212529;
		text-decoration: none;
		background-color: transparent;
		border: 0;
		cursor: pointer;
	}

	:global(.dropdown-item:hover) {
		background-color: #f0f0f0;
	}

	:global(.dropdown-divider) {
		height: 0;
		margin: 0.5rem 0;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}

	:global(.dropdown-header) {
		display: block;
		padding: 0.25rem 1rem;
		font-size: 0.75rem;
		color: #6c757d;
		font-weight: 600;
	}
</style>
