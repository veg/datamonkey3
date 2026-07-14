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

	// Corresponding Newick tree from CD2-slim.fna with branch labels for CONTRAST-FEL
	// Primates (Human, Chimp, Baboon, RhMonkey) are tagged as {Foreground}
	// Other mammals are tagged as {Background}
	const sampleTree = `((((Pig:0.147969{Background},Cow:0.213430{Background}):0.085099{Background},Horse:0.165787{Background},Cat:0.264806{Background}):0.058611{Background},((RhMonkey:0.002015{Foreground},Baboon:0.003108{Foreground}):0.022733{Foreground},(Human:0.004349{Foreground},Chimp:0.000799{Foreground}):0.011873{Foreground}):0.101856{Foreground}):0.340802{Background},Rat:0.050958{Background},Mouse:0.097950{Background});`;

	let serverUrl = 'http://localhost:7015';
	let customFasta = '';
	let customTree = '';
	let usingSampleData = true;
	let jobId = null;

	// CONTRAST-FEL analysis parameters based on official specification
	let contrastFelParams = {
		genetic_code: 'Universal',
		branch_sets: 'Foreground',
		srv: 'Yes',
		permutations: 'Yes',
		p_value: 0.05,
		q_value: 0.2
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

		socket.emit('cfel:check', {
			job: contrastFelParams
		});
	}

	function runContrastFelAnalysis() {
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
		statusMessages = [
			...statusMessages,
			{ msg: 'Starting CONTRAST-FEL analysis...', type: 'info' }
		];

		// Send using unified data format
		socket.emit('cfel:spawn', {
			alignment: fastaData,
			tree: usingSampleData ? sampleTree : customTree,
			job: contrastFelParams
		});
	}

	function cancelAnalysis() {
		if (socket && jobId) {
			socket.emit('cfel:cancel', { id: jobId });
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
	<title>Datamonkey CONTRAST-FEL Analysis Demo</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<h1 class="mb-6 text-3xl font-bold text-gray-900">Datamonkey CONTRAST-FEL Analysis Demo</h1>

	<div class="mb-4 rounded-lg bg-blue-50 p-4">
		<h2 class="text-lg font-semibold text-blue-800">About CONTRAST-FEL</h2>
		<p class="text-blue-700">
			CONTRAST-FEL assesses whether selective pressures differ between two or more sets of branches
			at a particular site in a phylogenetic tree. It contrasts the strength of selection between
			different branch sets, such as internal vs. terminal branches, or foreground vs. background
			lineages.
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
						placeholder="Paste your codon alignment here..."
						class="w-full rounded border p-3 font-mono text-sm"
						rows="6"
					></textarea>
				</div>
				<div>
					<label for="custom-tree" class="mb-2 block text-sm font-medium text-gray-700"
						>Newick Tree</label
					>
					<textarea
						id="custom-tree"
						bind:value={customTree}
						placeholder="Paste your Newick tree here..."
						class="w-full rounded border p-3 font-mono text-sm"
						rows="3"
					></textarea>
				</div>
			</div>
		{:else}
			<div class="rounded bg-gray-50 p-3">
				<p class="text-sm text-gray-600">
					Using CD2-slim.fna test data (10 mammalian species, 51bp each) with corresponding Newick
					phylogenetic tree
				</p>
			</div>
		{/if}
	</div>

	<!-- CONTRAST-FEL Parameters -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">CONTRAST-FEL Analysis Parameters</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div>
				<label for="genetic-code" class="block text-sm font-medium text-gray-700"
					>Genetic Code</label
				>
				<select
					id="genetic-code"
					bind:value={contrastFelParams.genetic_code}
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
				<label for="branch-set" class="block text-sm font-medium text-gray-700">Branch Set</label>
				<select
					id="branch-set"
					bind:value={contrastFelParams.branch_sets}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Foreground">Foreground</option>
					<option value="Internal">Internal Branches</option>
					<option value="Leaves">Terminal Branches</option>
					<option value="Unlabeled">Unlabeled Branches</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Branch set for contrast analysis</p>
			</div>
			<div>
				<label for="srv" class="block text-sm font-medium text-gray-700"
					>Synonymous Rate Variation</label
				>
				<select
					id="srv"
					bind:value={contrastFelParams.srv}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Yes">Yes</option>
					<option value="No">No</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Allow synonymous rates to vary across sites</p>
			</div>
			<div>
				<label for="permutations" class="block text-sm font-medium text-gray-700"
					>Permutation Tests</label
				>
				<select
					id="permutations"
					bind:value={contrastFelParams.permutations}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Yes">Yes</option>
					<option value="No">No</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Perform permutation tests for significance</p>
			</div>
			<div>
				<label for="p-value" class="block text-sm font-medium text-gray-700"
					>P-value Threshold</label
				>
				<input
					id="p-value"
					type="number"
					bind:value={contrastFelParams.p_value}
					min="0.001"
					max="0.5"
					step="0.001"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Significance threshold for site tests</p>
			</div>
			<div>
				<label for="q-value" class="block text-sm font-medium text-gray-700"
					>Q-value Threshold</label
				>
				<input
					id="q-value"
					type="number"
					bind:value={contrastFelParams.q_value}
					min="0.01"
					max="0.5"
					step="0.01"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">False Discovery Rate threshold</p>
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
			on:click={runContrastFelAnalysis}
			class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
			disabled={!isConnected || isAnalysisRunning}
		>
			{isAnalysisRunning ? 'Running...' : 'Run CONTRAST-FEL Analysis'}
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
