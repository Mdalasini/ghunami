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

const session: Session = {
	accessToken: 'access',
	refreshToken: 'refresh',
	email: 'user@example.com',
	firstName: null,
	lastName: null
};

type DataResult = {
	data: { error: string };
	init: { status?: number; headers?: HeadersInit };
};

function isDataResult(value: unknown): value is DataResult {
	return typeof value === 'object' && value !== null && 'data' in value && 'init' in value;
}

function cookieHeader(setCookie: string) {
	return setCookie.split(';')[0] ?? '';
}

function resultHeaders(result: unknown): Headers {
	if (isResponse(result)) return result.headers;
	if (isDataResult(result)) return new Headers(result.init.headers);
	throw new Error('unexpected loader result');
}

function setCookies(result: unknown) {
	return resultHeaders(result).getSetCookie();
}

async function start(returnTo = '/saved') {
	const { loader } = await import('../../src/routes/auth.google');
	const response = await loader(
		routeArgs(
			new Request(`https://app.example/auth/google?returnTo=${encodeURIComponent(returnTo)}`)
		)
	);
	if (!isResponse(response)) throw new Error('initiation must redirect');
	const cookie = response.headers.get('Set-Cookie');
	if (!cookie) throw new Error('initiation must set a state cookie');
	return {
		response,
		state: new URL(response.headers.get('Location') ?? '').searchParams.get('state'),
		cookie: cookieHeader(cookie),
		setCookie: cookie
	};
}

function finish(state: string | null, cookie: string | null, extra = 'code=valid-code') {
	return import('../../src/routes/callback').then(({ loader }) => {
		const query = new URLSearchParams(extra);
		if (state !== null) query.append('state', state);
		return loader(
			routeArgs(
				new Request(`https://app.example/callback?${query}`, {
					headers: cookie ? { Cookie: cookie } : {}
				})
			)
		);
	});
}

describe('oauth routes', () => {
	let exchangeResult: { session: Session | null; error: string | null };
	let exchangeError: boolean;

	beforeEach(() => {
		exchangeResult = { session, error: null };
		exchangeError = false;
		action.mockReset();
		action.mockImplementation(async (_called: unknown, args: Record<string, unknown>) => {
			if ('redirectUri' in args) {
				return `https://provider.example/authorize?state=${String(args.state)}`;
			}
			if (exchangeError) throw new Error('Provider unavailable');
			return exchangeResult;
		});
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'production';
	});

	it('initiation generates independent opaque state and a secure browser cookie', async () => {
		const first = await start();
		const second = await start();
		expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(first.state).not.toBe(second.state);
		expect(action.mock.calls[0]?.[1]).toEqual({
			redirectUri: 'https://app.example/callback',
			state: first.state
		});
		for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) {
			expect(first.setCookie).toContain(attribute);
		}
		expect(first.setCookie).not.toContain('Domain=');
		expect(first.setCookie).toMatch(/^__Host-gh_oauth_state=/);
		expect(first.response.headers.get('Cache-Control')).toBe('no-store');
	});

	it.each([
		'missing state',
		'missing cookie',
		'other browser',
		'malformed state',
		'tampered cookie',
		'expired cookie',
		'duplicate state'
	] as const)('invalid browser correlation (%s) never exchanges a code or installs a session', async (scenario) => {
		const first = await start();
		const other = await start();
		let state = first.state;
		let cookie: string | null = first.cookie;
		let extra = 'code=valid-code';
		if (scenario === 'missing state') state = null;
		if (scenario === 'missing cookie') cookie = null;
		if (scenario === 'other browser') cookie = other.cookie;
		if (scenario === 'malformed state') state = JSON.stringify({ returnTo: '/saved' });
		if (scenario === 'tampered cookie') cookie += 'tampered';
		if (scenario === 'duplicate state') extra += `&state=${first.state}`;
		const now = Date.now;
		if (scenario === 'expired cookie') Date.now = () => now() + 601_000;
		let result: unknown;
		try {
			result = await finish(state, cookie, extra);
		} finally {
			Date.now = now;
		}
		expect(isDataResult(result)).toBe(true);
		if (!isDataResult(result)) return;
		expect(result.init.status).toBe(400);
		expect(action).toHaveBeenCalledTimes(2);
		expect(setCookies(result).some((cookie) => cookie.startsWith('gh_session='))).toBe(false);
		expect(resultHeaders(result).get('Cache-Control')).toBe('no-store');
	});

	it('matching state exchanges code, preserves returnTo, and clears temporary cookie', async () => {
		const { readSession } = await import('../../src/lib/session.server');
		const flow = await start('/saved?view=all');
		const result = await finish(
			flow.state,
			flow.cookie,
			'code=valid-code&returnTo=https://evil.example'
		);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBe(302);
		expect(result.headers.get('Location')).toBe('/saved?view=all');
		expect(action.mock.calls[1]?.[1]).toEqual({ code: 'valid-code' });
		expect(result.headers.get('Cache-Control')).toBe('no-store');
		const cookies = result.headers.getSetCookie();
		expect(cookies.some((cookie) => cookie.startsWith('__Host-gh_oauth_state=') && cookie.includes('Max-Age=0'))).toBe(
			true
		);
		expect(cookies).toHaveLength(2);
		const installed = cookies.find((cookie) => cookie.startsWith('gh_session='));
		expect(installed).toBeDefined();
		expect(
			readSession(
				new Request('https://app.example', {
					headers: { Cookie: cookieHeader(installed ?? '') }
				})
			)
		).toEqual(session);

		const replay = await finish(flow.state, cookieHeader(cookies[0] ?? ''));
		expect(isDataResult(replay)).toBe(true);
		if (!isDataResult(replay)) return;
		expect(replay.init.status).toBe(400);
		expect(action).toHaveBeenCalledTimes(2);
		expect(setCookies(replay).some((cookie) => cookie.startsWith('gh_session='))).toBe(false);
	});

	it('a stale callback does not clear a newer login attempt', async () => {
		const old = await start();
		const current = await start();
		const rejected = await finish(old.state, current.cookie);
		expect(isDataResult(rejected)).toBe(true);
		if (!isDataResult(rejected)) return;
		expect(rejected.init.status).toBe(400);
		expect(new Headers(rejected.init.headers).get('Set-Cookie')).toBeNull();
		expect(action).toHaveBeenCalledTimes(2);
		const accepted = await finish(current.state, current.cookie);
		expect(isResponse(accepted)).toBe(true);
		if (!isResponse(accepted)) return;
		expect(
			accepted.headers
				.getSetCookie()
				.some((cookie) => cookie.startsWith('__Host-gh_oauth_state=') && cookie.includes('Max-Age=0'))
		).toBe(true);
	});

	it('external returnTo is not used for the successful redirect', async () => {
		const flow = await start('https://evil.example');
		const result = await finish(flow.state, flow.cookie);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe('/');
	});

	it.each(['provider error', 'missing code', 'exchange rejected', 'exchange threw'] as const)(
		'cancellation and exchange failures (%s) clear state without installing a session',
		async (scenario) => {
			let extra = 'code=valid-code';
			if (scenario === 'provider error') extra += '&error=access_denied';
			if (scenario === 'missing code') extra = '';
			if (scenario === 'exchange rejected') exchangeResult = { session: null, error: 'Failed' };
			if (scenario === 'exchange threw') exchangeError = true;
			const flow = await start();
			const result = await finish(flow.state, flow.cookie, extra);
			expect(resultHeaders(result).get('Cache-Control')).toBe('no-store');
			expect(
				setCookies(result).some(
					(cookie) => cookie.startsWith('__Host-gh_oauth_state=') && cookie.includes('Max-Age=0')
				)
			).toBe(true);
			expect(setCookies(result).some((cookie) => cookie.startsWith('gh_session='))).toBe(false);
			expect(action).toHaveBeenCalledTimes(scenario.startsWith('exchange') ? 2 : 1);
		}
	);
});
