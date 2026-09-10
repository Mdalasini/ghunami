import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SESSION_SECRET } from '../helpers/session';
import { formRequest, isResponse, routeArgs } from '../helpers/route';
import type { Session } from '../../src/lib/session.server';

const action = vi.fn();

vi.mock('../../src/lib/convex.server', () => ({
	convexServer: () => ({ action })
}));

vi.mock('../../src/lib/env.server', () => ({
	loadServerEnv: vi.fn()
}));

const session: Session = {
	accessToken: 'access-token',
	refreshToken: 'refresh-secret-never-client',
	email: 'maya@example.com',
	firstName: 'Maya',
	lastName: 'Otieno'
};

describe('signin routes', () => {
	beforeEach(() => {
		action.mockReset();
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'test';
	});

	it('loader returns signed-out data', async () => {
		const { loader } = await import('../../src/routes/signin');
		const result = await loader(
			routeArgs(new Request('http://127.0.0.1/signin?returnTo=/create'))
		);
		expect(result).toEqual({ returnTo: '/create' });
	});

	it('loader redirects signed-in users to a safe returnTo', async () => {
		const { sessionCookie } = await import('../../src/lib/session.server');
		const { loader } = await import('../../src/routes/signin');
		const result = await loader(
			routeArgs(
				new Request('http://127.0.0.1/signin?returnTo=/create', {
					headers: { cookie: sessionCookie(session) }
				})
			)
		);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBeGreaterThanOrEqual(300);
		expect(result.headers.get('Location')).toBe('/create');
	});

	it('action rejects an invalid email without calling Convex', async () => {
		const { action: signinAction } = await import('../../src/routes/signin');
		const result = await signinAction(
			routeArgs(formRequest('http://127.0.0.1/signin', { intent: 'send', email: 'not-an-email' }))
		);
		expect(result).toEqual({ error: 'That email doesn’t look right.' });
		expect(action).not.toHaveBeenCalled();
	});

	it('send normalizes email and returns success or failure', async () => {
		const { action: signinAction } = await import('../../src/routes/signin');
		action.mockResolvedValueOnce({ ok: true, error: null });
		const sent = await signinAction(
			routeArgs(
				formRequest('http://127.0.0.1/signin', {
					intent: 'send',
					email: '  Maya@Example.COM '
				})
			)
		);
		expect(sent).toEqual({ sent: true });
		expect(action).toHaveBeenCalledWith(expect.anything(), { email: 'maya@example.com' });

		action.mockResolvedValueOnce({ ok: false, error: 'We couldn’t send that code. Try again.' });
		const failed = await signinAction(
			routeArgs(formRequest('http://127.0.0.1/signin', { intent: 'send', email: 'maya@example.com' }))
		);
		expect(failed).toEqual({ error: 'We couldn’t send that code. Try again.' });
	});

	it('verify sets a session cookie and safe redirect', async () => {
		const { action: signinAction } = await import('../../src/routes/signin');
		const { readSession } = await import('../../src/lib/session.server');
		action.mockResolvedValueOnce({ session, error: null });
		const result = await signinAction(
			routeArgs(
				formRequest('http://127.0.0.1/signin', {
					intent: 'verify',
					email: 'maya@example.com',
					code: '123456',
					returnTo: '/create'
				})
			)
		);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe('/create');
		const cookie = result.headers.get('Set-Cookie');
		expect(cookie).toBeTruthy();
		const stored = readSession(
			new Request('http://127.0.0.1/', { headers: { cookie: cookie ?? '' } })
		);
		expect(stored).toEqual(session);
	});

	it('verify returns the error when the code fails', async () => {
		const { action: signinAction } = await import('../../src/routes/signin');
		action.mockResolvedValueOnce({
			session: null,
			error: 'That code didn’t work. Check it, or send a new one.'
		});
		const result = await signinAction(
			routeArgs(
				formRequest('http://127.0.0.1/signin', {
					intent: 'verify',
					email: 'maya@example.com',
					code: '000000'
				})
			)
		);
		expect(result).toEqual({ error: 'That code didn’t work. Check it, or send a new one.' });
	});

	it('rejects an unknown intent', async () => {
		const { action: signinAction } = await import('../../src/routes/signin');
		const result = await signinAction(
			routeArgs(formRequest('http://127.0.0.1/signin', { intent: 'nope', email: 'maya@example.com' }))
		);
		expect(result).toEqual({ error: 'Something went wrong. Try again.' });
		expect(action).not.toHaveBeenCalled();
	});
});
