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

	async function loadMedia(session: Session | null) {
		const { loader } = await import('../../src/routes/media.fund');
		const headers = session ? { cookie: await cookieFor(session) } : undefined;
		return loader({
			...routeArgs(new Request('http://127.0.0.1/media/Ab3', { headers })),
			params: { fundID: 'Ab3' }
		});
	}

	it('returns 404 without a session and does not fetch Convex media', async () => {
		const result = await loadMedia(null);
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBe(404);
		expect(fetch).not.toHaveBeenCalled();
		expect(action).not.toHaveBeenCalled();
	});

	it('does not cache private cover bytes', async () => {
		const now = Date.now() / 1000;
		const result = await loadMedia(sessionAt(now + 120));
		if (!isResponse(result)) throw new Error('expected Response');
		expect(result.status).toBe(200);
		expect(result.headers.get('Cache-Control')).toBe('no-store');
		expect(action).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(1);
		const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
		expect(String((init.headers as Record<string, string>).Authorization)).toContain('Bearer ');
	});

	it('refreshes an expired access token before fetching media', async () => {
		const now = Date.now() / 1000;
		const renewed: Session = {
			accessToken: jwt(now + 3600),
			refreshToken: 'rotated-refresh',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: 'Otieno'
		};
		action.mockResolvedValueOnce(renewed);
		const result = await loadMedia(sessionAt(now - 5));
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

	it('clears the cookie when refresh fails', async () => {
		const now = Date.now() / 1000;
		action.mockResolvedValueOnce(null);
		const result = await loadMedia(sessionAt(now - 1));
		if (!isResponse(result)) throw new Error('expected Response');
		expect(result.status).toBe(404);
		expect(result.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
		expect(fetch).not.toHaveBeenCalled();
	});
});
