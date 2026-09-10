import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SESSION_SECRET } from '../helpers/session';
import { isResponse, routeArgs } from '../helpers/route';
import type { Session } from '../../src/lib/session.server';

const action = vi.fn();

vi.mock('../../src/lib/convex.server', () => ({
	convexServer: () => ({ action })
}));

vi.mock('../../src/lib/env.server', () => ({
	loadServerEnv: vi.fn()
}));

describe('oauth routes', () => {
	beforeEach(() => {
		action.mockReset();
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'test';
	});

	it('google loader redirects to the mocked authorization URL', async () => {
		action.mockResolvedValueOnce('https://accounts.google.com/o/oauth2/auth?state=test');
		const { loader } = await import('../../src/routes/auth.google');
		const result = await loader(
			routeArgs(new Request('http://127.0.0.1/auth/google?returnTo=/create'))
		);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe(
			'https://accounts.google.com/o/oauth2/auth?state=test'
		);
		expect(action).toHaveBeenCalledWith(expect.anything(), {
			redirectUri: 'http://127.0.0.1/callback',
			state: JSON.stringify({ returnTo: '/create' })
		});
	});

	it('callback without a code returns an error payload', async () => {
		const { loader } = await import('../../src/routes/callback');
		const result = await loader(
			routeArgs(new Request('http://127.0.0.1/callback?error_description=cancelled'))
		);
		expect(result).toEqual({ error: 'cancelled' });
		expect(action).not.toHaveBeenCalled();
	});

	it('callback exchanges a code, sets the session, and follows safe state', async () => {
		const session: Session = {
			accessToken: 'access',
			refreshToken: 'refresh',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: null
		};
		action.mockResolvedValueOnce({ session, error: null });
		const { loader } = await import('../../src/routes/callback');
		const state = encodeURIComponent(JSON.stringify({ returnTo: '/create' }));
		const result = await loader(
			routeArgs(new Request(`http://127.0.0.1/callback?code=abc&state=${state}`))
		);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe('/create');
		expect(result.headers.get('Set-Cookie')).toMatch(/gh_session=/);
	});

	it('callback returns an error when exchange fails', async () => {
		action.mockResolvedValueOnce({ session: null, error: 'Sign-in failed. Try again.' });
		const { loader } = await import('../../src/routes/callback');
		const result = await loader(routeArgs(new Request('http://127.0.0.1/callback?code=bad')));
		expect(result).toEqual({ error: 'Sign-in failed. Try again.' });
	});
});
