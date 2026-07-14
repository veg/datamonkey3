<!-- src/lib/Toast.svelte -->
<script>
	import { toastStore } from '../stores/toast';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-svelte';

	// Get icon component based on toast type
	function getIcon(type) {
		switch (type) {
			case 'success':
				return CheckCircle;
			case 'error':
				return XCircle;
			case 'warning':
				return AlertTriangle;
			case 'info':
			default:
				return Info;
		}
	}

	function handleAction(toast) {
		if (toast.onAction) {
			toast.onAction();
		}
		toastStore.dismiss(toast.id);
	}
</script>

<div class="toast-container" aria-live="polite" aria-atomic="true">
	{#each $toastStore as toast (toast.id)}
		<div
			class="toast toast-{toast.type}"
			in:fly={{ x: 300, duration: 300 }}
			out:fade={{ duration: 200 }}
			animate:flip={{ duration: 300 }}
			role="alert"
		>
			<div class="toast-icon">
				<svelte:component this={getIcon(toast.type)} size={20} />
			</div>

			<div class="toast-content">
				<p class="toast-message">{toast.message}</p>

				{#if toast.action}
					<button class="toast-action" on:click={() => handleAction(toast)}>
						{toast.action}
					</button>
				{/if}
			</div>

			<button
				class="toast-dismiss"
				on:click={() => toastStore.dismiss(toast.id)}
				aria-label="Dismiss notification"
			>
				<X size={16} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 400px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 16px;
		background: white;
		border-radius: 10px;
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.15),
			0 0 1px rgba(0, 0, 0, 0.1);
		pointer-events: auto;
		border-left: 4px solid;
	}

	.toast-success {
		border-color: #10b981;
	}

	.toast-success .toast-icon {
		color: #10b981;
	}

	.toast-error {
		border-color: #ef4444;
	}

	.toast-error .toast-icon {
		color: #ef4444;
	}

	.toast-warning {
		border-color: #f59e0b;
	}

	.toast-warning .toast-icon {
		color: #f59e0b;
	}

	.toast-info {
		border-color: #3b82f6;
	}

	.toast-info .toast-icon {
		color: #3b82f6;
	}

	.toast-icon {
		flex-shrink: 0;
		margin-top: 1px;
	}

	.toast-content {
		flex: 1;
		min-width: 0;
	}

	.toast-message {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: #1f2937;
		word-wrap: break-word;
	}

	.toast-action {
		display: inline-block;
		margin-top: 8px;
		padding: 6px 12px;
		background: #f3f4f6;
		border: none;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.toast-action:hover {
		background: #e5e7eb;
	}

	.toast-success .toast-action {
		background: #d1fae5;
		color: #065f46;
	}

	.toast-success .toast-action:hover {
		background: #a7f3d0;
	}

	.toast-dismiss {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		margin: -4px -4px -4px 0;
		background: transparent;
		border: none;
		border-radius: 4px;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toast-dismiss:hover {
		background: #f3f4f6;
		color: #6b7280;
	}

	/* Responsive adjustments */
	@media (max-width: 480px) {
		.toast-container {
			left: 16px;
			right: 16px;
			bottom: 16px;
			max-width: none;
		}
	}
</style>
