import { writable } from 'svelte/store';
import io from 'socket.io-client';
import { DATAMONKEY_SERVER_URL } from '../lib/config/env.ts';

// Store for backend connectivity status
export const backendConnectivity = writable({
	isConnected: false,
	isConnecting: false,
	serverUrl: DATAMONKEY_SERVER_URL,
	lastChecked: null,
	error: null
});

// Store the persistent socket instance
let persistentSocket = null;

// Reference count of active consumers (mounted indicators, tabs, etc.).
// The singleton socket is built once when the count goes 0 -> 1 and only
// torn down when it returns to 0, so one consumer's teardown can't stomp
// a socket another still needs.
let referenceCount = 0;

// Function to initialize persistent backend connection
export function initializeBackendConnectivity(serverUrl = DATAMONKEY_SERVER_URL) {
	// Track this consumer. If a socket already exists for the same URL, just
	// share it rather than rebuilding (which would disrupt other consumers).
	referenceCount += 1;
	if (persistentSocket) {
		return persistentSocket;
	}

	backendConnectivity.update((state) => ({
		...state,
		isConnecting: true,
		error: null,
		serverUrl
	}));

	// Create persistent socket connection (like demo pages)
	persistentSocket = io(serverUrl, {
		timeout: 5000,
		reconnection: true,
		reconnectionDelay: 1000,
		reconnectionAttempts: 5
	});

	// Set up event handlers
	persistentSocket.on('connect', () => {
		console.log('✅ Backend connectivity: Connected to Datamonkey server');
		backendConnectivity.update((state) => ({
			...state,
			isConnected: true,
			isConnecting: false,
			lastChecked: new Date(),
			error: null
		}));
	});

	persistentSocket.on('disconnect', (reason) => {
		console.log('🔌 Backend connectivity: Disconnected from Datamonkey server', reason);
		backendConnectivity.update((state) => ({
			...state,
			isConnected: false,
			isConnecting: false,
			lastChecked: new Date(),
			error: `Disconnected: ${reason}`
		}));
	});

	persistentSocket.on('connect_error', (error) => {
		console.log('❌ Backend connectivity: Connection failed', error);
		backendConnectivity.update((state) => ({
			...state,
			isConnected: false,
			isConnecting: false,
			lastChecked: new Date(),
			error: error.message || 'Connection failed'
		}));
	});

	persistentSocket.on('reconnect', (attemptNumber) => {
		console.log('🔄 Backend connectivity: Reconnected after', attemptNumber, 'attempts');
		backendConnectivity.update((state) => ({
			...state,
			isConnected: true,
			isConnecting: false,
			lastChecked: new Date(),
			error: null
		}));
	});

	persistentSocket.on('reconnecting', (attemptNumber) => {
		console.log('🔄 Backend connectivity: Reconnecting attempt', attemptNumber);
		backendConnectivity.update((state) => ({
			...state,
			isConnected: false,
			isConnecting: true,
			error: `Reconnecting (attempt ${attemptNumber})`
		}));
	});

	persistentSocket.on('reconnect_error', (error) => {
		console.log('❌ Backend connectivity: Reconnection failed', error);
		backendConnectivity.update((state) => ({
			...state,
			isConnected: false,
			isConnecting: false,
			error: `Reconnection failed: ${error.message || error}`
		}));
	});

	persistentSocket.on('reconnect_failed', () => {
		console.log('❌ Backend connectivity: Reconnection failed after all attempts');
		backendConnectivity.update((state) => ({
			...state,
			isConnected: false,
			isConnecting: false,
			error: 'Connection failed after all retry attempts'
		}));
	});

	return persistentSocket;
}

// Function to get current connection status
export function getConnectionStatus() {
	return persistentSocket ? persistentSocket.connected : false;
}

// Function to manually reconnect
export function reconnectBackend() {
	if (persistentSocket) {
		persistentSocket.connect();
	}
}

// Function to disconnect
export function disconnectBackend() {
	// Only tear down once every consumer has released the connection.
	if (referenceCount > 0) {
		referenceCount -= 1;
	}
	if (referenceCount > 0) {
		return;
	}

	if (persistentSocket) {
		persistentSocket.disconnect();
		persistentSocket = null;
	}
	backendConnectivity.update((state) => ({
		...state,
		isConnected: false,
		isConnecting: false,
		error: null
	}));
}

// Function to change server URL and reconnect
export function changeServerUrl(newServerUrl) {
	console.log('🔄 Backend connectivity: Changing server URL to', newServerUrl);
	// Tear down the existing socket without touching the reference count, then
	// let initializeBackendConnectivity rebuild against the new URL. The +1/-1
	// keeps referenceCount unchanged so existing consumers stay tracked.
	if (persistentSocket) {
		persistentSocket.disconnect();
		persistentSocket = null;
	}
	if (referenceCount > 0) {
		referenceCount -= 1;
	}
	initializeBackendConnectivity(newServerUrl);
}
