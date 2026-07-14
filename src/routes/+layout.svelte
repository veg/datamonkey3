<script lang="ts">
	import '../app.css';
	import AnalysisStatusIndicator from '../lib/AnalysisStatusIndicator.svelte';
	import BackendConnectivityIndicator from '../lib/BackendConnectivityIndicator.svelte';
	import Toast from '../lib/Toast.svelte';
	import { X, Menu, FlaskConical } from 'lucide-svelte';
	import { env } from '$env/dynamic/public';
	import { afterNavigate } from '$app/navigation';

	// Get version from Vite define
	const version = __APP_VERSION__;

	// Announcement banner state
	let bannerDismissed = $state(false);

	// Umami analytics (only if configured)
	const umamiUrl = env.PUBLIC_UMAMI_URL;
	const umamiWebsiteId = env.PUBLIC_UMAMI_WEBSITE_ID;
	const umamiEnabled = umamiUrl && umamiWebsiteId;

	let { children } = $props();

	// Mobile menu state
	let mobileMenuOpen = $state(false);

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	// Track SPA route changes in Umami so each navigation registers as a pageview
	afterNavigate(() => {
		if (typeof window.umami !== 'undefined') {
			window.umami.track();
		}
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/katex@0.12.0/dist/katex.min.css"
		integrity="sha384-AfEj0r4/OFrOo5t7NnNe46zW/tFgW6x/bCJG8FqQCEo3+Aro6EYUG4+cU+KJWu/X"
		crossorigin="anonymous"
	/>
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
	/>
	<title>Datamonkey 3 - Sequence Analysis Platform</title>
	{#if umamiEnabled}
		{@html `<script defer src="${umamiUrl}" data-website-id="${umamiWebsiteId}"></script>`}
	{/if}
</svelte:head>

<div class="flex min-h-screen flex-col bg-brand-ghost">
	<!-- PRIME Announcement Banner -->
	{#if !bannerDismissed}
		<div class="prime-banner">
			<div class="container mx-auto flex items-center justify-between px-4 py-2.5 sm:px-premium-xl">
				<div class="flex flex-1 items-center justify-center gap-2 text-sm font-medium">
					<FlaskConical size={16} class="shrink-0" />
					<span>
						<strong>New:</strong> PRIME — Property-Informed Models of Evolution is now available.
						<a
							href="https://www.biorxiv.org/content/10.64898/2026.03.09.710461v1"
							target="_blank"
							rel="noopener noreferrer"
							class="prime-banner-link"
						>
							Read the preprint &rarr;
						</a>
					</span>
				</div>
				<button
					type="button"
					class="prime-banner-close"
					onclick={() => bannerDismissed = true}
					aria-label="Dismiss announcement"
				>
					<X size={16} />
				</button>
			</div>
		</div>
	{/if}

	<nav class="border-b border-border-platinum bg-white shadow-sm">
		<div class="container mx-auto flex items-center justify-between px-4 py-3 sm:px-premium-xl sm:py-premium-md">
			<a class="flex items-center gap-2" href="/?tab=data" onclick={closeMobileMenu}>
				<img src="/img/logo.png" alt="Datamonkey logo" class="h-8 w-auto" />
				<span class="text-lg font-bold tracking-premium-tight text-text-rich sm:text-premium-header">
					<span class="text-brand-royal">Datamonkey</span> <span class="text-accent-copper">3</span>
				</span>
				<span class="rounded bg-accent-copper px-1.5 py-0.5 text-xs font-semibold text-white">BETA</span>
			</a>

			<!-- Mobile menu button -->
			<button
				type="button"
				class="inline-flex h-11 w-11 items-center justify-center rounded-premium-sm text-text-slate hover:bg-brand-whisper hover:text-brand-royal focus:outline-none focus:ring-2 focus:ring-brand-royal sm:hidden"
				aria-controls="mobile-menu"
				aria-expanded={mobileMenuOpen}
				onclick={toggleMobileMenu}
			>
				<span class="sr-only">Open main menu</span>
				{#if mobileMenuOpen}
					<X class="h-6 w-6" />
				{:else}
					<Menu class="h-6 w-6" />
				{/if}
			</button>

			<!-- Desktop navigation -->
			<div class="hidden items-center space-x-premium-lg sm:flex">
				<ul class="flex items-center space-x-premium-lg">
					<li>
						<a
							class="rounded-premium-sm px-3 py-2 text-premium-brand font-medium text-text-rich transition-colors duration-premium hover:bg-brand-whisper hover:text-brand-royal"
							href="http://help.datamonkey.org"
							target="_blank"
							rel="noopener noreferrer"
						>
							Help
						</a>
					</li>
				</ul>

				<!-- Analysis Status Indicator -->
				<AnalysisStatusIndicator />

				<!-- Backend Connectivity Indicator -->
				<BackendConnectivityIndicator />
			</div>
		</div>

		<!-- Mobile menu -->
		{#if mobileMenuOpen}
			<div class="border-t border-border-platinum sm:hidden" id="mobile-menu">
				<div class="space-y-1 px-4 pb-4 pt-2">
					<a
						class="block rounded-premium-sm px-3 py-3 text-base font-medium text-text-rich transition-colors duration-premium hover:bg-brand-whisper hover:text-brand-royal"
						href="http://help.datamonkey.org"
						target="_blank"
						rel="noopener noreferrer"
					>
						Help
					</a>
				</div>
				<div class="border-t border-border-platinum px-4 py-3">
					<div class="flex items-center justify-between">
						<span class="text-sm text-text-slate">Status</span>
						<div class="flex items-center space-x-3">
							<AnalysisStatusIndicator />
							<BackendConnectivityIndicator />
						</div>
					</div>
				</div>
			</div>
		{/if}
	</nav>

	<main class="container mx-auto flex-grow px-4 py-6 sm:p-premium-xl">
		{@render children()}
	</main>

	<footer class="border-t border-border-platinum bg-white py-6 sm:py-premium-xl">
		<div class="container mx-auto px-4 sm:px-premium-xl">
			<div class="flex flex-col items-center justify-between gap-4 md:flex-row">
				<div>
					<p class="text-sm text-text-silver sm:text-premium-meta">
						Version {version}
					</p>
				</div>
				<div class="flex items-center gap-6">
					<a
						class="min-h-[44px] flex items-center rounded-premium-sm px-2 py-2 text-base text-text-slate transition-colors duration-premium hover:bg-brand-whisper hover:text-brand-royal sm:text-premium-body"
						href="https://github.com/stevenweaver/datamonkey3"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<a
						class="min-h-[44px] flex items-center rounded-premium-sm px-2 py-2 text-base text-text-slate transition-colors duration-premium hover:bg-brand-whisper hover:text-brand-royal sm:text-premium-body"
						href="https://hyphy.org"
						target="_blank"
						rel="noopener noreferrer"
					>
						HyPhy
					</a>
				</div>
			</div>
		</div>
	</footer>
</div>

<!-- Global Toast Notifications -->
<Toast />

<style>
	.prime-banner {
		background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 50%, #5b21b6 100%);
		color: white;
	}

	.prime-banner-link {
		color: #fed7aa;
		text-decoration: underline;
		text-decoration-color: rgba(254, 215, 170, 0.4);
		text-underline-offset: 2px;
	}

	.prime-banner-link:hover {
		color: white;
		text-decoration-color: white;
	}

	.prime-banner-close {
		padding: 4px;
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 200ms;
	}

	.prime-banner-close:hover {
		color: white;
		background: rgba(255, 255, 255, 0.15);
	}
</style>
