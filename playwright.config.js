import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 1,
	workers: process.env.CI ? 1 : 4,
	reporter:
		process.env.E2E_COVERAGE === '1'
			? [
					[
						'monocart-reporter',
						{
							name: 'datamonkey3 e2e coverage',
							outputFile: './coverage-e2e/report.html',
							coverage: {
								entryFilter: (entry) => entry.url.includes('localhost:5173'),
								sourceFilter: (sourcePath) => sourcePath.startsWith('src/'),
								reports: [['v8'], ['console-summary'], ['lcovonly'], ['json-summary']]
							}
						}
					]
				]
			: 'html',
	timeout: 60000,
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile-chrome',
			use: { ...devices['Pixel 5'] }
		}
	],
	webServer: process.env.E2E_NO_WEBSERVER
		? undefined
		: {
				command: 'npm run dev',
				url: 'http://localhost:5173',
				reuseExistingServer: !process.env.CI,
				timeout: 120000
			}
});
