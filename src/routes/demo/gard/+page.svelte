<script>
	import { onMount } from 'svelte';
	import io from 'socket.io-client';

	let socket = null;
	let isConnected = false;
	let isAnalysisRunning = false;
	let statusMessages = [];
	let results = null;
	let error = null;

	// Extended FASTA data for GARD - needs at least 48 sites for 10 sequences
	// Extended from CD2-slim.fna with additional synthetic codon sequences to meet GARD requirements
	const sampleFasta = `>Human
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Chimp
GCCTTGGAAACCTGGGGTGCCTTGGGTCAGGACATCAACTTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Baboon
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCAACTTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>RhMonkey
GCTTTGGAAACCTGGGGAGCGCTGGGTCAGGACATCAACTTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Cow
AGCATTGTCGTCTGGGGTGCCCTGGATCATGACCTCAACCTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Pig
ACTGAGGTTGTCTGGGGCATCGTGGATCAAGACATCAACCTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Horse
AATATCACCATCTTGGGTGCCCTGGAACGTGATATCAACCTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Cat
GATGATATCGTCTGGGGTACCCTGGGTCAGGACATCAACCTGGACATTCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Mouse
AATGAGACCATCTGGGGTGTCTTGGGTCATGGCATCACCCTGAACATCCCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG
>Rat
AGTGGGACCGTCTGGGGTGCCCTGGGTCATGGCATCAACCTGGACATCCCTAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGGCAACTACGCCAAGCTGGGCAACGTGACCGGTTATGCCAAGCTGGGCGACGTGACCTATGGCAAGCTG`;

	let serverUrl = 'http://localhost:7015';
	let customFasta = '';
	let usingSampleData = true;
	let jobId = null;

	// GARD analysis parameters based on backend test configuration
	let gardParams = {
		analysis_type: 'gard',
		type: 'nucleotide',
		model: 'JTT',
		mode: 'Normal',
		rv: 'None',
		'rate-classes': 4
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

		socket.emit('gard:check', {
			job: gardParams
		});
	}

	function runGardAnalysis() {
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
		statusMessages = [...statusMessages, { msg: 'Starting GARD analysis...', type: 'info' }];

		// GARD doesn't require a tree - it builds its own
		socket.emit('gard:spawn', {
			alignment: fastaData,
			job: gardParams
		});
	}

	function cancelAnalysis() {
		if (socket && jobId) {
			socket.emit('gard:cancel', { id: jobId });
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
	<title>Datamonkey GARD Analysis Demo</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<h1 class="mb-6 text-3xl font-bold text-gray-900">Datamonkey GARD Analysis Demo</h1>

	<div class="mb-4 rounded-lg bg-blue-50 p-4">
		<h2 class="text-lg font-semibold text-blue-800">About GARD</h2>
		<p class="text-blue-700">
			GARD (Genetic Algorithm for Recombination Detection) screens nucleotide sequence alignments
			for evidence of recombination breakpoints. It identifies potential structural breakpoints in
			your alignment that may result from recombination events.
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
						placeholder="Paste your nucleotide FASTA alignment here..."
						class="w-full rounded border p-3 font-mono text-sm"
						rows="6"
					></textarea>
					<p class="mt-1 text-xs text-gray-500">
						GARD analyzes nucleotide sequences for recombination breakpoints
					</p>
				</div>
			</div>
		{:else}
			<div class="rounded bg-gray-50 p-3">
				<p class="text-sm text-gray-600">
					Using CD2-slim.fna test data (10 mammalian species, 51bp each). GARD will build its own
					phylogenetic tree.
				</p>
			</div>
		{/if}
	</div>

	<!-- GARD Parameters -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">GARD Analysis Parameters</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div>
				<label for="type" class="block text-sm font-medium text-gray-700">Data Type</label>
				<select id="type" bind:value={gardParams.type} class="mt-1 block w-full rounded border p-2">
					<option value="nucleotide">Nucleotide</option>
					<option value="codon">Codon</option>
					<option value="amino-acid">Amino Acid</option>
				</select>
			</div>
			<div>
				<label for="model" class="block text-sm font-medium text-gray-700">Substitution Model</label
				>
				<select
					id="model"
					bind:value={gardParams.model}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="JTT">JTT</option>
					<option value="WAG">WAG</option>
					<option value="LG">LG</option>
					<option value="GTR">GTR</option>
					<option value="HKY85">HKY85</option>
					<option value="REV">REV</option>
				</select>
			</div>
			<div>
				<label for="mode" class="block text-sm font-medium text-gray-700">Analysis Mode</label>
				<select id="mode" bind:value={gardParams.mode} class="mt-1 block w-full rounded border p-2">
					<option value="Normal">Normal</option>
					<option value="Faster">Faster</option>
				</select>
			</div>
			<div>
				<label for="rv" class="block text-sm font-medium text-gray-700">Rate Variation</label>
				<select id="rv" bind:value={gardParams.rv} class="mt-1 block w-full rounded border p-2">
					<option value="None">None</option>
					<option value="General Discrete">General Discrete</option>
					<option value="Beta-Gamma">Beta-Gamma</option>
				</select>
			</div>
			<div>
				<label for="rate-classes" class="block text-sm font-medium text-gray-700"
					>Rate Classes</label
				>
				<input
					id="rate-classes"
					type="number"
					bind:value={gardParams['rate-classes']}
					min="2"
					max="8"
					step="1"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Number of rate categories (2-8)</p>
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
			on:click={runGardAnalysis}
			class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
			disabled={!isConnected || isAnalysisRunning}
		>
			{isAnalysisRunning ? 'Running...' : 'Run GARD Analysis'}
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
