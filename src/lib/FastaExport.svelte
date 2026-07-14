<script>
	import { exportData } from './utils/exportUtils';
	import { parseAlignment } from './utils/fastaValidation';
	import { Download } from 'lucide-svelte';

	// Props
	export let alignmentFile = null; // The File object containing the alignment
	export let showExport = true;

	// Internal state
	let exportStatus = '';
	let lineWrap = 60;
	let exportFormat = 'fasta';
	let sequences = [];
	let isLoading = false;

	// Available export formats
	const exportFormats = [
		{ id: 'fasta', label: 'FASTA', description: 'Standard FASTA format' },
		{ id: 'nexus', label: 'NEXUS', description: 'NEXUS format for phylogenetic analysis' }
	];

	// Parse sequences when alignmentFile changes
	$: if (alignmentFile) {
		parseAlignmentFile();
	}

	/**
	 * Parse sequences from the alignment file (FASTA or NEXUS format)
	 */
	async function parseAlignmentFile() {
		if (!alignmentFile) {
			sequences = [];
			return;
		}

		isLoading = true;
		try {
			const content = await alignmentFile.text();
			sequences = parseFastaOrNexus(content);
		} catch (error) {
			console.error('Error parsing alignment file:', error);
			sequences = [];
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Parse FASTA or NEXUS format content using shared utility
	 */
	function parseFastaOrNexus(content) {
		const { sequences } = parseAlignment(content.trim());
		return sequences.map(s => ({ name: s.header, sequence: s.sequence }));
	}

	/**
	 * Generate FASTA format text from sequences
	 */
	function generateFastaText(seqs, options = {}) {
		const { wrap = lineWrap } = options;
		let fastaText = '';

		for (const seq of seqs) {
			// Add header
			fastaText += `>${seq.name}\n`;

			// Add sequence with line wrapping
			let sequence = seq.sequence;

			// Wrap the sequence
			if (wrap > 0) {
				for (let i = 0; i < sequence.length; i += wrap) {
					fastaText += sequence.substring(i, i + wrap) + '\n';
				}
			} else {
				fastaText += sequence + '\n';
			}
		}

		return fastaText;
	}

	/**
	 * Generate NEXUS format text from sequences
	 */
	function generateNexusText(seqs) {
		if (seqs.length === 0) return '';

		const nchar = seqs[0].sequence.length;
		const ntax = seqs.length;

		let nexusText = '#NEXUS\n\n';
		nexusText += 'BEGIN DATA;\n';
		nexusText += `  DIMENSIONS NTAX=${ntax} NCHAR=${nchar};\n`;
		nexusText += '  FORMAT DATATYPE=DNA GAP=- MISSING=?;\n';
		nexusText += '  MATRIX\n';

		for (const seq of seqs) {
			// Pad sequence name to align sequences
			const paddedName = seq.name.padEnd(30);
			nexusText += `    ${paddedName} ${seq.sequence}\n`;
		}

		nexusText += '  ;\n';
		nexusText += 'END;\n';

		return nexusText;
	}

	/**
	 * Export sequences in the selected format
	 */
	function exportSequences() {
		try {
			if (sequences.length === 0) {
				exportStatus = 'No sequence data available';
				setTimeout(() => {
					exportStatus = '';
				}, 3000);
				return;
			}

			// Generate a filename
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
			const baseFilename = alignmentFile?.name?.replace(/\.[^/.]+$/, '') || 'sequences';
			const filename = `${baseFilename}_${timestamp}`;

			// Generate content based on format
			let content;
			let format;

			switch (exportFormat) {
				case 'fasta':
					content = generateFastaText(sequences, { wrap: lineWrap });
					format = 'fasta';
					break;

				case 'nexus':
					content = generateNexusText(sequences);
					format = 'nex';
					break;
			}

			// Export the data
			exportData(content, filename, format);

			exportStatus = 'Exported successfully';
			setTimeout(() => {
				exportStatus = '';
			}, 3000);
		} catch (error) {
			console.error('Error exporting sequences:', error);
			exportStatus = `Export failed: ${error.message}`;
			setTimeout(() => {
				exportStatus = '';
			}, 5000);
		}
	}
</script>

{#if alignmentFile && showExport}
	<h2 class="mb-premium-md text-premium-header font-semibold text-text-rich">Export Sequences</h2>
	<div class="fasta-export rounded-premium border border-border-platinum bg-white p-premium-lg shadow-premium">

		{#if isLoading}
			<p class="text-sm text-text-silver">Loading sequences...</p>
		{:else if sequences.length === 0}
			<p class="text-sm text-text-silver">No sequences found in alignment file.</p>
		{:else}
			<p class="mb-3 text-sm text-text-silver">
				{sequences.length} sequences loaded ({sequences[0]?.sequence?.length || 0} sites)
			</p>

			<div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<!-- Export format -->
				<div>
					<label class="mb-1 block text-sm font-medium">Format:</label>
					<div class="flex flex-wrap gap-2">
						{#each exportFormats as format}
							<label class="flex cursor-pointer items-center">
								<input
									type="radio"
									name="exportFormat"
									value={format.id}
									bind:group={exportFormat}
									class="mr-1"
								/>
								<span class="mr-1 text-sm font-medium">{format.label}</span>
							</label>
						{/each}
					</div>
				</div>

				<!-- FASTA options (conditional) -->
				{#if exportFormat === 'fasta'}
					<div>
						<label class="mb-1 block text-sm font-medium">Options:</label>
						<div class="flex items-center">
							<label class="mr-1 text-sm">Line wrap:</label>
							<input
								type="number"
								bind:value={lineWrap}
								min="0"
								max="10000"
								step="10"
								class="w-16 rounded border border-border-subtle px-2 py-1 text-sm"
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Export button -->
			<div class="export-actions flex items-center">
				<button
					on:click={exportSequences}
					class="flex items-center rounded bg-brand-royal px-3 py-1 text-white hover:bg-brand-deep"
				>
					<Download class="mr-1 h-4 w-4" />
					Export Sequences
				</button>

				{#if exportStatus}
					<span
						class="ml-3 text-sm"
						class:text-status-success={!exportStatus.includes('failed')}
						class:text-status-error={exportStatus.includes('failed')}
					>
						{exportStatus}
					</span>
				{/if}
			</div>

			<!-- Help text -->
			<div class="mt-3 text-xs text-text-silver">
				{#if exportFormat === 'fasta'}
					<p>
						Exports sequences in standard FASTA format with each sequence preceded by a header line
						(starting with &gt;).
					</p>
				{:else if exportFormat === 'nexus'}
					<p>
						Exports sequences in NEXUS format, commonly used for phylogenetic analysis software.
					</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}
