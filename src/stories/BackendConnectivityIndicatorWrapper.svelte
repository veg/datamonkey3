<script>
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';

	// Accept mocked store as prop for Storybook
	export let mockBackendConnectivity = null;

	// Use mocked store if provided, otherwise create default
	const defaultBackendConnectivity = writable({
		isConnected: false,
		isConnecting: false,
		serverUrl: 'https://datamonkey.temple.edu',
		lastChecked: null,
		error: null
	});

	const backendConnectivity = mockBackendConnectivity || defaultBackendConnectivity;

	// No-op functions for Storybook compatibility
	const initializeBackendConnectivity = () => {};
	const disconnectBackend = () => {};

	onMount(() => {
		// Initialize persistent connection when component mounts
		initializeBackendConnectivity();
	});

	onDestroy(() => {
		// Clean up when component is destroyed
		disconnectBackend();
	});

	// Reactive statements for status
	$: status = $backendConnectivity.isConnecting
		? 'connecting'
		: $backendConnectivity.isConnected
			? 'connected'
			: 'disconnected';

	$: statusColor = {
		connecting: 'bg-yellow-400',
		connected: 'bg-green-500',
		disconnected: 'bg-red-500'
	}[status];

	$: tooltipText = {
		connecting: 'Connecting to Datamonkey server...',
		connected: `Datamonkey server connected (${$backendConnectivity.serverUrl})`,
		disconnected: $backendConnectivity.error
			? `Datamonkey server disconnected: ${$backendConnectivity.error}`
			: 'Datamonkey server disconnected'
	}[status];
</script>

<div class="relative inline-flex items-center">
	<div
		class="group relative flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm"
		title={tooltipText}
	>
		<!-- Status dot -->
		<div
			class="h-3 w-3 rounded-full {statusColor} {status === 'connecting' ? 'animate-pulse' : ''}"
		></div>

		<!-- Tooltip -->
		<div
			class="pointer-events-none absolute right-0 top-full mt-2 hidden w-max max-w-xs rounded-md bg-gray-900 px-3 py-2 text-sm text-white shadow-lg group-hover:block"
		>
			{tooltipText}
			{#if $backendConnectivity.lastChecked}
				<div class="mt-1 text-xs text-gray-300">
					Last checked: {$backendConnectivity.lastChecked.toLocaleTimeString()}
				</div>
			{/if}
			<!-- Tooltip arrow -->
			<div
				class="absolute bottom-full right-6 h-2 w-2 rotate-45 bg-gray-900"
				style="margin-bottom: -4px;"
			></div>
		</div>
	</div>
</div>
