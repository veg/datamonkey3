<!-- WASM Debug Console -->
<script>
	import { onMount } from 'svelte';
	import { aioliStore } from '../../../stores/aioli.js';
	import { get } from 'svelte/store';
	import Aioli from '@biowasm/aioli';

	let cli = null;
	let command = 'hyphy LIBPATH=/res/ fel --help';
	let output = '';
	let error = '';
	let isRunning = false;
	let isInitializing = false;
	let mountedFiles = [];

	// Sample data for quick testing
	const sampleTree = '((A{FG}:0.1,B:0.1):0.1,(C{FG}:0.1,D:0.1):0.1);';
	const sampleFasta = `>A
ATGATGATG
>B
ATGATGATG
>C
ATGATGATG
>D
ATGATGATG`;

	// Sample NEXUS with embedded tree (for testing tree stripping)
	const sampleNexusWithTree = `#NEXUS

BEGIN DATA;
	DIMENSIONS NTAX=4 NCHAR=9;
	FORMAT DATATYPE=DNA GAP=- MISSING=?;
	MATRIX
		A ATGATGATG
		B ATGATGATG
		C ATGATGATG
		D ATGATGATG
	;
END;

BEGIN TREES;
	TREE tree1 = ((A:0.1,B:0.1):0.1,(C:0.1,D:0.1):0.1);
END;`;

	// Function to strip trees from NEXUS data (same as in WasmAnalysisRunner)
	function stripTreesFromNexus(nexusData) {
		console.log('🌳 Checking for embedded trees in NEXUS data...');

		// Check if this looks like NEXUS format
		if (!nexusData.toLowerCase().includes('#nexus')) {
			console.log('🌳 Not a NEXUS file, skipping tree stripping');
			return nexusData;
		}

		// Look for TREES block (case insensitive)
		const treesBlockRegex = /begin\s+trees\s*;.*?end\s*;/gis;
		const hasTreesBlock = treesBlockRegex.test(nexusData);

		if (hasTreesBlock) {
			console.log('🌳 Found embedded TREES block in NEXUS file, removing it...');
			const cleanedNexus = nexusData.replace(treesBlockRegex, '');
			console.log('🌳 Stripped TREES block from NEXUS file');
			return cleanedNexus;
		} else {
			console.log('🌳 No TREES block found in NEXUS file');
			return nexusData;
		}
	}

	// Quick command templates
	const commandTemplates = [
		{ name: 'HyPhy Help', cmd: 'hyphy LIBPATH=/res/ --help' },
		{ name: 'FEL Help', cmd: 'hyphy LIBPATH=/res/ fel --help' },
		{ name: 'SLAC Help', cmd: 'hyphy LIBPATH=/res/ slac --help' },
		{ name: 'PRIME Help', cmd: 'hyphy LIBPATH=/res/ prime --help' },
		{ name: 'List mounted files', cmd: 'ls -la /shared/data/' },
		{ name: 'Check branches parameter', cmd: 'hyphy LIBPATH=/res/ fel --branches' },
		{
			name: 'Test FEL with FG branches',
			cmd: 'hyphy LIBPATH=/res/ fel --alignment /shared/data/test.fasta --tree /shared/data/test.tree --branches FG'
		},
		{ name: 'Cat test tree file', cmd: 'cat /shared/data/test.tree' },
		{ name: 'Cat test fasta file', cmd: 'cat /shared/data/test.fasta' }
	];

	onMount(async () => {
		const unsubscribe = aioliStore.subscribe((value) => {
			cli = value;
			if (cli) {
				// Expose CLI globally for console debugging
				window.wasmCli = cli;
				console.log('🔧 WASM CLI available at window.wasmCli');
			}
		});

		// If CLI is not initialized yet, initialize it ourselves
		if (!get(aioliStore)) {
			isInitializing = true;
			console.log('🚀 Initializing WASM environment for debug console...');
			try {
				const cliObj = await new Aioli(
					{
						tool: 'hyphy',
						version: '2.5.98',
						urlPrefix: `${window.location.origin}/wasm/hyphy/2.5.98`
					},
					{
						printInterleaved: false
					}
				);

				// Set it in the store for other components to use
				aioliStore.set(cliObj);
				cli = cliObj;

				// Expose globally
				window.wasmCli = cliObj;
				console.log('✅ WASM CLI initialized and available at window.wasmCli');
			} catch (e) {
				error = `Failed to initialize WASM: ${e.message}`;
				console.error('❌ WASM initialization failed:', e);
			} finally {
				isInitializing = false;
			}
		}

		return unsubscribe;
	});

	async function runCommand() {
		if (!cli) {
			error = 'WASM CLI not initialized yet';
			return;
		}

		isRunning = true;
		error = '';
		output = '';

		try {
			console.log('🚀 Running command:', command);
			const result = await cli.exec(command);

			output = await result.stdout;
			if (result.stderr) {
				error = await result.stderr;
			}

			console.log('✅ Command completed');
			if (output) console.log('📋 Output:', output);
			if (error) console.error('❌ Error:', error);
		} catch (e) {
			error = `Exception: ${e.message}\n${e.stack}`;
			console.error('💥 Command failed:', e);
		} finally {
			isRunning = false;
		}
	}

	async function mountSampleFiles() {
		if (!cli) {
			error = 'WASM CLI not initialized yet';
			return;
		}

		try {
			const files = await cli.mount([
				{ name: 'test.fasta', data: sampleFasta },
				{ name: 'test.tree', data: sampleTree }
			]);

			mountedFiles = files;
			output = `Mounted files:\n${files.join('\n')}`;
			console.log('📁 Files mounted:', files);
		} catch (e) {
			error = `Failed to mount files: ${e.message}`;
		}
	}

	async function checkTreeContent() {
		if (!cli) {
			error = 'WASM CLI not initialized yet';
			return;
		}

		isRunning = true;
		error = '';
		output = '';

		try {
			console.log('🌳 Starting tree content check...');

			// First mount a test tree
			const testTreeWithTags =
				'((Human{FG}:0.1,Chimp{FG}:0.1)Internal1:0.1,(Mouse:0.1,Rat:0.1)Internal2{FG}:0.1)Root;';
			console.log('🌳 Mounting test tree:', testTreeWithTags);

			const mountedFiles = await cli.mount([{ name: 'tagged.tree', data: testTreeWithTags }]);
			console.log('🌳 Mounted files:', mountedFiles);

			// Read it back to verify
			console.log('🌳 Reading tree file back...');
			const catResult = await cli.exec('cat /shared/data/tagged.tree');
			console.log('🌳 Cat command result:', catResult);

			if (!catResult) {
				throw new Error('No result from cat command');
			}

			const treeContent = await catResult.stdout;
			console.log('🌳 Tree content from file:', treeContent);

			// Also check if file exists with ls
			const lsResult = await cli.exec('ls -la /shared/data/');
			const lsOutput = await lsResult.stdout;
			console.log('🌳 Directory listing:', lsOutput);

			output = `Tree content verification:

Original tree:
${testTreeWithTags}

As read from file:
${treeContent || '(empty or error)'}

Directory listing:
${lsOutput || '(error)'}

Contains {FG} tags: ${(treeContent || '').includes('{FG}')}
File exists: ${(lsOutput || '').includes('tagged.tree')}`;
		} catch (e) {
			console.error('🌳 Tree check error:', e);
			console.error('🌳 Error details:', e.message, e.stack);
			error = `Failed to check tree: ${e.message || 'Unknown error'}`;
		} finally {
			isRunning = false;
		}
	}

	async function testFelWithFgBranches() {
		if (!cli) {
			error = 'WASM CLI not initialized yet';
			return;
		}

		isRunning = true;
		error = '';
		output = '';

		try {
			console.log('🔥 Testing FEL with --branches FG');

			// Mount sample files with tagged tree
			const taggedTree = '((A{FG}:0.1,B:0.1):0.1,(C{FG}:0.1,D:0.1):0.1);';
			const files = await cli.mount([
				{ name: 'test.fasta', data: sampleFasta },
				{ name: 'test.tree', data: taggedTree }
			]);

			console.log('🔥 Files mounted:', files);
			output += `Files mounted:\n${files.join('\n')}\n\n`;

			// Show what's in the tree file
			const catResult = await cli.exec('cat /shared/data/test.tree');
			const treeContent = await catResult.stdout;
			output += `Tree file contents:\n${treeContent}\n\n`;

			// Now run FEL with --branches FG
			output +=
				'Running: hyphy LIBPATH=/res/ fel --alignment /shared/data/test.fasta --tree /shared/data/test.tree --branches FG\n\n';

			const felResult = await cli.exec(
				'hyphy LIBPATH=/res/ fel --alignment /shared/data/test.fasta --tree /shared/data/test.tree --branches FG'
			);
			const felOutput = await felResult.stdout;

			output += '=== FEL OUTPUT ===\n' + felOutput;
		} catch (e) {
			console.error('🔥 FEL test error:', e);
			error = `FEL test failed: ${e.message || 'Unknown error'}`;
		} finally {
			isRunning = false;
		}
	}

	async function testTreeStripping() {
		if (!cli) {
			error = 'WASM CLI not initialized yet';
			return;
		}

		isRunning = true;
		error = '';
		output = '';

		try {
			console.log('🗑️ Testing NEXUS tree stripping...');

			// Show original NEXUS with embedded tree
			output += 'Original NEXUS with embedded tree:\n';
			output += '='.repeat(40) + '\n';
			output += sampleNexusWithTree + '\n\n';

			// Strip the trees
			const cleanedNexus = stripTreesFromNexus(sampleNexusWithTree);

			output += 'After tree stripping:\n';
			output += '='.repeat(40) + '\n';
			output += cleanedNexus + '\n\n';

			// Mount both versions and show what HyPhy sees
			const files = await cli.mount([
				{ name: 'original.nex', data: sampleNexusWithTree },
				{ name: 'cleaned.nex', data: cleanedNexus },
				{ name: 'separate.tree', data: sampleTree }
			]);

			output += `Files mounted: ${files.join(', ')}\n\n`;

			// Now test FEL with the cleaned NEXUS + separate tree file
			output += 'Running FEL with cleaned NEXUS + separate tree file:\n';
			output +=
				'Command: hyphy LIBPATH=/res/ fel --alignment /shared/data/cleaned.nex --tree /shared/data/separate.tree --branches FG\n\n';

			const felResult = await cli.exec(
				'hyphy LIBPATH=/res/ fel --alignment /shared/data/cleaned.nex --tree /shared/data/separate.tree --branches FG'
			);
			const felOutput = await felResult.stdout;

			output += '=== FEL OUTPUT ===\n' + felOutput;
		} catch (e) {
			console.error('🗑️ Tree stripping test error:', e);
			error = `Tree stripping test failed: ${e.message || 'Unknown error'}`;
		} finally {
			isRunning = false;
		}
	}

	function setCommand(cmd) {
		command = cmd;
	}

	// Keyboard shortcut for running command (Ctrl+Enter)
	function handleKeydown(event) {
		if (event.key === 'Enter' && event.ctrlKey) {
			runCommand();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="mx-auto max-w-6xl p-6">
	<h1 class="mb-4 text-2xl font-bold">🔧 WASM/HyPhy Debug Console</h1>

	<div class="mb-6 rounded border border-yellow-200 bg-yellow-50 p-4">
		<p class="text-sm text-yellow-800">
			<strong>Debug Mode:</strong> This console allows direct interaction with the WASM environment.
			The CLI is also exposed globally as <code class="bg-yellow-100 px-1">window.wasmCli</code> for
			browser console debugging.
		</p>
	</div>

	{#if isInitializing}
		<div class="mb-6 rounded border border-blue-200 bg-blue-50 p-4">
			<p class="text-blue-800">🚀 Initializing WASM environment...</p>
		</div>
	{:else if !cli}
		<div class="mb-6 rounded border border-blue-200 bg-blue-50 p-4">
			<p class="text-blue-800">Loading WASM environment...</p>
		</div>
	{:else}
		<div class="mb-6 rounded border border-green-200 bg-green-50 p-4">
			<p class="text-green-800">✓ WASM environment ready</p>
		</div>
	{/if}

	<!-- Quick Actions -->
	<div class="mb-6">
		<h2 class="mb-2 text-lg font-semibold">Quick Actions</h2>
		<div class="flex flex-wrap gap-2">
			<button
				on:click={mountSampleFiles}
				disabled={!cli}
				class="rounded bg-blue-500 px-3 py-1 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				📁 Mount Sample Files
			</button>
			<button
				on:click={checkTreeContent}
				disabled={!cli}
				class="rounded bg-green-500 px-3 py-1 text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				🌳 Check Tree with {'{FG}'} Tags
			</button>
			<button
				on:click={testFelWithFgBranches}
				disabled={!cli || isRunning}
				class="rounded bg-red-500 px-3 py-1 text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				🔥 Run FEL with --branches FG
			</button>
			<button
				on:click={testTreeStripping}
				disabled={!cli || isRunning}
				class="rounded bg-purple-500 px-3 py-1 text-white hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				🗑️ Test NEXUS Tree Stripping
			</button>
		</div>
	</div>

	<!-- Command Templates -->
	<div class="mb-6">
		<h2 class="mb-2 text-lg font-semibold">Command Templates</h2>
		<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
			{#each commandTemplates as template}
				<button
					on:click={() => setCommand(template.cmd)}
					class="rounded bg-gray-100 px-3 py-2 text-left font-mono text-sm hover:bg-gray-200"
				>
					<div class="mb-1 font-sans text-xs font-medium text-gray-600">{template.name}</div>
					<div class="text-xs">{template.cmd}</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- Command Input -->
	<div class="mb-6">
		<label class="mb-2 block text-sm font-medium"> Command (Ctrl+Enter to run) </label>
		<div class="flex gap-2">
			<input
				bind:value={command}
				disabled={isRunning}
				class="flex-1 rounded border px-3 py-2 font-mono text-sm disabled:opacity-50"
				placeholder="Enter command..."
			/>
			<button
				on:click={runCommand}
				disabled={!cli || isRunning}
				class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isRunning ? 'Running...' : 'Run'}
			</button>
		</div>
	</div>

	<!-- Output -->
	{#if output}
		<div class="mb-6">
			<h2 class="mb-2 text-lg font-semibold">Output</h2>
			<pre class="overflow-x-auto rounded bg-gray-900 p-4 text-sm text-gray-100">{output}</pre>
		</div>
	{/if}

	<!-- Error -->
	{#if error}
		<div class="mb-6">
			<h2 class="mb-2 text-lg font-semibold text-red-600">Error</h2>
			<pre
				class="overflow-x-auto rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</pre>
		</div>
	{/if}

	<!-- Mounted Files -->
	{#if mountedFiles.length > 0}
		<div class="mb-6">
			<h2 class="mb-2 text-lg font-semibold">Mounted Files</h2>
			<ul class="rounded bg-gray-100 p-3 font-mono text-sm">
				{#each mountedFiles as file}
					<li>{file}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Help -->
	<div class="mt-8 rounded bg-gray-50 p-4 text-sm">
		<h3 class="mb-2 font-semibold">Usage Tips:</h3>
		<ul class="list-inside list-disc space-y-1 text-gray-700">
			<li>
				Use <code class="bg-gray-200 px-1">window.wasmCli</code> in browser console for direct access
			</li>
			<li>Files are mounted to <code class="bg-gray-200 px-1">/shared/data/</code></li>
			<li>HyPhy requires <code class="bg-gray-200 px-1">LIBPATH=/res/</code></li>
			<li>Press Ctrl+Enter to quickly run commands</li>
			<li>Check the browser console for additional debug output</li>
		</ul>
	</div>
</div>

<style>
	code {
		font-family: monospace;
		font-size: 0.875em;
	}
</style>
