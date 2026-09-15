import { describe, expect, it } from 'vitest';
import { isResponse, routeArgs } from '../helpers/route';
import { TEST_SESSION_SECRET } from '../helpers/session';

describe('operator reversals route', () => {
	it('redirects signed-out visitors to sign in', async () => {
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		const { loader } = await import('../../src/routes/ops.reversals');
		try {
			await loader(routeArgs(new Request('https://ghunami.test/ops/reversals')));
			expect.unreachable('expected a redirect');
		} catch (error) {
			expect(isResponse(error)).toBe(true);
			if (!isResponse(error)) return;
			expect(error.status).toBe(302);
			expect(error.headers.get('Location')).toBe('/signin?returnTo=%2Fops%2Freversals');
		}
	});
});
