import { describe, expect, it } from 'vitest';
import { isResponse, routeArgs } from '../helpers/route';
import { TEST_SESSION_SECRET } from '../helpers/session';
import type { Session } from '../../src/lib/session.server';

const session: Session = {
	accessToken: 'access-token',
	refreshToken: 'refresh-secret-never-client',
	email: 'maya@example.com',
	firstName: 'Maya',
	lastName: 'Otieno'
};

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

	it('redirects legacy edit URLs to the fund preview', async () => {
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		const { sessionCookie } = await import('../../src/lib/session.server');
		const { loader } = await import('../../src/routes/create');
		try {
			await loader(
				routeArgs(
					new Request('https://ghunami.test/create?fundID=Ab3&step=3&from=preview', {
						headers: { cookie: sessionCookie(session) }
					})
				)
			);
			expect.unreachable('expected a redirect');
		} catch (error) {
			expect(isResponse(error)).toBe(true);
			if (!isResponse(error)) return;
			expect(error.status).toBe(302);
			expect(error.headers.get('Location')).toBe('/preview/Ab3');
		}
	});

	it('rejects a malformed fundID on create', async () => {
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		const { sessionCookie } = await import('../../src/lib/session.server');
		const { loader } = await import('../../src/routes/create');
		try {
			await loader(
				routeArgs(
					new Request('https://ghunami.test/create?fundID=nope', {
						headers: { cookie: sessionCookie(session) }
					})
				)
			);
			expect.unreachable('expected a 404');
		} catch (error) {
			expect(isResponse(error)).toBe(true);
			if (!isResponse(error)) return;
			expect(error.status).toBe(404);
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
