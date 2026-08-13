<!--
	BranchSelector Component - Interactive phylogenetic tree branch selection
-->

<script>
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import * as phylotree from 'phylotree';
	import * as d3 from 'd3';
	import { assignBranchToSet, branchNameOf, listBranches } from './utils/branchSetTagging.js';

	const dispatch = createEventDispatcher();

	// Props - Core
	export let treeData = '';
	export let height = 400;
	export let width = 800;

	// Smallest width the tree is ever drawn at. Below this, tip labels collide and the tree stops
	// being readable at all, so we draw at minWidth and let the pan box scroll instead of squashing.
	export let minWidth = 640;

	// Width at or below which the list view is the better default. Chosen to match minWidth's
	// intent: if the viewport cannot show the tree without panning, start with the list.
	export let listByDefaultBelow = 700;

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

	// Responsive state. `hostEl` is the pan box; its width is PARENT-driven only (width: 100%), never
	// tree-driven, otherwise the ResizeObserver would feed the tree's own width back into itself.
	let hostEl;
	let measuredWidth = 0;
	let resizeTimer;
	let resizeObserver;
	let lastRenderedWidth = 0;
	$: renderWidth = Math.max(minWidth, measuredWidth || width);

	// View state. The list is not a different selection MODE — it is a second rendering of the same
	// phylotree state — so it deliberately does not touch `branchesToTest` upstream.
	let view = 'tree';
	// True when the last render happened with the pan box hidden, which leaves the SVG without a
	// viewBox. Switching to the tree view then has to redraw; otherwise it must not.
	let renderedWhileHidden = false;
	let branchFilter = '';
	let branchRows = [];

	// Node hit targets. Phylotree draws r=3 circles; that is a 6px target, well under any usable
	// minimum, and it is why e2e/10-branch-selector.spec.js needed force:true to click one.
	const MIN_NODE_RADIUS = 6;

	// Re-rendering builds a brand-new phylotree, so it is not free: it throws away the live
	// selection, which we then have to restore. Ignore width jitter below this.
	const RERENDER_WIDTH_THRESHOLD = 24;

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
		// Decide the initial view from a real measurement, synchronously, BEFORE the first render.
		// Deriving it from the debounced ResizeObserver instead would flip the view ~150ms after the
		// tree had already appeared — visibly jarring, and a race for anything reading the DOM.
		// It is decided once: a later resize must not yank the view out from under the user.
		measuredWidth = Math.round(hostEl?.getBoundingClientRect().width || 0);
		if (measuredWidth) {
			view = measuredWidth < listByDefaultBelow ? 'list' : 'tree';
		}

		if (treeData) {
			renderTree();
		}

		if (typeof ResizeObserver !== 'undefined' && hostEl) {
			resizeObserver = new ResizeObserver((entries) => {
				const w = Math.round(entries[0]?.contentRect?.width || 0);
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(() => handleHostResize(w), 150);
			});
			resizeObserver.observe(hostEl);
		}
	});

	onDestroy(() => {
		clearTimeout(resizeTimer);
		resizeObserver?.disconnect();
	});

	// React to a real width change only. A phone rotated mid-selection must not silently lose its
	// TEST/REFERENCE assignments, so the selection is snapshotted and handed back to phylotree
	// through its own initial-selection / initial-sets render options.
	async function handleHostResize(w) {
		if (!w) return;
		measuredWidth = w;

		if (!tree) return;
		const next = Math.max(minWidth, w);
		if (Math.abs(next - lastRenderedWidth) <= RERENDER_WIDTH_THRESHOLD) return;

		await tick();
		renderTree(snapshotSelection());
	}

	// Capture the current selection in a form phylotree can replay after a re-render.
	function snapshotSelection() {
		if (!tree?.display) return null;

		if (effectiveMode === 'multi-set') {
			const sets = {};
			selectionSets.forEach((setName) => {
				const members = tree.display.getSetMembers?.(setName) || [];
				const names = members.map(branchNameOf).filter(Boolean);
				if (names.length > 0) sets[setName] = names;
			});
			return Object.keys(sets).length > 0 ? { sets } : null;
		}

		const names = (tree.display.getSelection?.() || []).map(branchNameOf).filter(Boolean);
		return names.length > 0 ? { names } : null;
	}

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

	function renderTree(restore = null) {
		try {
			// Make sure we have a valid Newick string
			if (!treeData || treeData.trim() === '') {
				console.log('BranchSelector: No tree data provided');
				return;
			}

			// Initialize tree from Newick string
			tree = new phylotree.phylotree(treeData);

			// Render the tree with multi-set options if in multi-set mode
			lastRenderedWidth = renderWidth;
			renderedWhileHidden = view !== 'tree';
			const renderOptions = {
				container: `#${containerId}`,
				height: height,
				// renderWidth, not `width`: below minWidth the tree is drawn at minWidth and the pan box
				// scrolls. Drawing it at the viewport width instead used to squash the whole tree, and
				// drawing it at a hard-coded 1000px used to push the PAGE 693px wider than a phone.
				width: renderWidth,
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
				if (restore?.sets) {
					renderOptions['initial-sets'] = restore.sets;
				}
			} else if (restore?.names) {
				renderOptions['initial-selection'] = restore.names;
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
						enforceMinNodeRadius(container);
					});
				}

				// Set up click handlers if not disabled
				if (!disabled) {
					setupClickHandlers(container);
				}
			}

			refreshBranchRows();
		} catch (e) {
			console.error('BranchSelector: Error rendering tree:', e);
			dispatch('error', { message: e.message, error: e });
		}
	}

	/**
	 * Grow phylotree's r=3 node circles to a tappable size.
	 *
	 * This is done as a d3 attribute pass, not purely in CSS, because the SVG2 `r` geometry property
	 * is unsupported on older engines — CSS alone would leave those users with the 6px target the
	 * whole item is about. It has to be re-applied after every selection change, because phylotree
	 * redraws the node circles on update().
	 */
	function enforceMinNodeRadius(container) {
		if (!container) return;
		requestAnimationFrame(() => {
			// Both classes matter: phylotree tags LEAF groups `.node` and internal ones
			// `.internal-node` (see its css_classes map), so `.node circle` alone silently misses
			// every internal node — which is most of what you tag for RELAX and Contrast-FEL.
			d3.select(container)
				.selectAll('.node circle, .internal-node circle')
				.attr('r', function () {
					return Math.max(MIN_NODE_RADIUS, +this.getAttribute('r') || 0);
				});
		});
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

	// ---------------------------------------------------------------------------------------------
	// List view
	//
	// The tree is the only way to assign branches to sets, and it is a mouse-only, sighted-only,
	// wide-screen-only control: RELAX and Contrast-FEL refuse to run until TEST/REFERENCE (or two
	// groups) are tagged, so on a phone — or with a keyboard — those two methods were simply
	// unrunnable. This list renders the SAME phylotree state through form controls. It is not a new
	// branch-selection mode: assignments go through phylotree's own APIs and out through the
	// existing selectionChange event, so nothing upstream needs to know it exists.
	// ---------------------------------------------------------------------------------------------

	function treeNodes() {
		// phylotree 2.x keeps the tree in `nodes` (a d3 hierarchy). There is no `tree.json`.
		return tree?.nodes?.descendants?.() || [];
	}

	function refreshBranchRows() {
		branchRows = listBranches(treeNodes());
	}

	$: filteredBranchRows = branchFilter.trim()
		? branchRows.filter((row) => row.name.toLowerCase().includes(branchFilter.trim().toLowerCase()))
		: branchRows;

	// Options offered per row: the real sets, plus "unassigned".
	$: rowSetOptions = effectiveMode === 'multi-set' ? selectionSets : ['Foreground'];

	async function setView(next) {
		const wasHidden = renderedWhileHidden;
		view = next;

		if (next === 'list') {
			refreshBranchRows();
			return;
		}

		// Only redraw if the tree was last drawn into a display:none box — there it had no layout, so
		// getBBox threw and the viewBox was never set. Redrawing unconditionally would also throw away
		// and rebuild a perfectly good tree every time the already-active Tree button is pressed.
		if (!wasHidden) return;

		await tick();
		renderTree(snapshotSelection());
	}

	function handleRowAssignment(branchName, setName) {
		if (!tree) return;

		const nodes = treeNodes();
		const node = nodes.find((n) => branchNameOf(n) === branchName);
		if (!node) return;

		if (effectiveMode === 'multi-set') {
			// Prefer phylotree's own set APIs so the tree view's colours agree with the list. addToSet
			// is already mutually exclusive; removeFromSet needs to be told which set to leave.
			if (setName && tree.display?.addToSet) {
				tree.display.addToSet(node, setName);
			} else if (!setName && tree.display?.removeFromSet) {
				const current = node._selectionSet;
				if (current) tree.display.removeFromSet(node, current);
			} else {
				// No display (or an older phylotree): fall back to the extracted, DOM-free tagging.
				assignBranchToSet(nodes, branchName, setName, selectionSets);
			}
		} else if (setName) {
			tree.display?.selectNodes?.([branchName]);
		} else {
			tree.display?.deselectNodes?.([branchName]);
		}

		updateSelectedBranches();
		enforceMinNodeRadius(treeContainer);
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
				// Fallback for a tree with no display: scan the hierarchy directly. (This used to walk
				// `tree.json`, which phylotree 2.x does not define, so it could never find anything.)
				current_selection = treeNodes().filter(
					(node) => node._selectionSet || selectionSets.some((s) => node[s])
				);
			}
		} else {
			// Single-set mode: use phylotree's getSelection API
			current_selection = tree.display?.getSelection() || [];
		}

		internalSelectedBranches = current_selection.map((node) => {
			return node.data?.name || node.name || `node_${node.id || Math.random()}`;
		});

		// Keep the list view in step with the tree: both are views of the same phylotree state, so a
		// click on a branch has to move the corresponding row's <select>, and vice versa.
		refreshBranchRows();

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

	<div class="view-toggle" role="group" aria-label="Branch selection view">
		<button
			type="button"
			data-testid="branch-view-tree"
			class="view-toggle-btn"
			class:active={view === 'tree'}
			aria-pressed={view === 'tree'}
			on:click={() => setView('tree')}
			{disabled}
		>
			Tree
		</button>
		<button
			type="button"
			data-testid="branch-view-list"
			class="view-toggle-btn"
			class:active={view === 'list'}
			aria-pressed={view === 'list'}
			on:click={() => setView('list')}
			{disabled}
		>
			List
		</button>
	</div>

	<!--
		The pan box is always parent-sized (width: 100%) and scrolls horizontally. The tree inside it
		keeps its own, larger width. If this box were ever sized by the tree, the ResizeObserver would
		feed the tree's width back into renderWidth and oscillate.

		It stays mounted in list view (hidden, not destroyed) so that switching views does not throw
		away the rendered phylotree — which is the shared source of truth for both views.
	-->
	<div class="tree-pan" bind:this={hostEl} class:hidden-view={view !== 'tree'}>
		<div
			id={containerId}
			bind:this={treeContainer}
			class="tree-container"
			class:tree-disabled={disabled}
			style="height: {height}px; width: {renderWidth}px;"
		></div>
	</div>

	{#if view === 'list'}
		<div class="branch-list" data-testid="branch-list">
			<label class="branch-filter-label" for="{containerId}-filter">
				Filter branches
				<input
					id="{containerId}-filter"
					type="search"
					bind:value={branchFilter}
					placeholder="Search by name"
					{disabled}
				/>
			</label>

			{#if filteredBranchRows.length === 0}
				<p class="no-data-message">
					{branchRows.length === 0 ? 'No branches to assign yet.' : 'No branches match that filter.'}
				</p>
			{:else}
				<ul class="branch-rows">
					{#each filteredBranchRows as row (row.name)}
						<li class="branch-row">
							<label class="branch-row-label" for="{containerId}-row-{row.name}">
								<span class="branch-row-name">{row.name}</span>
								<span class="branch-row-kind">{row.isLeaf ? 'leaf' : 'internal'}</span>
							</label>
							<select
								id="{containerId}-row-{row.name}"
								data-testid="branch-row-select"
								data-branch={row.name}
								value={row.set}
								on:change={(e) => handleRowAssignment(row.name, e.currentTarget.value)}
								{disabled}
							>
								<option value="">—</option>
								{#each rowSetOptions as setName}
									<option value={setName}>{setName}</option>
								{/each}
							</select>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

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

	/* Parent-driven width only — see the comment on the markup. */
	.tree-pan {
		width: 100%;
		max-width: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
	}

	.tree-pan.hidden-view {
		display: none;
	}

	.tree-container {
		background: #f9fafb;
		overflow: auto;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.view-toggle {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
	}

	.view-toggle-btn {
		padding: 0.5rem 1rem;
		min-height: 44px;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		background: white;
		font-size: 14px;
		cursor: pointer;
	}

	.view-toggle-btn.active {
		background: #1d4ed8;
		border-color: #1d4ed8;
		color: white;
		font-weight: 600;
	}

	.branch-list {
		margin-top: 0.75rem;
	}

	.branch-filter-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	.branch-filter-label input {
		flex: 1;
		min-width: 0;
		padding: 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		font-size: 14px;
	}

	.branch-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 20rem;
		overflow-y: auto;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
	}

	.branch-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.branch-row:last-child {
		border-bottom: none;
	}

	.branch-row-label {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.branch-row-name {
		font-size: 0.875rem;
		color: #111827;
		overflow-wrap: anywhere;
	}

	.branch-row-kind {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.branch-row select {
		min-height: 44px;
		padding: 0.25rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		font-size: 14px;
	}

	/*
	 * Node hit targets are enlarged by the d3 attribute pass in enforceMinNodeRadius, NOT here.
	 * `r` as a CSS geometry property is SVG2: unsupported on older engines, and svelte-check flags
	 * it as an unknown property. Do not "simplify" that pass into a CSS rule — it would silently
	 * restore the 6px tap target on exactly the browsers least able to hit it.
	 */

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
