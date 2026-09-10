/**
 * Vite only exposes `VITE_`-prefixed vars, and it never copies `.env.local` into
 * `process.env`. Server-only secrets (SESSION_SECRET) therefore have to be
 * loaded by hand. Node 22 can do it without a dependency.
 */
let loaded = false;

export function loadServerEnv(): void {
	if (loaded) return;
	loaded = true;
	// Isolated tests must not inherit developer .env.local service settings.
	if (process.env.GHUNAMI_ISOLATED_TEST === '1') return;
	try {
		process.loadEnvFile('.env.local');
	} catch {
		// No .env.local (a real deployment); the vars come from the host instead.
	}
}
