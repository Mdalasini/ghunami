/**
 * Vitest must not inherit developer Convex/WorkOS settings from `.env.local`
 * or from a leftover shell environment.
 */
process.loadEnvFile = () => {};

const blocked = [
	'WORKOS_API_KEY',
	'WORKOS_CLIENT_ID',
	'CONVEX_DEPLOY_KEY',
	'CONVEX_DEPLOYMENT'
] as const;

for (const key of blocked) {
	delete process.env[key];
}

process.env.GHUNAMI_ISOLATED_TEST = '1';
process.env.VITE_CONVEX_URL = 'http://127.0.0.1:65531';
