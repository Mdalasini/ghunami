import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
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

async function submit(fields: Record<string, string>) {
	const { action: signinAction } = await import('../../src/routes/signin');
	return signinAction(routeArgs(formRequest('https://ghunami.test/signin', fields)));
}

function expectAction(name: string, args: Record<string, unknown>) {
	expect(action).toHaveBeenCalledTimes(1);
	const call = action.mock.calls[0];
	if (!call) throw new Error('Expected a Convex action call');
	expect(getFunctionName(call[0])).toBe(`authFlow:${name}`);
	expect(call).toHaveLength(2);
	expect(call[1]).toEqual(args);
}

const destinations = [
	{ returnTo: '/create?draft=1#photo', expected: '/create?draft=1#photo' },
	{ returnTo: 'https://evil.example/steal', expected: '/' },
	{ returnTo: '//evil.example/steal', expected: '/' },
	{ returnTo: '/\\evil.example/steal', expected: '/' },
	{ returnTo: '/create\n', expected: '/' },
	{ returnTo: '', expected: '/' }
];

describe('signin routes', () => {
	beforeEach(() => {
		action.mockReset();
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'test';
	});

	it.each(destinations)('loader returns signed-out data for $returnTo', async ({ returnTo, expected }) => {
		const { loader } = await import('../../src/routes/signin');
		const result = await loader(
			routeArgs(new Request(`https://ghunami.test/signin?${new URLSearchParams({ returnTo })}`))
		);
		expect(result).toEqual({ returnTo: expected, resetToken: null });
		expect(action).not.toHaveBeenCalled();
	});

	it('loader defaults a missing returnTo to root', async () => {
		const { loader } = await import('../../src/routes/signin');
		expect(await loader(routeArgs(new Request('https://ghunami.test/signin'))))
			.toEqual({ returnTo: '/', resetToken: null });
	});

	it.each(destinations)('loader redirects signed-in users safely for $returnTo', async ({ returnTo, expected }) => {
		const { sessionCookie } = await import('../../src/lib/session.server');
		const { loader } = await import('../../src/routes/signin');
		const result = await loader(routeArgs(new Request(
			`https://ghunami.test/signin?${new URLSearchParams({ returnTo })}`,
			{ headers: { cookie: sessionCookie(session) } }
		)));
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBe(302);
		expect(result.headers.get('Location')).toBe(expected);
	});

	it.each([false, true])('loader exposes resetToken without redirecting (signed in: %s)', async (signedIn) => {
		const { sessionCookie } = await import('../../src/lib/session.server');
		const { loader } = await import('../../src/routes/signin');
		const token = 'one-use+reset/token=';
		const result = await loader(routeArgs(new Request(
			`https://ghunami.test/signin?${new URLSearchParams({ token, returnTo: '//evil.example' })}`,
			{ headers: signedIn ? { cookie: sessionCookie(session) } : {} }
		)));
		expect(result).toEqual({ returnTo: '/', resetToken: token });
		expect(action).not.toHaveBeenCalled();
	});

	it.each(['signin', 'signup'])('%s normalizes email, preserves password and trims signup names', async (intent) => {
		action.mockResolvedValueOnce({ error: 'Authentication failed.' });
		const password = '  MiXeD Password!  ';
		const result = await submit({
			intent, email: '  Maya@Example.COM ', password,
			firstName: '  MaYa Anne  ', lastName: '  O\'Tieno  '
		});
		expectAction('authenticatePassword', {
			email: 'maya@example.com', password, signUp: intent === 'signup',
			...(intent === 'signup' ? { firstName: 'MaYa Anne', lastName: "O'Tieno" } : {})
		});
		expect(result).toEqual({ error: 'Authentication failed.' });
	});

	it('signup defaults omitted names to empty strings', async () => {
		action.mockResolvedValueOnce({ pendingAuthenticationToken: 'pending-token' });
		await submit({ intent: 'signup', email: 'maya@example.com', password: 'password' });
		expectAction('authenticatePassword', {
			email: 'maya@example.com', password: 'password', signUp: true, firstName: '', lastName: ''
		});
	});

	it.each(['signin', 'signup'])('%s rejects missing and empty passwords without calling Convex', async (intent) => {
		const cases: Record<string, string>[] = [{}, { password: '' }];
		for (const fields of cases) {
			const result = await submit({ intent, email: 'maya@example.com', ...fields });
			expect(result).toEqual({ error: 'Please enter your password.' });
		}
		expect(action).not.toHaveBeenCalled();
	});

	it.each(['signin', 'signup', 'verify', 'recover'])('%s rejects invalid and missing emails without calling Convex', async (intent) => {
		const cases: Record<string, string>[] = [{}, { email: '' }, { email: 'not-an-email' }, { email: 'maya @example.com' }];
		for (const fields of cases) {
			const result = await submit({ intent, password: 'password', ...fields });
			expect(result).toEqual({ error: 'That email doesn’t look right.' });
		}
		expect(action).not.toHaveBeenCalled();
	});

	it.each(['nope', 'send', ''])('rejects unknown intent "%s" without calling Convex', async (intent) => {
		expect(await submit({ intent, email: 'maya@example.com', password: 'password' }))
			.toEqual({ error: 'Something went wrong. Try again.' });
		expect(action).not.toHaveBeenCalled();
	});

	it.each(['signin', 'signup', 'verify'])('%s success sets a secure sealed cookie and safe redirects', async (intent) => {
		const { readSession } = await import('../../src/lib/session.server');
		process.env.NODE_ENV = 'production';
		for (const { returnTo, expected } of destinations) {
			action.mockResolvedValueOnce({ session, error: null });
			const result = await submit({
				intent, email: 'maya@example.com', password: 'password',
				code: '123456', pendingAuthenticationToken: 'pending-token', returnTo
			});
			expect(isResponse(result)).toBe(true);
			if (!isResponse(result)) return;
			expect(result.status).toBe(302);
			expect(result.headers.get('Location')).toBe(expected);
			const cookie = result.headers.get('Set-Cookie');
			expect(cookie).toMatch(/^gh_session=[^;]+;/);
			expect(cookie?.split('; ')).toEqual(expect.arrayContaining([
				'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=2592000', 'Secure'
			]));
			expect(cookie).not.toContain(session.accessToken);
			expect(cookie).not.toContain(session.refreshToken);
			expect(readSession(new Request('https://ghunami.test/', { headers: { cookie: cookie ?? '' } })))
				.toEqual(session);
			expect(await result.text()).toBe('');
		}
	});

	it('successful signin defaults a missing returnTo to root', async () => {
		action.mockResolvedValueOnce({ session });
		const result = await submit({ intent: 'signin', email: 'maya@example.com', password: 'password' });
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe('/');
	});

	it.each(['signin', 'signup'])('%s pending verification exposes only the pending token, not a session', async (intent) => {
		action.mockResolvedValueOnce({
			session: null, pendingAuthenticationToken: 'pending-token', error: null,
			accessToken: session.accessToken, refreshToken: session.refreshToken
		});
		const result = await submit({ intent, email: 'maya@example.com', password: 'password' });
		expect(isResponse(result)).toBe(false);
		expect(result).toEqual({ pendingAuthenticationToken: 'pending-token' });
		expect(JSON.stringify(result)).not.toContain(session.accessToken);
		expect(JSON.stringify(result)).not.toContain(session.refreshToken);
	});

	it('verify forwards only the code and pending authentication token, without requiring a password', async () => {
		action.mockResolvedValueOnce({ session: null, error: 'That code didn’t work.' });
		const result = await submit({
			intent: 'verify', email: ' Maya@Example.COM ', code: ' 001234 ',
			pendingAuthenticationToken: 'pending-token', firstName: 'ignored', lastName: 'ignored'
		});
		expectAction('verifyEmail', { code: ' 001234 ', pendingAuthenticationToken: 'pending-token' });
		expect(result).toEqual({ error: 'That code didn’t work.' });
	});

	it.each([
		{ backend: { ok: true }, expected: { recoverySent: true } },
		{ backend: { ok: false, error: 'Please try again later.' }, expected: { error: 'Please try again later.' } }
	])('recover returns $expected for $backend', async ({ backend, expected }) => {
		action.mockResolvedValueOnce(backend);
		const result = await submit({ intent: 'recover', email: '  Maya@Example.COM ' });
		expectAction('requestPasswordReset', { email: 'maya@example.com' });
		expect(result).toEqual(expected);
	});

	it.each([
		{ backend: { ok: true }, expected: { reset: true } },
		{ backend: { ok: false, error: 'That reset link has expired.' }, expected: { error: 'That reset link has expired.' } }
	])('reset works without email and returns $expected for $backend', async ({ backend, expected }) => {
		action.mockResolvedValueOnce(backend);
		const result = await submit({ intent: 'reset', token: 'reset+token/=', password: '  NeW Password!  ' });
		expectAction('resetPassword', { token: 'reset+token/=', password: '  NeW Password!  ' });
		expect(result).toEqual(expected);
	});

	it('reset delegates missing credentials to the backend without validating email', async () => {
		action.mockResolvedValueOnce({ ok: false, error: 'Invalid reset credentials.' });
		const result = await submit({ intent: 'reset', email: 'not-an-email' });
		expectAction('resetPassword', { token: '', password: '' });
		expect(result).toEqual({ error: 'Invalid reset credentials.' });
	});

	it.each(['signin', 'signup', 'verify', 'recover', 'reset'])('%s converts transport failure to a safe error', async (intent) => {
		action.mockRejectedValueOnce(new Error(`Internal transport details: ${session.refreshToken}`));
		const result = await submit({
			intent, email: 'maya@example.com', password: 'password', code: '123456',
			pendingAuthenticationToken: 'pending-token', token: 'reset-token'
		});
		expect(action).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ error: 'We couldn’t connect. Please try again.' });
		expect(JSON.stringify(result)).not.toContain(session.refreshToken);
	});
});
