import { describe, expect, it } from 'vitest';

describe('test isolation', () => {
	it('does not expose real WorkOS or Convex deploy settings', () => {
		expect(process.env.GHUNAMI_ISOLATED_TEST).toBe('1');
		expect(process.env.VITE_CONVEX_URL).toBe('http://127.0.0.1:65531');
		expect(process.env.WORKOS_API_KEY).toBeUndefined();
		expect(process.env.WORKOS_CLIENT_ID).toBeUndefined();
		expect(process.env.CONVEX_DEPLOY_KEY).toBeUndefined();
	});
});
