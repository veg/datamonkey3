<script>
	// Living reference for the Datamonkey design tokens defined in tailwind.config.ts.
	// Every swatch/sample below uses the REAL named Tailwind classes so this page
	// tracks the config automatically. Hex values appear only as printed labels.

	const brand = [
		{
			name: 'brand-royal',
			hex: '#7c3aed',
			use: 'Brand primary, major actions',
			bg: 'bg-brand-royal',
			dark: true
		},
		{
			name: 'brand-deep',
			hex: '#6b46c1',
			use: 'Interactive states, selections',
			bg: 'bg-brand-deep',
			dark: true
		},
		{
			name: 'brand-muted',
			hex: '#8b5cf6',
			use: 'Hover states, secondary actions',
			bg: 'bg-brand-muted',
			dark: true
		},
		{
			name: 'brand-whisper',
			hex: '#f3f4f6',
			use: 'Subtle backgrounds, cards',
			bg: 'bg-brand-whisper',
			dark: false
		},
		{
			name: 'brand-ghost',
			hex: '#faf9fc',
			use: 'Page backgrounds, breathing room',
			bg: 'bg-brand-ghost',
			dark: false
		}
	];

	const accent = [
		{
			name: 'accent-copper',
			hex: '#c2410c',
			use: 'Status excellence, completed',
			bg: 'bg-accent-copper',
			dark: true
		},
		{
			name: 'accent-warm',
			hex: '#ea580c',
			use: 'Active progress, attention',
			bg: 'bg-accent-warm',
			dark: true
		},
		{
			name: 'accent-soft',
			hex: '#fb923c',
			use: 'Indicators, time elements',
			bg: 'bg-accent-soft',
			dark: false
		},
		{
			name: 'accent-cream',
			hex: '#fed7aa',
			use: 'Highlights, gentle backgrounds',
			bg: 'bg-accent-cream',
			dark: false
		},
		{
			name: 'accent-pearl',
			hex: '#fffbf5',
			use: 'Subtle accents, warm neutrals',
			bg: 'bg-accent-pearl',
			dark: false
		}
	];

	const textNeutrals = [
		{
			name: 'text-rich',
			hex: '#111827',
			use: 'Headlines, primary text',
			bg: 'bg-text-rich',
			dark: true
		},
		{
			name: 'text-slate',
			hex: '#475569',
			use: 'Body text, descriptions',
			bg: 'bg-text-slate',
			dark: true
		},
		{
			name: 'text-silver',
			hex: '#94a3b8',
			use: 'Secondary text, metadata',
			bg: 'bg-text-silver',
			dark: true
		}
	];

	const borders = [
		{
			name: 'border-platinum',
			hex: '#f1f5f9',
			use: 'Borders, dividers',
			bg: 'bg-border-platinum',
			dark: false
		},
		{
			name: 'border-subtle',
			hex: '#e2e8f0',
			use: 'Slightly stronger borders',
			bg: 'bg-border-subtle',
			dark: false
		}
	];

	const surfaces = [
		{
			name: 'surface-base',
			hex: '#ffffff',
			use: 'Primary surface',
			bg: 'bg-surface-base',
			dark: false
		},
		{
			name: 'surface-raised',
			hex: '#f8fafc',
			use: 'Elevated elements',
			bg: 'bg-surface-raised',
			dark: false
		},
		{
			name: 'surface-sunken',
			hex: '#f1f5f9',
			use: 'Recessed areas, inputs',
			bg: 'bg-surface-sunken',
			dark: false
		},
		{
			name: 'surface-overlay',
			hex: '#1e293b',
			use: 'Dark overlays, tooltips',
			bg: 'bg-surface-overlay',
			dark: true
		}
	];

	const status = [
		{
			label: 'Success',
			base: { name: 'status-success', hex: '#16a34a', bg: 'bg-status-success', dark: true },
			soft: {
				name: 'status-success-soft',
				hex: '#22c55e',
				bg: 'bg-status-success-soft',
				dark: true
			},
			swatchBg: 'bg-status-success-bg',
			swatchBorder: 'border-status-success-border',
			swatchText: 'text-status-success-text',
			variants: [
				{ name: 'status-success-bg', hex: '#f0fdf4' },
				{ name: 'status-success-border', hex: '#bbf7d0' },
				{ name: 'status-success-text', hex: '#166534' }
			]
		},
		{
			label: 'Error',
			base: { name: 'status-error', hex: '#dc2626', bg: 'bg-status-error', dark: true },
			soft: { name: 'status-error-soft', hex: '#ef4444', bg: 'bg-status-error-soft', dark: true },
			swatchBg: 'bg-status-error-bg',
			swatchBorder: 'border-status-error-border',
			swatchText: 'text-status-error-text',
			variants: [
				{ name: 'status-error-bg', hex: '#fef2f2' },
				{ name: 'status-error-border', hex: '#fecaca' },
				{ name: 'status-error-text', hex: '#991b1b' }
			]
		},
		{
			label: 'Warning',
			base: { name: 'status-warning', hex: '#d97706', bg: 'bg-status-warning', dark: true },
			soft: {
				name: 'status-warning-soft',
				hex: '#f59e0b',
				bg: 'bg-status-warning-soft',
				dark: true
			},
			swatchBg: 'bg-status-warning-bg',
			swatchBorder: 'border-status-warning-border',
			swatchText: 'text-status-warning-text',
			variants: [
				{ name: 'status-warning-bg', hex: '#fffbeb' },
				{ name: 'status-warning-border', hex: '#fde68a' },
				{ name: 'status-warning-text', hex: '#92400e' }
			]
		},
		{
			label: 'Info',
			base: { name: 'status-info', hex: '#2563eb', bg: 'bg-status-info', dark: true },
			soft: { name: 'status-info-soft', hex: '#3b82f6', bg: 'bg-status-info-soft', dark: true },
			swatchBg: 'bg-status-info-bg',
			swatchBorder: 'border-status-info-border',
			swatchText: 'text-status-info-text',
			variants: [
				{ name: 'status-info-bg', hex: '#eff6ff' },
				{ name: 'status-info-border', hex: '#bfdbfe' },
				{ name: 'status-info-text', hex: '#1e40af' }
			]
		}
	];

	const textSizes = [
		{ name: 'text-premium-caption', px: '11px', cls: 'text-premium-caption' },
		{ name: 'text-premium-meta', px: '12px', cls: 'text-premium-meta' },
		{ name: 'text-premium-body', px: '14px', cls: 'text-premium-body' },
		{ name: 'text-premium-brand', px: '16px', cls: 'text-premium-brand' },
		{ name: 'text-premium-title', px: '18px', cls: 'text-premium-title' },
		{ name: 'text-premium-header', px: '20px', cls: 'text-premium-header' },
		{ name: 'text-premium-headline', px: '24px', cls: 'text-premium-headline' }
	];

	const spacing = [
		{ name: 'premium-xs', px: '4px', w: 'w-premium-xs' },
		{ name: 'premium-sm', px: '8px', w: 'w-premium-sm' },
		{ name: 'premium-md', px: '16px', w: 'w-premium-md' },
		{ name: 'premium-lg', px: '24px', w: 'w-premium-lg' },
		{ name: 'premium-xl', px: '32px', w: 'w-premium-xl' },
		{ name: 'premium-2xl', px: '48px', w: 'w-premium-2xl' },
		{ name: 'premium-3xl', px: '64px', w: 'w-premium-3xl' }
	];

	const radii = [
		{ name: 'rounded-premium-sm', px: '8px', cls: 'rounded-premium-sm' },
		{ name: 'rounded-premium', px: '10px', cls: 'rounded-premium' },
		{ name: 'rounded-premium-lg', px: '12px', cls: 'rounded-premium-lg' },
		{ name: 'rounded-premium-xl', px: '20px', cls: 'rounded-premium-xl' }
	];

	const shadows = [
		{ name: 'shadow-premium', spec: '0 4px 12px rgba(0,0,0,0.05)', cls: 'shadow-premium' },
		{
			name: 'shadow-premium-hover',
			spec: '0 8px 16px rgba(0,0,0,0.08)',
			cls: 'shadow-premium-hover'
		}
	];

	const animations = [
		{ name: 'animate-pulse-premium', spec: 'pulse-premium 2s cubic-bezier(0.4,0,0.6,1) infinite' },
		{ name: 'animate-fade-in', spec: 'fade-in 0.3s ease-out' },
		{ name: 'animate-fade-in-up', spec: 'fade-in-up 0.4s ease-out' },
		{ name: 'animate-slide-in-right', spec: 'slide-in-right 0.3s ease-out' },
		{ name: 'animate-scale-in', spec: 'scale-in 0.2s ease-out' }
	];
</script>

<div class="min-h-screen bg-brand-ghost p-premium-2xl font-sans text-text-slate">
	<div class="mx-auto max-w-5xl">
		<header class="mb-premium-2xl">
			<p
				class="mb-premium-sm text-premium-caption font-semibold uppercase tracking-premium-badge text-brand-royal"
			>
				Datamonkey Design System
			</p>
			<h1 class="font-display text-premium-headline tracking-premium-tight text-text-rich">
				Design Tokens
			</h1>
			<p class="mt-premium-sm max-w-3xl text-premium-body text-text-slate">
				A living reference for the named tokens defined in
				<code class="font-mono text-text-rich">tailwind.config.ts</code>. Every swatch and sample
				below renders with the real Tailwind classes, so this page tracks the config.
			</p>
		</header>

		<!-- COLORS -->
		<section class="mb-premium-2xl">
			<h2 class="mb-premium-lg font-display text-premium-header text-text-rich">Colors</h2>

			<h3 class="mb-premium-sm text-premium-title font-semibold text-text-rich">
				Brand — purple family
			</h3>
			<div class="mb-premium-lg grid grid-cols-1 gap-premium-md sm:grid-cols-2 lg:grid-cols-3">
				{#each brand as c (c.name)}
					<div class="rounded-premium border border-border-platinum bg-surface-base shadow-premium">
						<div class="h-16 rounded-t-premium {c.bg}"></div>
						<div class="p-premium-md">
							<div class="font-mono text-premium-meta text-text-rich">{c.name}</div>
							<div class="font-mono text-premium-caption text-text-silver">{c.hex}</div>
							<div class="mt-premium-xs text-premium-caption text-text-slate">{c.use}</div>
						</div>
					</div>
				{/each}
			</div>

			<h3 class="mb-premium-sm text-premium-title font-semibold text-text-rich">
				Accent — copper family
			</h3>
			<div class="mb-premium-lg grid grid-cols-1 gap-premium-md sm:grid-cols-2 lg:grid-cols-3">
				{#each accent as c (c.name)}
					<div class="rounded-premium border border-border-platinum bg-surface-base shadow-premium">
						<div class="h-16 rounded-t-premium {c.bg}"></div>
						<div class="p-premium-md">
							<div class="font-mono text-premium-meta text-text-rich">{c.name}</div>
							<div class="font-mono text-premium-caption text-text-silver">{c.hex}</div>
							<div class="mt-premium-xs text-premium-caption text-text-slate">{c.use}</div>
						</div>
					</div>
				{/each}
			</div>

			<h3 class="mb-premium-sm text-premium-title font-semibold text-text-rich">Text</h3>
			<div class="mb-premium-lg grid grid-cols-1 gap-premium-md sm:grid-cols-2 lg:grid-cols-3">
				{#each textNeutrals as c (c.name)}
					<div class="rounded-premium border border-border-platinum bg-surface-base shadow-premium">
						<div class="h-16 rounded-t-premium {c.bg}"></div>
						<div class="p-premium-md">
							<div class="font-mono text-premium-meta text-text-rich">{c.name}</div>
							<div class="font-mono text-premium-caption text-text-silver">{c.hex}</div>
							<div class="mt-premium-xs text-premium-caption text-text-slate">{c.use}</div>
						</div>
					</div>
				{/each}
			</div>

			<h3 class="mb-premium-sm text-premium-title font-semibold text-text-rich">Borders</h3>
			<div class="mb-premium-lg grid grid-cols-1 gap-premium-md sm:grid-cols-2 lg:grid-cols-3">
				{#each borders as c (c.name)}
					<div class="rounded-premium border border-border-subtle bg-surface-base shadow-premium">
						<div class="h-16 rounded-t-premium border-b border-border-subtle {c.bg}"></div>
						<div class="p-premium-md">
							<div class="font-mono text-premium-meta text-text-rich">{c.name}</div>
							<div class="font-mono text-premium-caption text-text-silver">{c.hex}</div>
							<div class="mt-premium-xs text-premium-caption text-text-slate">{c.use}</div>
						</div>
					</div>
				{/each}
			</div>

			<h3 class="mb-premium-sm text-premium-title font-semibold text-text-rich">Surfaces</h3>
			<div class="grid grid-cols-1 gap-premium-md sm:grid-cols-2 lg:grid-cols-4">
				{#each surfaces as c (c.name)}
					<div class="rounded-premium border border-border-subtle bg-surface-base shadow-premium">
						<div class="h-16 rounded-t-premium border-b border-border-subtle {c.bg}"></div>
						<div class="p-premium-md">
							<div class="font-mono text-premium-meta text-text-rich">{c.name}</div>
							<div class="font-mono text-premium-caption text-text-silver">{c.hex}</div>
							<div class="mt-premium-xs text-premium-caption text-text-slate">{c.use}</div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- SEMANTIC STATUS -->
		<section class="mb-premium-2xl">
			<h2 class="mb-premium-lg font-display text-premium-header text-text-rich">
				Semantic status colors
			</h2>
			<div class="grid grid-cols-1 gap-premium-md sm:grid-cols-2">
				{#each status as s (s.label)}
					<div
						class="rounded-premium border border-border-platinum bg-surface-base p-premium-md shadow-premium"
					>
						<div class="mb-premium-sm text-premium-title font-semibold text-text-rich">
							{s.label}
						</div>
						<div class="mb-premium-sm flex gap-premium-sm">
							<div class="flex-1">
								<div class="h-10 rounded-premium-sm {s.base.bg}"></div>
								<div class="mt-premium-xs font-mono text-premium-caption text-text-rich">
									{s.base.name}
								</div>
								<div class="font-mono text-premium-caption text-text-silver">{s.base.hex}</div>
							</div>
							<div class="flex-1">
								<div class="h-10 rounded-premium-sm {s.soft.bg}"></div>
								<div class="mt-premium-xs font-mono text-premium-caption text-text-rich">
									{s.soft.name}
								</div>
								<div class="font-mono text-premium-caption text-text-silver">{s.soft.hex}</div>
							</div>
						</div>
						<!-- The -bg / -border / -text trio composed as a real status callout -->
						<div
							class="rounded-premium-sm border p-premium-sm {s.swatchBg} {s.swatchBorder} {s.swatchText}"
						>
							<div class="text-premium-meta font-semibold">
								{s.label} message using -bg / -border / -text
							</div>
							<div class="mt-premium-xs font-mono text-premium-caption">
								{#each s.variants as v, i (v.name)}{v.name}
									{v.hex}{#if i < s.variants.length - 1}
										·
									{/if}{/each}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- TYPOGRAPHY -->
		<section class="mb-premium-2xl">
			<h2 class="mb-premium-lg font-display text-premium-header text-text-rich">Typography</h2>

			<div class="mb-premium-lg space-y-premium-md">
				<div
					class="rounded-premium border border-border-platinum bg-surface-base p-premium-md shadow-premium"
				>
					<div class="mb-premium-xs font-mono text-premium-caption text-text-silver">
						font-display · DM Serif Display · headlines
					</div>
					<p class="font-display text-premium-headline tracking-premium-tight text-text-rich">
						Detecting selection across the tree of life.
					</p>
				</div>
				<div
					class="rounded-premium border border-border-platinum bg-surface-base p-premium-md shadow-premium"
				>
					<div class="mb-premium-xs font-mono text-premium-caption text-text-silver">
						font-sans · Source Sans 3 · body / UI
					</div>
					<p class="font-sans text-premium-body text-text-slate">
						Datamonkey is a scientific web platform for evolutionary molecular biology — calm,
						precise, and trustworthy.
					</p>
				</div>
				<div
					class="rounded-premium border border-border-platinum bg-surface-base p-premium-md shadow-premium"
				>
					<div class="mb-premium-xs font-mono text-premium-caption text-text-silver">
						font-mono · JetBrains Mono · code / data / IDs
					</div>
					<p class="font-mono text-premium-body text-text-rich">
						hyphy meme --alignment seqs.fasta --tree tree.nwk
					</p>
				</div>
			</div>

			<h3 class="mb-premium-sm text-premium-title font-semibold text-text-rich">
				Named size scale
			</h3>
			<div
				class="divide-y divide-border-platinum rounded-premium border border-border-platinum bg-surface-base shadow-premium"
			>
				{#each textSizes as t (t.name)}
					<div class="flex items-baseline gap-premium-md p-premium-md">
						<div class="w-56 shrink-0 font-mono text-premium-caption text-text-silver">
							{t.name} · {t.px}
						</div>
						<div class="{t.cls} font-sans text-text-rich">Aa Selection Bb 24</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- SPACING -->
		<section class="mb-premium-2xl">
			<h2 class="mb-premium-lg font-display text-premium-header text-text-rich">Spacing</h2>
			<div
				class="space-y-premium-sm rounded-premium border border-border-platinum bg-surface-base p-premium-md shadow-premium"
			>
				{#each spacing as s (s.name)}
					<div class="flex items-center gap-premium-md">
						<div class="w-40 shrink-0 font-mono text-premium-caption text-text-silver">
							{s.name} · {s.px}
						</div>
						<div class="h-4 rounded-premium-sm bg-brand-royal {s.w}"></div>
					</div>
				{/each}
			</div>
		</section>

		<!-- RADIUS -->
		<section class="mb-premium-2xl">
			<h2 class="mb-premium-lg font-display text-premium-header text-text-rich">Radius</h2>
			<div class="grid grid-cols-2 gap-premium-md sm:grid-cols-4">
				{#each radii as r (r.name)}
					<div class="text-center">
						<div
							class="mb-premium-sm flex h-24 items-center justify-center border border-border-subtle bg-brand-whisper {r.cls}"
						></div>
						<div class="font-mono text-premium-caption text-text-rich">{r.name}</div>
						<div class="font-mono text-premium-caption text-text-silver">{r.px}</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- SHADOW -->
		<section class="mb-premium-2xl">
			<h2 class="mb-premium-lg font-display text-premium-header text-text-rich">Shadow</h2>
			<div class="grid grid-cols-1 gap-premium-lg sm:grid-cols-2">
				{#each shadows as sh (sh.name)}
					<div class="rounded-premium bg-surface-base p-premium-lg {sh.cls}">
						<div class="font-mono text-premium-meta text-text-rich">{sh.name}</div>
						<div class="mt-premium-xs font-mono text-premium-caption text-text-silver">
							{sh.spec}
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- MOTION -->
		<section class="mb-premium-2xl">
			<h2 class="mb-premium-lg font-display text-premium-header text-text-rich">Motion</h2>
			<div
				class="rounded-premium border border-border-platinum bg-surface-base p-premium-md shadow-premium"
			>
				<p class="mb-premium-md text-premium-body text-text-slate">
					Transitions use <code class="font-mono text-text-rich">duration-premium</code> (200ms)
					with <code class="font-mono text-text-rich">ease-premium</code>
					<span class="font-mono text-premium-caption text-text-silver"
						>cubic-bezier(0.4, 0, 0.2, 1)</span
					>. Motion clarifies a state change; it never entertains.
				</p>
				<div class="mb-premium-md">
					<div class="mb-premium-xs font-mono text-premium-caption text-text-silver">
						hover me — transition-colors duration-premium ease-premium
					</div>
					<button
						class="rounded-premium bg-brand-royal px-premium-lg py-premium-sm font-sans text-premium-body font-semibold text-white transition-colors duration-premium ease-premium hover:bg-brand-deep"
					>
						Primary action
					</button>
				</div>
				<div class="font-mono text-premium-caption text-text-slate">
					Named animations:
					<ul class="mt-premium-xs space-y-premium-xs">
						{#each animations as a (a.name)}
							<li>
								<span class="text-text-rich">{a.name}</span>
								<span class="text-text-silver">— {a.spec}</span>
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</section>
	</div>
</div>
