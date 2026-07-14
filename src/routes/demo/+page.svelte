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
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCGACTTGGACATTCCT
>RhMonkey
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCGACTTGGACATTCCT
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
AGTGGGACCGTCTGGGGTGCCCTGGGTCATGGCATCAACCTGAACATCCCT`;

	// Corresponding Newick tree from CD2-slim.fna
	const sampleTree = `((((Pig:0.147969,Cow:0.213430):0.085099,Horse:0.165787,Cat:0.264806):0.058611,((RhMonkey:0.002015,Baboon:0.003108):0.022733,(Human:0.004349,Chimp:0.000799):0.011873):0.101856):0.340802,Rat:0.050958,Mouse:0.097950);`;

	let serverUrl = 'http://localhost:7015';
	let customFasta = '';
	let customTree = '';
	let usingSampleData = true;
	let jobId = null;

	// FEL analysis parameters - corrected to match official Datamonkey specification
	let felParams = {
		analysis_type: 'fel',
		code: 'Universal',
		pvalue: 0.1,
		branches: 'All',
		resample: 1,
		srv: 'Yes',
		ci: 'No',
		'multiple-hits': 'None',
		'site-multihit': 'Estimate',
		precision: 'standard',
		'full-model': 'Yes'
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

		socket.emit('fel:check', {
			job: felParams
		});
	}

	function runFelAnalysis() {
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
		statusMessages = [...statusMessages, { msg: 'Starting FEL analysis...', type: 'info' }];

		// Send single object with alignment, tree, and job properties
		socket.emit('fel:spawn', {
			alignment: fastaData,
			tree: usingSampleData ? sampleTree : customTree,
			job: felParams
		});
	}

	function cancelAnalysis() {
		if (socket && jobId) {
			socket.emit('fel:cancel', { id: jobId });
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
	<title>Datamonkey FEL Analysis Demo</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<h1 class="mb-6 text-3xl font-bold text-gray-900">Datamonkey FEL Analysis Demo</h1>

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

	<!-- FEL Parameters -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">FEL Analysis Parameters</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div>
				<label for="genetic-code" class="block text-sm font-medium text-gray-700"
					>Genetic Code</label
				>
				<select
					id="genetic-code"
					bind:value={felParams.code}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Universal">Universal</option>
					<option value="Vertebrate Mitochondrial">Vertebrate Mitochondrial</option>
					<option value="Yeast Mitochondrial">Yeast Mitochondrial</option>
					<option value="Mold Mitochondrial">Mold Mitochondrial</option>
					<option value="Invertebrate Mitochondrial">Invertebrate Mitochondrial</option>
				</select>
			</div>
			<div>
				<label for="p-value" class="block text-sm font-medium text-gray-700"
					>P-value Threshold</label
				>
				<input
					id="p-value"
					type="number"
					bind:value={felParams.pvalue}
					min="0.01"
					max="1"
					step="0.01"
					class="mt-1 block w-full rounded border p-2"
				/>
			</div>
			<div>
				<label for="resample" class="block text-sm font-medium text-gray-700"
					>Resample Replicates</label
				>
				<input
					id="resample"
					type="number"
					bind:value={felParams.resample}
					min="0"
					max="1000"
					step="10"
					class="mt-1 block w-full rounded border p-2"
				/>
			</div>
			<div>
				<label for="srv" class="block text-sm font-medium text-gray-700"
					>Synonymous Rate Variation</label
				>
				<select id="srv" bind:value={felParams.srv} class="mt-1 block w-full rounded border p-2">
					<option value="Yes">Yes</option>
					<option value="No">No</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Allow synonymous rates to vary across sites</p>
			</div>
			<div>
				<label for="ci" class="block text-sm font-medium text-gray-700">Confidence Intervals</label>
				<select id="ci" bind:value={felParams.ci} class="mt-1 block w-full rounded border p-2">
					<option value="No">No</option>
					<option value="Yes">Yes</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Compute confidence intervals for rates</p>
			</div>
			<div>
				<label for="multiple-hits" class="block text-sm font-medium text-gray-700"
					>Multiple Hits</label
				>
				<select
					id="multiple-hits"
					bind:value={felParams['multiple-hits']}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="None">None</option>
					<option value="Double">Double</option>
					<option value="Double+Triple">Double+Triple</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">
					Include support for multiple nucleotide substitutions
				</p>
			</div>
			<div>
				<label for="site-multihit" class="block text-sm font-medium text-gray-700"
					>Site Multiple Hits</label
				>
				<select
					id="site-multihit"
					bind:value={felParams['site-multihit']}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Estimate">Estimate</option>
					<option value="None">None</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Site-level multiple hit model</p>
			</div>
			<div>
				<label for="precision" class="block text-sm font-medium text-gray-700"
					>Optimization Precision</label
				>
				<select
					id="precision"
					bind:value={felParams.precision}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="standard">Standard</option>
					<option value="high">High</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Numerical optimization precision</p>
			</div>
			<div>
				<label for="full-model" class="block text-sm font-medium text-gray-700">Full Model</label>
				<select
					id="full-model"
					bind:value={felParams['full-model']}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Yes">Yes</option>
					<option value="No">No</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Re-optimize branch lengths on the full model</p>
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
			on:click={runFelAnalysis}
			class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
			disabled={!isConnected || isAnalysisRunning}
		>
			{isAnalysisRunning ? 'Running...' : 'Run FEL Analysis'}
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
