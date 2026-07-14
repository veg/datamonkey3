<script>
	import { AlertTriangle, Info } from 'lucide-svelte';

	// Method categories and descriptions
	const methodCategories = [
		{
			title: 'Site-Level Selection Analysis',
			description: 'Methods that test for selection at individual sites across the phylogeny',
			methods: [
				{
					name: 'FEL',
					title: 'Fixed Effects Likelihood',
					description:
						'Estimates site-wise synonymous and non-synonymous rates using likelihood ratio tests. Good for detecting pervasive selection.',
					url: '/demo',
					status: 'ready',
					features: [
						'Site-specific testing',
						'Fast execution',
						'Confidence intervals',
						'Bootstrap support'
					]
				},
				{
					name: 'SLAC',
					title: 'Single-Likelihood Ancestor Counting',
					description:
						'Uses maximum-likelihood and counting approaches for dN/dS estimation. Generally faster than FEL.',
					url: '/demo/slac',
					status: 'ready',
					features: [
						'Fast computation',
						'Ancestral reconstruction',
						'Per-site rates',
						'Uncertainty estimation'
					]
				},
				{
					name: 'MEME',
					title: 'Mixed Effects Model of Evolution',
					description:
						'Tests for episodic positive selection allowing selective pressure to vary across branches.',
					url: '/demo/meme',
					status: 'ready',
					features: [
						'Episodic selection',
						'Branch variation',
						'Multiple rate classes',
						'Advanced modeling'
					]
				},
				{
					name: 'FUBAR',
					title: 'Fast Unconstrained Bayesian AppRoximation',
					description:
						'Bayesian approach to detect pervasive positive or negative selection. Fast and accurate.',
					url: '/demo/fubar',
					status: 'ready',
					features: [
						'Bayesian inference',
						'Fast computation',
						'Posterior probabilities',
						'Site classification'
					]
				}
			]
		},
		{
			title: 'Gene-Level Selection Analysis',
			description: 'Methods that test for selection at the gene or branch level',
			methods: [
				{
					name: 'BUSTED',
					title: 'Branch-site Unrestricted Statistical Test',
					description:
						'Tests for gene-wide positive selection. Asks if any site has experienced positive selection on any branch.',
					url: '/demo/busted',
					status: 'ready',
					features: [
						'Gene-wide testing',
						'Branch-site model',
						'Episodic detection',
						'Diversification analysis'
					]
				},
				{
					name: 'aBSREL',
					title: 'Adaptive Branch-Site Random Effects',
					description:
						'Tests for episodic positive selection on specific branches with adaptive model complexity.',
					url: '#',
					status: 'coming-soon',
					features: [
						'Branch-specific',
						'Adaptive complexity',
						'Episodic selection',
						'Model selection'
					]
				},
				{
					name: 'RELAX',
					title: 'Relaxation Test',
					description:
						'Tests whether selection strength has been relaxed or intensified along specific branches.',
					url: '#',
					status: 'coming-soon',
					features: [
						'Selection relaxation',
						'Branch comparison',
						'K parameter',
						'Statistical testing'
					]
				}
			]
		},
		{
			title: 'Specialized Methods',
			description: 'Specialized methods for specific evolutionary questions',
			methods: [
				{
					name: 'GARD',
					title: 'Genetic Algorithm for Recombination Detection',
					description:
						'Detects recombination breakpoints in sequence alignments using genetic algorithms.',
					url: '#',
					status: 'coming-soon',
					features: [
						'Recombination detection',
						'Breakpoint identification',
						'Model selection',
						'Sequence segmentation'
					]
				},
				{
					name: 'BGM',
					title: 'Bayesian Graphical Model',
					description:
						'Detects correlated amino acid substitution patterns and coevolutionary networks.',
					url: '#',
					status: 'coming-soon',
					features: [
						'Coevolution detection',
						'Network analysis',
						'Bayesian approach',
						'Substitution correlation'
					]
				},
				{
					name: 'FADE',
					title: 'FUBAR Approach to Directional Evolution',
					description:
						'Detects directional selection and evolutionary trends using Bayesian methods.',
					url: '#',
					status: 'coming-soon',
					features: [
						'Directional selection',
						'Evolutionary trends',
						'Bayesian inference',
						'Trend detection'
					]
				}
			]
		}
	];
</script>

<svelte:head>
	<title>Datamonkey Analysis Demos</title>
</svelte:head>

<div class="container mx-auto max-w-7xl p-6">
	<div class="mb-8 text-center">
		<h1 class="mb-4 text-4xl font-bold text-gray-900">Datamonkey Analysis Demos</h1>
		<p class="mx-auto max-w-3xl text-lg text-gray-600">
			Interactive demonstrations of phylogenetic selection analysis methods. Connect to your local
			Datamonkey server to test different analysis methods with real-time progress tracking and
			result visualization.
		</p>
	</div>

	<div class="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
		<div class="flex items-start gap-3">
			<div class="mt-1 flex-shrink-0">
				<AlertTriangle class="h-5 w-5 text-amber-600" />
			</div>
			<div>
				<h3 class="font-semibold text-amber-800">Server Required</h3>
				<p class="text-sm text-amber-700">
					These demos require a running Datamonkey server on <code class="rounded bg-amber-100 px-1"
						>localhost:7015</code
					>. Make sure your server is running before testing the analysis methods.
				</p>
			</div>
		</div>
	</div>

	{#each methodCategories as category}
		<div class="mb-12">
			<div class="mb-6">
				<h2 class="mb-2 text-2xl font-bold text-gray-900">{category.title}</h2>
				<p class="text-gray-600">{category.description}</p>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				{#each category.methods as method}
					<div class="rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
						<div class="p-6">
							<div class="mb-3 flex items-start justify-between">
								<h3 class="text-lg font-semibold text-gray-900">{method.name}</h3>
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {method.status ===
									'ready'
										? 'bg-green-100 text-green-800'
										: 'bg-yellow-100 text-yellow-800'}"
								>
									{method.status === 'ready' ? 'Ready' : 'Coming Soon'}
								</span>
							</div>

							<h4 class="mb-2 text-sm font-medium text-gray-700">{method.title}</h4>
							<p class="mb-4 line-clamp-3 text-sm text-gray-600">{method.description}</p>

							<div class="mb-4">
								<h5 class="mb-2 text-xs font-medium text-gray-700">Key Features:</h5>
								<div class="flex flex-wrap gap-1">
									{#each method.features as feature}
										<span
											class="inline-flex items-center rounded bg-blue-50 px-2 py-1 text-xs text-blue-700"
										>
											{feature}
										</span>
									{/each}
								</div>
							</div>

							<div class="flex gap-2">
								{#if method.status === 'ready'}
									<a
										href={method.url}
										class="flex-1 rounded bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700"
									>
										Try Demo
									</a>
								{:else}
									<button
										disabled
										class="flex-1 cursor-not-allowed rounded bg-gray-100 px-4 py-2 text-center text-sm font-medium text-gray-400"
									>
										Coming Soon
									</button>
								{/if}
								<button class="px-3 py-2 text-gray-400 transition-colors hover:text-gray-600">
									<Info class="h-4 w-4" />
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}

	<div class="mt-12 rounded-lg bg-gray-50 p-6">
		<h2 class="mb-4 text-xl font-semibold text-gray-900">Getting Started</h2>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div>
				<h3 class="mb-2 font-medium text-gray-900">1. Start Your Server</h3>
				<p class="mb-2 text-sm text-gray-600">Make sure your Datamonkey server is running:</p>
				<code class="block rounded bg-gray-800 p-2 font-mono text-xs text-green-400">
					# Start Datamonkey server on port 7015 node server.js
				</code>
			</div>
			<div>
				<h3 class="mb-2 font-medium text-gray-900">2. Choose Your Method</h3>
				<p class="text-sm text-gray-600">
					Select an analysis method based on your research question. Each demo includes sample data
					and parameter explanations to help you get started.
				</p>
			</div>
		</div>

		<div class="mt-6 border-t border-gray-200 pt-6">
			<h3 class="mb-2 font-medium text-gray-900">Need Help?</h3>
			<p class="text-sm text-gray-600">
				Each demo page includes detailed explanations of the method, parameter descriptions, and
				real-time progress tracking. The sample data is based on the CD2-slim.fna dataset with 10
				mammalian species.
			</p>
		</div>
	</div>
</div>

<style>
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
