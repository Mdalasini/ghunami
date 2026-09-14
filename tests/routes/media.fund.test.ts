import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function jwt(exp: number): string {
	const payload = Buffer.from(JSON.stringify({ exp }), 'utf8').toString('base64url');
	return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}

function sessionAt(exp: number, extra: Partial<Session> = {}): Session {
	return {
		accessToken: jwt(exp),
		refreshToken: 'media-refresh-token',
		email: 'maya@example.com',
		firstName: 'Maya',
		lastName: 'Otieno',
		...extra
	};
}

describe('media.fund loader', () => {
	beforeEach(() => {
		action.mockReset();
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'test';
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } }))
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	async function cookieFor(session: Session) {
		const { sessionCookie } = await import('../../src/lib/session.server');
		return sessionCookie(session);
	}

	async function loadMedia(session: Session | null, kind: 'cover' | 'original' = 'cover') {
		const { loader } = await import('../../src/routes/media.fund');
		const headers = session ? { cookie: await cookieFor(session) } : undefined;
		const url = kind === 'original' ? 'http://127.0.0.1/media/Ab3?kind=original' : 'http://127.0.0.1/media/Ab3';
		return loader({
			...routeArgs(new Request(url, { headers })),
			params: { fundID: 'Ab3' }
		});
	}

	function fetchPrivateThenAuth() {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url, init?: RequestInit) => {
				const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
				if (!auth) return new Response('Not found', { status: 404 });
				return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
			})
		);
	}

	it('returns 404 without a session when Convex refuses the anonymous cover', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('Not found', { status: 404 }))
		);
		const result = await loadMedia(null);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBe(404);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(action).not.toHaveBeenCalled();
	});

	it('serves a public cover without a session', async () => {
		const result = await loadMedia(null);
		if (!isResponse(result)) throw new Error('expected Response');
		expect(result.status).toBe(200);
		expect(result.headers.get('Cache-Control')).toBe('no-store');
		expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(action).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(1);
		const init = vi.mocked(fetch).mock.calls[0]?.[1];
		expect(init?.headers).toBeUndefined();
	});

	it('does not let an expired session block a public cover', async () => {
		const now = Date.now() / 1000;
		action.mockResolvedValueOnce(null);
		const result = await loadMedia(sessionAt(now - 5));
		if (!isResponse(result)) throw new Error('expected Response');
		expect(result.status).toBe(200);
		expect(action).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('does not fetch originals anonymously', async () => {
		const result = await loadMedia(null, 'original');
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBe(404);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('does not cache private cover bytes', async () => {
		fetchPrivateThenAuth();
		const now = Date.now() / 1000;
		const result = await loadMedia(sessionAt(now + 120));
		if (!isResponse(result)) throw new Error('expected Response');
		expect(result.status).toBe(200);
		expect(result.headers.get('Cache-Control')).toBe('no-store');
		expect(action).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(2);
		const init = vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit;
		expect(String((init.headers as Record<string, string>).Authorization)).toContain('Bearer ');
	});

	it('refreshes an expired access token before fetching private media', async () => {
		const now = Date.now() / 1000;
		const renewed: Session = {
			accessToken: jwt(now + 3600),
			refreshToken: 'rotated-refresh',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: 'Otieno'
		};
		action.mockResolvedValueOnce(renewed);
		const result = await loadMedia(sessionAt(now - 5), 'original');
		if (!isResponse(result)) throw new Error('expected Response');
		expect(result.status).toBe(200);
		expect(result.headers.get('Cache-Control')).toBe('no-store');
		expect(result.headers.get('Set-Cookie')).toMatch(/gh_session=/);
		expect(action).toHaveBeenCalledTimes(1);
		const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
		expect(String((init.headers as Record<string, string>).Authorization)).toBe(
			`Bearer ${renewed.accessToken}`
		);
	});

	it('clears the cookie when private-media refresh fails', async () => {
		const now = Date.now() / 1000;
		action.mockResolvedValueOnce(null);
		const result = await loadMedia(sessionAt(now - 1), 'original');
		if (!isResponse(result)) throw new Error('expected Response');
		expect(result.status).toBe(404);
		expect(result.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
		expect(fetch).not.toHaveBeenCalled();
	});
});
