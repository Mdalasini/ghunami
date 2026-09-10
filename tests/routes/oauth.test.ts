import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SESSION_SECRET } from '../helpers/session';
import { isResponse, routeArgs } from '../helpers/route';
import { createOAuthState } from '../../src/lib/oauthState.server';
import type { Session } from '../../src/lib/session.server';

const action = vi.fn();

vi.mock('../../src/lib/convex.server', () => ({
	convexServer: () => ({ action })
}));

vi.mock('../../src/lib/env.server', () => ({
	loadServerEnv: vi.fn()
}));

function cookieHeader(setCookie: string) {
	return setCookie.split(';')[0] ?? '';
}

function isDataResult(
	value: unknown
): value is { data: { error: string }; init: { status?: number; headers?: Headers } } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'data' in value &&
		'init' in value
	);
}

async function boundCallback(code: string, returnTo = '/create') {
	const { state, cookie } = await createOAuthState(returnTo);
	const { loader } = await import('../../src/routes/callback');
	const result = await loader(
		routeArgs(
			new Request(`http://127.0.0.1/callback?code=${code}&state=${state}`, {
				headers: { Cookie: cookieHeader(cookie) }
			})
		)
	);
	return result;
}

describe('oauth routes', () => {
	beforeEach(() => {
		action.mockReset();
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'test';
	});

	it('google loader redirects with opaque state and a browser cookie', async () => {
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
		expect(result.headers.get('Set-Cookie')).toMatch(/^gh_oauth_state=/);
		expect(action).toHaveBeenCalledWith(expect.anything(), {
			redirectUri: 'http://127.0.0.1/callback',
			state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
		});
	});

	it('callback without matching browser state does not exchange a code', async () => {
		const { loader } = await import('../../src/routes/callback');
		const result = await loader(
			routeArgs(new Request('http://127.0.0.1/callback?code=abc&state=not-a-valid-nonce'))
		);
		expect(isDataResult(result)).toBe(true);
		if (!isDataResult(result)) return;
		expect(result.data).toEqual({
			error: 'Sign-in expired or could not be verified. Please try again.'
		});
		expect(result.init.status).toBe(400);
		expect(action).not.toHaveBeenCalled();
	});

	it('callback exchanges a code, sets the session, and follows cookie returnTo', async () => {
		const session: Session = {
			accessToken: 'access',
			refreshToken: 'refresh',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: null
		};
		action.mockResolvedValueOnce({ session, error: null });
		const result = await boundCallback('abc', '/create');
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe('/create');
		expect(result.headers.get('Set-Cookie')).toMatch(/gh_session=/);
	});

	it('callback returns an error when exchange fails', async () => {
		action.mockResolvedValueOnce({ session: null, error: 'Sign-in failed. Try again.' });
		const result = await boundCallback('bad');
		expect(isDataResult(result)).toBe(true);
		if (!isDataResult(result)) return;
		expect(result.data).toEqual({ error: 'Sign-in failed. Try again.' });
	});
});
