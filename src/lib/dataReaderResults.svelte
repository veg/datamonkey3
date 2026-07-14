<script>
	import PhyloTree from './phylotree.svelte';
	import { AlertTriangle, Check, Info, ChevronRight, Copy } from 'lucide-svelte';

	export let fileMetricsJSON = null;

	let isOpen = false;
	let njStringExpanded = false;
	let userTreeStringExpanded = {};
	let copySuccess = null;

	$: hasTree = fileMetricsJSON?.FILE_INFO?.goodtree;

	// Format timestamp in a clear, unambiguous format
	function formatTimestamp(timestamp) {
		const date = new Date(parseInt(timestamp.trim()) * 1000);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Truncate newick string for preview
	function truncateNewick(str, maxLength = 60) {
		if (str.length <= maxLength) return str;
		return str.substring(0, maxLength) + '...';
	}

	// Copy to clipboard
	async function copyToClipboard(text, id) {
		try {
			await navigator.clipboard.writeText(text);
			copySuccess = id;
			setTimeout(() => {
				copySuccess = null;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

</script>

<div data-testid="sequence-info" class="metrics min-w-full rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-md">
	<h3 class="mb-4 text-lg font-semibold text-text-rich">Alignment File Metrics</h3>

	{#if fileMetricsJSON?.error}
		<!-- Error State -->
		<div class="rounded-xl border border-status-error/20 bg-gradient-to-b from-red-50 to-white p-6">
			<div class="flex items-start gap-4">
				<div class="flex-shrink-0 overflow-hidden rounded-lg">
					<img
						src="/img/mascot-error.png"
						alt="Datamonkey mascot"
						class="h-16 w-auto opacity-70"
					/>
				</div>
				<div class="flex-1 pt-1">
					<div class="mb-1 flex items-center gap-2">
						<AlertTriangle class="h-4 w-4 text-status-error" />
						<p class="font-medium text-status-error">Validation Error</p>
					</div>
					<p class="text-sm text-text-slate">{fileMetricsJSON.error}</p>
				</div>
			</div>
		</div>
	{:else if fileMetricsJSON?.FILE_INFO}
		<!-- Status Badge (non-interactive) and Toggle -->
		<div class="mb-4 flex items-center gap-3">
			<span
				class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium {hasTree
					? 'bg-status-success/10 text-status-success'
					: 'bg-amber-100 text-amber-700'}"
			>
				{#if hasTree}
					<Check class="h-3.5 w-3.5" />
				{:else}
					<Info class="h-3.5 w-3.5" />
				{/if}
				{hasTree ? 'Tree Included' : 'No Tree Detected'}
			</span>
			<button
				on:click={() => (isOpen = !isOpen)}
				class="text-sm text-text-slate hover:text-text-rich transition-colors flex items-center gap-1"
			>
				<ChevronRight class="h-4 w-4 transition-transform {isOpen ? 'rotate-90' : ''}" />
				{isOpen ? 'Hide details' : 'Show details'}
			</button>
		</div>

		{#if isOpen}
			<!-- Compact Metrics Grid -->
			<div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6 max-w-lg">
				<div class="flex justify-between">
					<span class="text-text-slate">Sequences</span>
					<span class="font-medium text-text-rich">{fileMetricsJSON.FILE_INFO.sequences}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-text-slate">Partitions</span>
					<span class="font-medium text-text-rich">{fileMetricsJSON.FILE_INFO.partitions}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-text-slate">Sites</span>
					<span class="font-medium text-text-rich">
						{fileMetricsJSON.FILE_INFO.rawsites} raw → {fileMetricsJSON.FILE_INFO.sites} processed
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-text-slate">Genetic Code</span>
					<span class="font-medium text-text-rich">{fileMetricsJSON.FILE_INFO.gencodeid}</span>
				</div>
				{#if fileMetricsJSON.FILE_INFO.type}
					<div class="flex justify-between">
						<span class="text-text-slate">Data Type</span>
						<span class="font-medium text-text-rich">{fileMetricsJSON.FILE_INFO.type}</span>
					</div>
				{/if}
				<div class="flex justify-between">
					<span class="text-text-slate">Analyzed</span>
					<span class="font-medium text-text-rich">{formatTimestamp(fileMetricsJSON.FILE_INFO.timestamp)}</span>
				</div>
				{#if fileMetricsJSON.FILE_INFO.duplicate_sequences > 0}
					<div class="flex justify-between">
						<span class="text-text-slate">Duplicates Removed</span>
						<span class="font-medium text-status-warning">{fileMetricsJSON.FILE_INFO.duplicate_sequences}</span>
					</div>
				{/if}
				{#if fileMetricsJSON.FILE_INFO.sequences_renamed > 0}
					<div class="flex justify-between">
						<span class="text-text-slate">Sequences Renamed</span>
						<span class="font-medium text-status-warning">{fileMetricsJSON.FILE_INFO.sequences_renamed}</span>
					</div>
				{/if}
				{#if fileMetricsJSON.FILE_INFO.ambiguous_sites}
					<div class="flex justify-between">
						<span class="text-text-slate">Ambiguous Sites</span>
						<span class="font-medium text-status-warning">Present</span>
					</div>
				{/if}
				{#if fileMetricsJSON.FILE_INFO.stop_codons_stripped > 0}
					<div class="flex justify-between">
						<span class="text-text-slate">Stop Codons Stripped</span>
						<span class="font-medium text-status-warning">{fileMetricsJSON.FILE_INFO.stop_codons_stripped}</span>
					</div>
				{/if}
			</div>

			<!-- NJ Tree Section -->
			{#if fileMetricsJSON.FILE_INFO?.nj}
				<div class="border-t border-border-subtle pt-4 mt-4">
					<div class="flex items-center justify-between mb-3">
						<h4 class="text-sm font-medium text-text-rich">Neighbor Joining Tree</h4>
						<div class="flex items-center gap-2">
							<button
								on:click={() => copyToClipboard(fileMetricsJSON.FILE_INFO.nj, 'nj')}
								class="text-xs text-text-slate hover:text-text-rich transition-colors flex items-center gap-1"
							>
								{#if copySuccess === 'nj'}
									<Check class="h-3.5 w-3.5 text-status-success" />
									Copied
								{:else}
									<Copy class="h-3.5 w-3.5" />
									Copy Newick
								{/if}
							</button>
							<button
								on:click={() => (njStringExpanded = !njStringExpanded)}
								class="text-xs text-text-slate hover:text-text-rich transition-colors"
							>
								{njStringExpanded ? 'Hide string' : 'Show string'}
							</button>
						</div>
					</div>

					{#if njStringExpanded}
						<div class="mb-3 rounded border border-border-subtle bg-surface-sunken p-2 overflow-x-auto">
							<pre class="whitespace-pre-wrap text-xs text-text-slate font-mono">{fileMetricsJSON.FILE_INFO.nj}</pre>
						</div>
					{/if}

					<div class="relative">
						<div class="absolute top-0 left-0 text-[10px] text-text-slate bg-surface-raised px-1 rounded">
							Genetic Distance
						</div>
						<PhyloTree
							newickString={fileMetricsJSON.FILE_INFO.nj}
							height={400}
							width={700}
							viewerType="phylotree"
							selectable={false}
						/>
					</div>
				</div>
			{/if}

			<!-- User Supplied Tree Section -->
			{#if fileMetricsJSON?.FILE_PARTITION_INFO}
				{#each Object.entries(fileMetricsJSON.FILE_PARTITION_INFO) as [partitionKey, partition]}
					{#if partition.usertree}
						<div class="border-t border-border-subtle pt-4 mt-4">
							<div class="flex items-center justify-between mb-3">
								<h4 class="text-sm font-medium text-text-rich">
									User Supplied Tree{Object.keys(fileMetricsJSON.FILE_PARTITION_INFO).length > 1
										? ` (Partition ${partitionKey})`
										: ''}
								</h4>
								<div class="flex items-center gap-2">
									<button
										on:click={() => copyToClipboard(partition.usertree, `user-${partitionKey}`)}
										class="text-xs text-text-slate hover:text-text-rich transition-colors flex items-center gap-1"
									>
										{#if copySuccess === `user-${partitionKey}`}
											<Check class="h-3.5 w-3.5 text-status-success" />
											Copied
										{:else}
											<Copy class="h-3.5 w-3.5" />
											Copy Newick
										{/if}
									</button>
									<button
										on:click={() => (userTreeStringExpanded[partitionKey] = !userTreeStringExpanded[partitionKey])}
										class="text-xs text-text-slate hover:text-text-rich transition-colors"
									>
										{userTreeStringExpanded[partitionKey] ? 'Hide string' : 'Show string'}
									</button>
								</div>
							</div>

							{#if userTreeStringExpanded[partitionKey]}
								<div class="mb-3 rounded border border-border-subtle bg-surface-sunken p-2 overflow-x-auto">
									<pre class="whitespace-pre-wrap text-xs text-text-slate font-mono">{partition.usertree}</pre>
								</div>
							{/if}

							<div class="relative">
								<div class="absolute top-0 left-0 text-[10px] text-text-slate bg-surface-raised px-1 rounded">
									Genetic Distance
								</div>
								<PhyloTree
									newickString={partition.usertree}
									height={400}
									width={700}
									viewerType="phylotree"
									selectable={false}
								/>
							</div>
						</div>
					{/if}
				{/each}
			{/if}
		{/if}
	{:else}
		<p class="text-sm text-text-slate">No data available.</p>
	{/if}
</div>
