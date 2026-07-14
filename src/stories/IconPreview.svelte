<script>
	// Status Icons
	import {
		CheckCircle2,
		AlertTriangle,
		Pause,
		Zap,
		Loader2,
		RefreshCw,
		XCircle,
		AlertCircle,
		Clock,
		CircleDot
	} from 'lucide-svelte';

	// File Type Icons
	import { Dna, FileSpreadsheet, FileJson, FileCode, FileText, File } from 'lucide-svelte';

	// UI Icons
	import {
		Search,
		ChevronUp,
		ChevronDown,
		Trash2,
		Check,
		Eye,
		Download,
		Play,
		X,
		Menu,
		ExternalLink
	} from 'lucide-svelte';
</script>

<div class="space-y-12 p-8" style="font-family: system-ui, -apple-system, sans-serif;">
	<div>
		<h1 class="mb-2 text-3xl font-bold text-gray-900">Icon Preview</h1>
		<p class="text-gray-600">
			Review proposed Lucide icons before implementing. Compare current icons (emoji/inline SVG)
			with proposed replacements.
		</p>
	</div>

	<!-- Status Indicators Section -->
	<section>
		<h2 class="mb-4 border-b border-gray-200 pb-2 text-xl font-semibold text-gray-800">
			Status Indicators
		</h2>
		<p class="mb-6 text-sm text-gray-500">
			Currently using emoji characters. Proposed Lucide icons are more consistent and render the
			same across all platforms.
		</p>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			<!-- Running -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Running / Loading</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<span class="animate-pulse rounded-full bg-blue-500 p-1 text-xs text-white">●</span>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<Loader2 class="h-5 w-5 animate-spin text-blue-500" />
					</div>
				</div>
			</div>

			<!-- Completed -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Completed</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<span class="text-lg text-green-500">✓</span>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<CheckCircle2 class="h-5 w-5 text-green-500" />
					</div>
				</div>
			</div>

			<!-- Failed -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Failed / Error</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<span class="text-lg text-red-500">⚠</span>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<AlertTriangle class="h-5 w-5 text-red-500" />
					</div>
				</div>
			</div>

			<!-- Interrupted -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Interrupted / Paused</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<span class="text-lg text-orange-500">⏸</span>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<Pause class="h-5 w-5 text-orange-500" />
					</div>
				</div>
			</div>

			<!-- Reconnecting -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Reconnecting</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<span class="animate-pulse rounded-full bg-blue-400 p-1 text-xs text-white">●</span>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<RefreshCw class="h-5 w-5 animate-spin text-blue-400" />
					</div>
				</div>
			</div>

			<!-- Connection Lost -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Connection Lost</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<span class="text-lg text-amber-500">⚡</span>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<Zap class="h-5 w-5 text-amber-500" />
					</div>
				</div>
			</div>
		</div>

		<!-- Live Status Indicator Mock -->
		<div class="mt-6">
			<div class="text-sm font-medium text-gray-500">Status Indicator Preview (as it would appear in navbar)</div>
			<div class="mt-2 flex gap-4">
				<div class="flex items-center space-x-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
					<div class="flex items-center">
						<Loader2 class="mr-1 h-4 w-4 animate-spin text-blue-500" />
						<span class="font-medium text-blue-600">2</span>
					</div>
					<span class="text-gray-300">•</span>
					<div class="flex items-center">
						<CheckCircle2 class="mr-1 h-4 w-4 text-green-500" />
						<span class="font-medium text-green-600">5</span>
					</div>
					<span class="text-gray-300">•</span>
					<div class="flex items-center">
						<AlertTriangle class="mr-1 h-4 w-4 text-red-500" />
						<span class="font-medium text-red-600">1</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- File Type Icons Section -->
	<section>
		<h2 class="mb-4 border-b border-gray-200 pb-2 text-xl font-semibold text-gray-800">
			File Type Icons
		</h2>
		<p class="mb-6 text-sm text-gray-500">
			Current icons are generic SVG paths that are hard to distinguish. Proposed icons use
			distinctive shapes for each file type.
		</p>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
			<!-- FASTA/Sequence Files -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">FASTA / Sequence Files</div>
				<div class="mb-2 text-xs text-gray-400">.fasta, .fa, .fastq, .nex, .phy</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M10 10L4 14v-8l6 4zm2-4v8l6-4-6-4z"
								/>
							</svg>
						</div>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700"
						>
							<Dna class="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>

			<!-- CSV/TSV -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Tabular Data</div>
				<div class="mb-2 text-xs text-gray-400">.csv, .tsv</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 4v16l6-4.5V16l6 4.5V4a1 1 0 00-1-1H5a1 1 0 00-1 1z"
								/>
							</svg>
						</div>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-700"
						>
							<FileSpreadsheet class="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>

			<!-- JSON -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">JSON Data</div>
				<div class="mb-2 text-xs text-gray-400">.json</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
								/>
							</svg>
						</div>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700"
						>
							<FileJson class="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>

			<!-- XML -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">XML Data</div>
				<div class="mb-2 text-xs text-gray-400">.xml</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
								/>
							</svg>
						</div>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-700"
						>
							<FileCode class="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>

			<!-- TXT -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Text File</div>
				<div class="mb-2 text-xs text-gray-400">.txt</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
						</div>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600"
						>
							<FileText class="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>

			<!-- Default -->
			<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="mb-3 text-sm font-medium text-gray-500">Default / Unknown</div>
				<div class="mb-2 text-xs text-gray-400">Any other extension</div>
				<div class="flex items-center justify-between">
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Current</span>
						<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
						</div>
					</div>
					<span class="text-gray-300">→</span>
					<div class="flex flex-col items-center">
						<span class="mb-1 text-xs text-gray-400">Proposed</span>
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"
						>
							<File class="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- File Card Preview Mock -->
		<div class="mt-6">
			<div class="text-sm font-medium text-gray-500">File Card Preview (as it would appear)</div>
			<div class="mt-2 max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
						<Dna class="h-6 w-6" />
					</div>
					<div>
						<div class="font-medium text-gray-900">sequences.fasta</div>
						<div class="text-sm text-gray-500">2.4 MB • FASTA Sequence</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- UI Icons Section -->
	<section>
		<h2 class="mb-4 border-b border-gray-200 pb-2 text-xl font-semibold text-gray-800">UI Icons</h2>
		<p class="mb-6 text-sm text-gray-500">
			Common UI icons used throughout the application. These will also be updated for consistency.
		</p>

		<div class="flex flex-wrap gap-6">
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Search class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">Search</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<ChevronUp class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">Collapse</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<ChevronDown class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">Expand</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Trash2 class="h-6 w-6 text-red-500" />
				<span class="mt-2 text-xs text-gray-500">Delete</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Check class="h-6 w-6 text-green-600" />
				<span class="mt-2 text-xs text-gray-500">Select</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Eye class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">View</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Download class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">Download</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Play class="h-6 w-6 text-green-600" />
				<span class="mt-2 text-xs text-gray-500">Run</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<X class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">Close</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Menu class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">Menu</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<XCircle class="h-6 w-6 text-red-500" />
				<span class="mt-2 text-xs text-gray-500">Cancel</span>
			</div>
			<div class="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4">
				<Clock class="h-6 w-6 text-gray-600" />
				<span class="mt-2 text-xs text-gray-500">Time</span>
			</div>
		</div>
	</section>

	<!-- Size Variants -->
	<section>
		<h2 class="mb-4 border-b border-gray-200 pb-2 text-xl font-semibold text-gray-800">
			Size Variants
		</h2>
		<p class="mb-6 text-sm text-gray-500">
			Icons scale cleanly with Tailwind classes. Here are the common sizes used.
		</p>

		<div class="flex items-end gap-8">
			<div class="flex flex-col items-center">
				<CheckCircle2 class="h-3 w-3 text-green-500" />
				<span class="mt-2 text-xs text-gray-500">h-3 w-3</span>
			</div>
			<div class="flex flex-col items-center">
				<CheckCircle2 class="h-4 w-4 text-green-500" />
				<span class="mt-2 text-xs text-gray-500">h-4 w-4</span>
			</div>
			<div class="flex flex-col items-center">
				<CheckCircle2 class="h-5 w-5 text-green-500" />
				<span class="mt-2 text-xs text-gray-500">h-5 w-5</span>
			</div>
			<div class="flex flex-col items-center">
				<CheckCircle2 class="h-6 w-6 text-green-500" />
				<span class="mt-2 text-xs text-gray-500">h-6 w-6</span>
			</div>
			<div class="flex flex-col items-center">
				<CheckCircle2 class="h-8 w-8 text-green-500" />
				<span class="mt-2 text-xs text-gray-500">h-8 w-8</span>
			</div>
			<div class="flex flex-col items-center">
				<CheckCircle2 class="h-10 w-10 text-green-500" />
				<span class="mt-2 text-xs text-gray-500">h-10 w-10</span>
			</div>
		</div>
	</section>
</div>
