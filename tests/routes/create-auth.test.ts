import { describe, expect, it } from 'vitest';
import { isResponse, routeArgs } from '../helpers/route';
import { TEST_SESSION_SECRET } from '../helpers/session';

describe('requireSession / legacy preview', () => {
	it('redirects signed-out create visitors through safe returnTo', async () => {
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		const { loader } = await import('../../src/routes/create');
		try {
			await loader(routeArgs(new Request('https://ghunami.test/create?step=2')));
			expect.unreachable('expected a redirect');
		} catch (error) {
			expect(isResponse(error)).toBe(true);
			if (!isResponse(error)) return;
			expect(error.status).toBe(302);
			expect(error.headers.get('Location')).toBe('/signin?returnTo=%2Fcreate%3Fstep%3D2');
		}
	});

	it('strips React Router .data from the create returnTo', async () => {
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		const { loader } = await import('../../src/routes/create');
		try {
			await loader(routeArgs(new Request('https://ghunami.test/create.data')));
			expect.unreachable('expected a redirect');
		} catch (error) {
			expect(isResponse(error)).toBe(true);
			if (!isResponse(error)) return;
			expect(error.status).toBe(302);
			expect(error.headers.get('Location')).toBe('/signin?returnTo=%2Fcreate');
		}
	});

	it('sends /create/preview to /create without inventing a fund ID', async () => {
		const { loader } = await import('../../src/routes/create.preview');
		const result = await loader();
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBe(302);
		expect(result.headers.get('Location')).toBe('/create');
	});
});
