<script>
	import { onMount } from 'svelte';
	import io from 'socket.io-client';

	let socket = null;
	let isConnected = false;
	let isAnalysisRunning = false;
	let statusMessages = [];
	let results = null;
	let error = null;

	// Sample PROTEIN FASTA data for FADE testing (translated from CD2-slim.fna)
	// FADE requires protein alignment data, not nucleotide data
	const sampleFasta = `>Human
ALETEEWGLEAILEDIP
>Chimp
ALETEEWGLEAILEDIP
>Baboon
AFETEEWGLEAILEDIP
>RhMonkey
AFETEEWGLEAILEDIP
>Cow
SIVWGALDHDFLEDIP
>Pig
TEVVWGIVDQDILEDIP
>Horse
ISLGGALERDIELLEDIP
>Cat
DIVWGTLGQDIFLEDIP
>Mouse
NETIWGVLGHTLELIP
>Rat
SGPCGAAHQDLFLEDIP`;

	// Rooted Newick tree (FADE requires rooted trees)
	// Added root with outgroup Mouse and Rat
	const sampleTree = `(((((Pig:0.147969,Cow:0.213430):0.085099,Horse:0.165787,Cat:0.264806):0.058611,((RhMonkey:0.002015,Baboon:0.003108):0.022733,(Human:0.004349,Chimp:0.000799):0.011873):0.101856):0.340802,Rat:0.050958):0.02,Mouse:0.097950);`;

	let serverUrl = 'http://localhost:7015';
	let customFasta = '';
	let customTree = '';
	let usingSampleData = true;
	let jobId = null;

	// FADE analysis parameters based on official API specification
	let fadeParams = {
		substitution_model: 'LG',
		posterior_estimation_method: 'Metropolis-Hastings',
		branches: 'All',
		number_of_grid_points: 20,
		number_of_mcmc_chains: 5,
		length_of_each_chain: 5,
		number_of_burn_in_samples: 1000000,
		number_of_samples: 100,
		concentration_of_dirichlet_prior: 0.5,
		genetic_code: 'Universal'
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

		socket.emit('fade:check', {
			job: fadeParams
		});
	}

	function runFadeAnalysis() {
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
			{ msg: 'Starting FADE analysis (this may take several minutes)...', type: 'info' }
		];

		// Send single object with alignment, tree, and job properties
		socket.emit('fade:spawn', {
			alignment: fastaData,
			tree: usingSampleData ? sampleTree : customTree,
			job: fadeParams
		});
	}

	function cancelAnalysis() {
		if (socket && jobId) {
			socket.emit('fade:cancel', { id: jobId });
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
	<title>Datamonkey FADE Analysis Demo</title>
</svelte:head>

<div class="container mx-auto max-w-6xl p-6">
	<h1 class="mb-6 text-3xl font-bold text-gray-900">Datamonkey FADE Analysis Demo</h1>

	<div class="mb-4 rounded-lg bg-blue-50 p-4">
		<h2 class="text-lg font-semibold text-blue-800">About FADE</h2>
		<p class="text-blue-700">
			FADE (FUBAR Approach to Directional Evolution) is a Bayesian method for detecting directional
			selection at individual sites in protein-coding sequences. It estimates site-specific
			directional selection coefficients and identifies sites that consistently favor specific amino
			acid substitutions.
		</p>
		<p class="mt-2 text-sm text-blue-600">
			<strong>Important:</strong> FADE requires protein alignment data and a rooted phylogenetic tree.
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
						>PROTEIN FASTA Alignment</label
					>
					<textarea
						id="custom-fasta"
						bind:value={customFasta}
						placeholder="Paste your PROTEIN alignment here (amino acid sequences)..."
						class="w-full rounded border p-3 font-mono text-sm"
						rows="6"
					></textarea>
				</div>
				<div>
					<label for="custom-tree" class="mb-2 block text-sm font-medium text-gray-700"
						>ROOTED Newick Tree</label
					>
					<textarea
						id="custom-tree"
						bind:value={customTree}
						placeholder="Paste your ROOTED Newick tree here..."
						class="w-full rounded border p-3 font-mono text-sm"
						rows="3"
					></textarea>
				</div>
			</div>
		{:else}
			<div class="rounded bg-gray-50 p-3">
				<p class="text-sm text-gray-600">
					Using protein alignment data (translated from CD2-slim.fna: 10 mammalian species, 17 amino
					acids each) with corresponding rooted Newick phylogenetic tree
				</p>
			</div>
		{/if}
	</div>

	<!-- FADE Parameters -->
	<div class="mb-6 rounded-lg border p-4">
		<h2 class="mb-3 text-lg font-semibold">FADE Analysis Parameters</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<div>
				<label for="genetic-code" class="block text-sm font-medium text-gray-700"
					>Genetic Code</label
				>
				<select
					id="genetic-code"
					bind:value={fadeParams.genetic_code}
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
				<label for="substitution-model" class="block text-sm font-medium text-gray-700"
					>Substitution Model</label
				>
				<select
					id="substitution-model"
					bind:value={fadeParams.substitution_model}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="LG">LG (default - recommended)</option>
					<option value="WAG">WAG</option>
					<option value="JTT">JTT</option>
					<option value="JC69">JC69</option>
					<option value="mtMet">mtMet</option>
					<option value="mtVer">mtVer</option>
					<option value="mtInv">mtInv</option>
					<option value="gcpREV">gcpREV</option>
					<option value="HIVBm">HIVBm</option>
					<option value="HIVWm">HIVWm</option>
					<option value="GTR">GTR</option>
				</select>
			</div>
			<div>
				<label for="posterior-estimation-method" class="block text-sm font-medium text-gray-700"
					>Estimation Method</label
				>
				<select
					id="posterior-estimation-method"
					bind:value={fadeParams.posterior_estimation_method}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="Metropolis-Hastings">Metropolis-Hastings (default)</option>
					<option value="Collapsed-Gibbs">Collapsed-Gibbs</option>
					<option value="Variational-Bayes">Variational-Bayes</option>
				</select>
			</div>
			<div>
				<label for="branches" class="block text-sm font-medium text-gray-700"
					>Branches to Test</label
				>
				<select
					id="branches"
					bind:value={fadeParams.branches}
					class="mt-1 block w-full rounded border p-2"
				>
					<option value="All">All Branches</option>
					<option value="Internal">Internal Branches Only</option>
					<option value="Leaves">Terminal Branches Only</option>
				</select>
				<p class="mt-1 text-xs text-gray-500">Which branches to analyze</p>
			</div>
			<div>
				<label for="number-of-grid-points" class="block text-sm font-medium text-gray-700"
					>Grid Points</label
				>
				<input
					id="number-of-grid-points"
					type="number"
					bind:value={fadeParams.number_of_grid_points}
					min="10"
					max="50"
					step="5"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Grid resolution for rate discretization</p>
			</div>
			<div>
				<label for="number-of-mcmc-chains" class="block text-sm font-medium text-gray-700"
					>MCMC Chains</label
				>
				<input
					id="number-of-mcmc-chains"
					type="number"
					bind:value={fadeParams.number_of_mcmc_chains}
					min="1"
					max="10"
					step="1"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Number of independent MCMC chains</p>
			</div>
			<div>
				<label for="length-of-each-chain" class="block text-sm font-medium text-gray-700"
					>Chain Length</label
				>
				<input
					id="length-of-each-chain"
					type="number"
					bind:value={fadeParams.length_of_each_chain}
					min="10000"
					max="5000000"
					step="10000"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Length of each MCMC chain (reduced for testing)</p>
			</div>
			<div>
				<label for="burn-in" class="block text-sm font-medium text-gray-700">Burn-in Samples</label>
				<input
					id="burn-in"
					type="number"
					bind:value={fadeParams.number_of_burn_in_samples}
					min="5000"
					max="2000000"
					step="5000"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Number of burn-in samples to discard</p>
			</div>
			<div>
				<label for="samples" class="block text-sm font-medium text-gray-700">Final Samples</label>
				<input
					id="samples"
					type="number"
					bind:value={fadeParams.number_of_samples}
					min="10"
					max="1000"
					step="10"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Number of samples to collect after burn-in</p>
			</div>
			<div>
				<label
					for="concentration-of-dirichlet-prior"
					class="block text-sm font-medium text-gray-700">Dirichlet Concentration</label
				>
				<input
					id="concentration-parameter"
					type="number"
					bind:value={fadeParams.concentration_of_dirichlet_prior}
					min="0.1"
					max="2.0"
					step="0.1"
					class="mt-1 block w-full rounded border p-2"
				/>
				<p class="mt-1 text-xs text-gray-500">Concentration parameter for Dirichlet prior</p>
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
			on:click={runFadeAnalysis}
			class="rounded bg-green-500 px-4 py-2 text-white hover:bg-green-600 disabled:opacity-50"
			disabled={!isConnected || isAnalysisRunning}
		>
			{isAnalysisRunning ? 'Running...' : 'Run FADE Analysis'}
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

	<!-- Warning for computational intensity -->
	<div class="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
		<h3 class="font-semibold text-orange-800">⚠️ Computational Warning</h3>
		<p class="text-orange-700">
			FADE analysis is computationally intensive and may take 10+ minutes to complete, even with
			reduced parameters. Please be patient during execution.
		</p>
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
