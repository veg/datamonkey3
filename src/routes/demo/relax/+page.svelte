<script>
	import { onMount } from 'svelte';
	import io from 'socket.io-client';

	let socket = null;
	let isConnected = false;
	let isAnalysisRunning = false;
	let statusMessages = [];
	let results = null;
	let error = null;

	// Sample FASTA data for testing - using existing CD2-slim.fna test data
	const sampleFasta = `>Human
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT
>Chimp
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCT
>Baboon
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCAACTTGGACATTCCT
>RhMonkey
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCAACTTGGACATTCCT
>Cow
AGCATTGTCGTCTGGGGTGCCCTGGATCATGACCTCAACCTGGACATTCCT
>Pig
ACTGAGGTTGTCTGGGGCATCGTGGATCAAGACATCAACCTGGACATTCCT
>Horse
AATATCACCATCTTGGGTGCCCTGGAACGTGATATCAACCTGGACATTCCT
>Cat
GATGATATCGTCTGGGGTACCCTGGGTCAGGACATCAACCTGGACATTCCT
>Mouse
AATGAGACCATCTGGGGTGTCTTGGGTCATGGCATCACCCTGAACATCCCC
>Rat
AGTGGGACCGTCTGGGGTGCCCTGGGTCATGGCATCAACCTGGACATCCCT`;

	// RELAX requires branch labels using {} notation - primates labeled as {TEST}
	const sampleTree = `((((Pig:0.147969,Cow:0.213430):0.085099,Horse:0.165787,Cat:0.264806):0.058611,((RhMonkey{TEST}:0.002015,Baboon{TEST}:0.003108):0.022733,(Human{TEST}:0.004349,Chimp{TEST}:0.000799):0.011873):0.101856):0.340802,Rat:0.050958,Mouse:0.097950);`;

	let serverUrl = 'http://localhost:7015';
	let customFasta = '';
	let customTree = '';
	let usingSampleData = true;
	let jobId = null;

	// RELAX analysis parameters based on backend test configuration
	let relaxParams = {
		analysis_type: 'relax',
		genetic_code: 'Universal',
		mode: 'Classic mode',
		test: 'TEST',
		reference: 'All',
		models: 'All',
		rates: 3,
		'kill-zero-lengths': 'No'
	};

	onMount(() => {
		// Initialize socket connection when component mounts
		connectToServer();
	});

	function connectToServer() {
		try {
			socket = io(serverUrl);
			setupSocketHandlers();
		} catch (err) {
			error = `Failed to connect: ${err.message}`;
		}
	}

	function setupSocketHandlers() {
		socket.on('connect', () => {
			isConnected = true;
			statusMessages = [
				...statusMessages,
				{ msg: 'Connected to Datamonkey server', type: 'success' }
			];
		});

		socket.on('disconnect', () => {
			isConnected = false;
			statusMessages = [...statusMessages, { msg: 'Disconnected from server', type: 'warning' }];
		});

		socket.on('connect_error', (err) => {
			error = `Connection error: ${err.message}`;
			statusMessages = [
				...statusMessages,
				{ msg: `Connection failed: ${err.message}`, type: 'error' }
			];
		});

		socket.on('connected', (data) => {
			statusMessages = [...statusMessages, { msg: `Server ready: ${data.hello}`, type: 'info' }];
		});

		socket.on('status update', (status) => {
			statusMessages = [
				...statusMessages,
				{
					msg: `${status.msg}${status.phase ? ` (Phase: ${status.phase})` : ''}`,
					type: 'info'
				}
			];
		});

		socket.on('completed', (data) => {
			isAnalysisRunning = false;
			results = data;
			statusMessages = [
				...statusMessages,
				{ msg: 'Analysis completed successfully!', type: 'success' }
			];
		});

		socket.on('script error', (err) => {
			isAnalysisRunning = false;
			error = `Analysis failed: ${err.message || err}`;
			statusMessages = [
				...statusMessages,
				{ msg: `Analysis error: ${err.message || err}`, type: 'error' }
			];
		});

		socket.on('validated', (result) => {
			if (result.valid) {
				statusMessages = [
					...statusMessages,
					{ msg: 'Parameters validated successfully', type: 'success' }
				];
			} else {
				error = `Invalid parameters: ${result.errors?.join(', ') || 'Unknown validation error'}`;
				statusMessages = [...statusMessages, { msg: `Validation failed: ${error}`, type: 'error' }];
			}
		});

		socket.on('job queue', (jobs) => {
			statusMessages = [
				...statusMessages,
				{ msg: `Active jobs in queue: ${jobs.length}`, type: 'info' }
			];
		});
	}

	function validateParameters() {
		if (!socket || !isConnected) {
			error = 'Not connected to server';
			return;
		}

		error = null;
		statusMessages = [...statusMessages, { msg: 'Validating parameters...', type: 'info' }];

		socket.emit('relax:check', {
			job: relaxParams
		});
	}

	function runRelaxAnalysis() {
		if (!socket || !isConnected) {
			error = 'Not connected to server';
			return;
		}

		const fastaData = usingSampleData ? sampleFasta : customFasta;

		if (!fastaData.trim()) {
			error = 'No FASTA data provided';
			return;
		}

		error = null;
		results = null;
		isAnalysisRunning = true;
		statusMessages = [...statusMessages, { msg: 'Starting RELAX analysis...', type: 'info' }];

		// Send single object with alignment, tree, and job properties
		socket.emit('relax:spawn', {
			alignment: fastaData,
			tree: usingSampleData ? sampleTree : customTree,
			job: relaxParams
		});
	}

	function cancelAnalysis() {
		if (socket && jobId) {
			socket.emit('relax:cancel', { id: jobId });
			isAnalysisRunning = false;
			statusMessages = [...statusMessages, { msg: 'Analysis cancelled', type: 'warning' }];
		}
	}

	function clearLog() {
		statusMessages = [];
		error = null;
		results = null;
	}

	function getJobQueue() {
		if (socket && isConnected) {
			socket.emit('job queue', {});
		}
	}

	function reconnect() {
		if (socket) {
			socket.disconnect();
		}
		connectToServer();
	}
</script>

<svelte:head>
	<title>Datamonkey RELAX Analysis Demo</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<h1 class="mb-6 text-3xl font-bold text-gray-900">Datamonkey RELAX Analysis Demo</h1>

	<div class="mb-4 rounded-lg bg-blue-50 p-4">
		<h2 class="text-lg font-semibold text-blue-800">About RELAX</h2>
		<p class="text-blue-700">
			RELAX (RELAxed-selection Analysis for eXpert-guided analysis) tests whether selection
			intensity has been relaxed or intensified along specific branches of a phylogenetic tree. It
			compares the strength of natural selection between a test set of branches and a reference set.
		</p>
	</div>

	<!-- Connection Status -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">Server Connection</h2>
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<div class="h-3 w-3 rounded-full {isConnected ? 'bg-green-500' : 'bg-red-500'}"></div>
				<span class="text-sm {isConnected ? 'text-green-700' : 'text-red-700'}">
					{isConnected ? 'Connected' : 'Disconnected'}
				</span>
			</div>
			<input
				bind:value={serverUrl}
				placeholder="Server URL"
				class="rounded border px-3 py-1 text-sm"
				disabled={isConnected}
			/>
			<button
				on:click={reconnect}
				class="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
				disabled={isAnalysisRunning}
			>
				{isConnected ? 'Reconnect' : 'Connect'}
			</button>
			<button
				on:click={getJobQueue}
				class="rounded bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
				disabled={!isConnected}
			>
				Check Queue
			</button>
		</div>
	</div>

	<!-- FASTA Input -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">FASTA Data</h2>
		<div class="mb-3 flex gap-4">
			<label class="flex items-center">
				<input type="radio" bind:group={usingSampleData} value={true} class="mr-2" />
				Use Sample Data
			</label>
			<label class="flex items-center">
				<input type="radio" bind:group={usingSampleData} value={false} class="mr-2" />
				Custom FASTA
			</label>
		</div>

		{#if !usingSampleData}
			<div class="space-y-4">
				<div>
					<label for="custom-fasta" class="mb-2 block text-sm font-medium text-gray-700"
						>FASTA Alignment</label
					>
					<textarea
						id="custom-fasta"
						bind:value={customFasta}
						placeholder="Paste your FASTA alignment here..."
						class="w-full rounded border p-3 font-mono text-sm"
						rows="6"
					></textarea>
				</div>
				<div>
					<label for="custom-tree" class="mb-2 block text-sm font-medium text-gray-700"
						>Newick Tree with Branch Labels</label
					>
					<textarea
						id="custom-tree"
						bind:value={customTree}
						placeholder="Paste your labeled Newick tree here (use {LABEL} notation)..."
						class="w-full rounded border p-3 font-mono text-sm"
						rows="3"
					></textarea>
					<p class="mt-1 text-xs text-gray-500">
						Use {LABEL} notation to mark test branches, e.g., Species{TEST}:0.1
					</p>
				</div>
			</div>
		{:else}
			<div class="rounded bg-gray-50 p-3">
				<p class="text-sm text-gray-600">
					Using CD2-slim.fna test data with primates labeled as {TEST} branches for comparison with other
					mammals
				</p>
			</div>
		{/if}
	</div>

	<!-- RELAX Parameters -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">RELAX Analysis Parameters</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div>
				<label for="genetic-code" class="block text-sm font-medium text-gray-700"
					>Genetic Code</label
				>
				<select
					id="genetic-code"
					bind:value={relaxParams.genetic_code}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Universal">Universal</option>
					<option value="Vertebrate mtDNA">Vertebrate Mitochondrial</option>
					<option value="Yeast mtDNA">Yeast Mitochondrial</option>
					<option value="Mold/Protozoan mtDNA">Mold/Protozoan Mitochondrial</option>
					<option value="Invertebrate mtDNA">Invertebrate Mitochondrial</option>
				</select>
			</div>
			<div>
				<label for="mode" class="block text-sm font-medium text-gray-700">Analysis Mode</label>
				<select
					id="mode"
					bind:value={relaxParams.mode}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Classic mode">Classic Mode</option>
					<option value="Alternative mode">Alternative Mode</option>
				</select>
			</div>
			<div>
				<label for="test" class="block text-sm font-medium text-gray-700">Test Branch Set</label>
				<input
					id="test"
					type="text"
					bind:value={relaxParams.test}
					placeholder="Branch label (e.g., TEST)"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Label used to identify test branches in tree</p>
			</div>
			<div>
				<label for="reference" class="block text-sm font-medium text-gray-700">Reference Set</label>
				<select
					id="reference"
					bind:value={relaxParams.reference}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="All">All unlabeled branches</option>
					<option value="Labeled">Only labeled reference branches</option>
				</select>
			</div>
			<div>
				<label for="models" class="block text-sm font-medium text-gray-700">Models to Fit</label>
				<select
					id="models"
					bind:value={relaxParams.models}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="All">All models</option>
					<option value="Minimal set">Minimal set</option>
				</select>
			</div>
			<div>
				<label for="rates" class="block text-sm font-medium text-gray-700">Rate Classes</label>
				<input
					id="rates"
					type="number"
					bind:value={relaxParams.rates}
					min="1"
					max="10"
					step="1"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Number of omega rate classes (default: 3)</p>
			</div>
			<div>
				<label for="kill-zero-lengths" class="block text-sm font-medium text-gray-700"
					>Kill Zero Lengths</label
				>
				<select
					id="kill-zero-lengths"
					bind:value={relaxParams['kill-zero-lengths']}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="No">No</option>
					<option value="Yes">Yes</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Remove zero-length internal branches</p>
			</div>
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="mb-6 flex gap-3">
		<button
			on:click={validateParameters}
			class="rounded bg-yellow-500 px-4 py-2 text-white hover:bg-yellow-600 disabled:opacity-50"
			disabled={!isConnected || isAnalysisRunning}
		>
			Validate Parameters
		</button>
		<button
			on:click={runRelaxAnalysis}
			class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
			disabled={!isConnected || isAnalysisRunning}
		>
			{isAnalysisRunning ? 'Running...' : 'Run RELAX Analysis'}
		</button>
		{#if isAnalysisRunning}
			<button
				on:click={cancelAnalysis}
				class="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
			>
				Cancel
			</button>
		{/if}
		<button on:click={clearLog} class="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600">
			Clear Log
		</button>
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
			<h3 class="font-semibold text-red-800">Error</h3>
			<p class="text-red-700">{error}</p>
		</div>
	{/if}

	<!-- Status Log -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">Status Log</h2>
		<div class="max-h-64 overflow-y-auto rounded bg-gray-50 p-3 font-mono text-sm">
			{#each statusMessages as message}
				<div
					class="mb-1 {message.type === 'error'
						? 'text-red-600'
						: message.type === 'success'
							? 'text-green-600'
							: message.type === 'warning'
								? 'text-yellow-600'
								: 'text-gray-800'}"
				>
					[{new Date().toLocaleTimeString()}] {message.msg}
				</div>
			{/each}
			{#if statusMessages.length === 0}
				<div class="text-gray-500">No status messages yet...</div>
			{/if}
		</div>
	</div>

	<!-- Results Display -->
	{#if results}
		<div class="rounded-lg border p-4">
			<h2 class="mb-3 text-lg font-semibold">Analysis Results</h2>
			<div class="max-h-96 overflow-y-auto rounded bg-gray-50 p-3">
				<pre class="text-sm">{JSON.stringify(results, null, 2)}</pre>
			</div>
		</div>
	{/if}
</div>
