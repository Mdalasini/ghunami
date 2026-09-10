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
		refreshToken: 'refresh-secret-never-client',
		email: 'maya@example.com',
		firstName: 'Maya',
		lastName: 'Otieno',
		...extra
	};
}

describe('auth.token loader', () => {
	beforeEach(() => {
		action.mockReset();
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'test';
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function load() {
		return await import('../../src/routes/auth.token');
	}

	async function cookieFor(session: Session) {
		const { sessionCookie } = await import('../../src/lib/session.server');
		return sessionCookie(session);
	}

	it('returns null without a backend call when there is no session', async () => {
		const { loader } = await load();
		const result = await loader(routeArgs(new Request('http://127.0.0.1/auth/token')));
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(await result.json()).toEqual({ token: null });
		expect(action).not.toHaveBeenCalled();
	});

	it('reuses a fresh access token', async () => {
		const now = Date.now() / 1000;
		const session = sessionAt(now + 120);
		const { loader } = await load();
		const result = await loader(
			routeArgs(
				new Request('http://127.0.0.1/auth/token', {
					headers: { cookie: await cookieFor(session) }
				})
			)
		);
		if (!isResponse(result)) throw new Error('expected Response');
		const body = await result.json();
		expect(body).toEqual({ token: session.accessToken });
		expect(JSON.stringify(body)).not.toContain(session.refreshToken);
		expect(action).not.toHaveBeenCalled();
	});

	it('refreshes at the 60-second skew boundary, when expired, malformed, or forced', async () => {
		const now = Date.now() / 1000;
		const renewed: Session = {
			accessToken: jwt(now + 3600),
			refreshToken: 'rotated-refresh',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: 'Otieno'
		};
		action.mockResolvedValue(renewed);
		const { loader } = await load();

		const cases: Array<{ label: string; session: Session; url: string }> = [
			{ label: 'skew', session: sessionAt(now + 60), url: 'http://127.0.0.1/auth/token' },
			{ label: 'expired', session: sessionAt(now - 5), url: 'http://127.0.0.1/auth/token' },
			{
				label: 'malformed',
				session: { ...sessionAt(now + 120), accessToken: 'not-a-jwt' },
				url: 'http://127.0.0.1/auth/token'
			},
			{
				label: 'force',
				session: sessionAt(now + 120),
				url: 'http://127.0.0.1/auth/token?force=1'
			}
		];

		for (const testCase of cases) {
			action.mockClear();
			action.mockResolvedValueOnce(renewed);
			const result = await loader(
				routeArgs(
					new Request(testCase.url, {
						headers: { cookie: await cookieFor(testCase.session) }
					})
				)
			);
			if (!isResponse(result)) throw new Error(`expected Response for ${testCase.label}`);
			const body = await result.json();
			expect(body, testCase.label).toEqual({ token: renewed.accessToken });
			expect(JSON.stringify(body), testCase.label).not.toContain('rotated-refresh');
			expect(JSON.stringify(body), testCase.label).not.toContain(testCase.session.refreshToken);
			expect(action, testCase.label).toHaveBeenCalledTimes(1);
			expect(result.headers.get('Set-Cookie'), testCase.label).toMatch(/gh_session=/);
		}
	});

	it('clears the cookie when refresh fails', async () => {
		const now = Date.now() / 1000;
		action.mockResolvedValueOnce(null);
		const { loader } = await load();
		const result = await loader(
			routeArgs(
				new Request('http://127.0.0.1/auth/token', {
					headers: { cookie: await cookieFor(sessionAt(now - 1)) }
				})
			)
		);
		if (!isResponse(result)) throw new Error('expected Response');
		expect(await result.json()).toEqual({ token: null });
		expect(result.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
	});
});
