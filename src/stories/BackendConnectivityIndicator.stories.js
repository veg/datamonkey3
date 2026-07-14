import '../app.css';
import BackendConnectivityIndicatorWrapper from './BackendConnectivityIndicatorWrapper.svelte';
import { writable } from 'svelte/store';

// Mock connectivity states
const connectedState = {
	isConnected: true,
	isConnecting: false,
	serverUrl: 'https://datamonkey.temple.edu',
	lastChecked: new Date(),
	error: null
};

const connectingState = {
	isConnected: false,
	isConnecting: true,
	serverUrl: 'https://datamonkey.temple.edu',
	lastChecked: null,
	error: null
};

const disconnectedState = {
	isConnected: false,
	isConnecting: false,
	serverUrl: 'https://datamonkey.temple.edu',
	lastChecked: new Date(Date.now() - 60000), // 1 minute ago
	error: 'Connection refused'
};

const disconnectedNoErrorState = {
	isConnected: false,
	isConnecting: false,
	serverUrl: 'https://datamonkey.temple.edu',
	lastChecked: new Date(Date.now() - 30000), // 30 seconds ago
	error: null
};

// Story configuration
export default {
	title: 'Progress Indicators/BackendConnectivityIndicator',
	component: BackendConnectivityIndicatorWrapper,
	parameters: {
		docs: {
			description: {
				component: `
          ## Backend Connectivity Indicator
          
          Shows the connection status to the Datamonkey server with a visual indicator.
          
          Features:
          - **Green dot**: Connected to server
          - **Yellow pulsing dot**: Connecting to server
          - **Red dot**: Disconnected from server
          - **Hover tooltip**: Shows server URL and last checked time
          - **Error details**: When disconnected, shows the error reason
          
          This component follows Dieter Rams design principles by being unobtrusive and honest about the connection state.
        `
			}
		}
	}
};

// Story variants
export const Connected = () => {
	const mockBackendConnectivity = writable(connectedState);

	return {
		Component: BackendConnectivityIndicatorWrapper,
		props: {
			mockBackendConnectivity
		}
	};
};
Connected.parameters = {
	docs: {
		description: {
			story: 'Shows a green dot when successfully connected to the Datamonkey server.'
		}
	}
};

export const Connecting = () => {
	const mockBackendConnectivity = writable(connectingState);

	return {
		Component: BackendConnectivityIndicatorWrapper,
		props: {
			mockBackendConnectivity
		}
	};
};
Connecting.parameters = {
	docs: {
		description: {
			story: 'Shows a yellow pulsing dot while attempting to connect to the server.'
		}
	}
};

export const DisconnectedWithError = () => {
	const mockBackendConnectivity = writable(disconnectedState);

	return {
		Component: BackendConnectivityIndicatorWrapper,
		props: {
			mockBackendConnectivity
		}
	};
};
DisconnectedWithError.parameters = {
	docs: {
		description: {
			story: 'Shows a red dot when disconnected from the server with an error message.'
		}
	}
};

export const DisconnectedNoError = () => {
	const mockBackendConnectivity = writable(disconnectedNoErrorState);

	return {
		Component: BackendConnectivityIndicatorWrapper,
		props: {
			mockBackendConnectivity
		}
	};
};
DisconnectedNoError.parameters = {
	docs: {
		description: {
			story: 'Shows a red dot when disconnected from the server without a specific error.'
		}
	}
};
