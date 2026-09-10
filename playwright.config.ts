import { defineConfig, devices } from '@playwright/test';

const port = 4177;
const origin = `http://127.0.0.1:${port}`;

function isolatedEnv(): Record<string, string> {
	const env = { ...process.env } as Record<string, string | undefined>;
	delete env.WORKOS_API_KEY;
	delete env.WORKOS_CLIENT_ID;
	delete env.CONVEX_DEPLOY_KEY;
	delete env.CONVEX_DEPLOYMENT;
	return {
		...Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
		GHUNAMI_ISOLATED_TEST: '1',
		VITE_CONVEX_URL: 'http://127.0.0.1:65531',
		SESSION_SECRET: 'ghunami-test-only-session-key-do-not-use!',
		PORT: String(port),
		HOST: '127.0.0.1'
	};
}

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: origin,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: process.env.CI ? 'npm run start' : 'npm run build && npm run start',
		url: origin,
		reuseExistingServer: false,
		timeout: 120_000,
		env: isolatedEnv()
	}
});
