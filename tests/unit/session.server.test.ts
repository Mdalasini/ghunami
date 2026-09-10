import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearedCookie, readSession, sessionCookie, type Session } from '../../src/lib/session.server';
import { restoreEnv, TEST_SESSION_SECRET } from '../helpers/session';

const session: Session = {
	accessToken: 'access-token',
	refreshToken: 'refresh-token',
	email: 'maya@example.com',
	firstName: 'Maya',
	lastName: 'Otieno'
};

describe('session cookies', () => {
	const previousSecret = process.env.SESSION_SECRET;
	const previousNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		process.env.SESSION_SECRET = TEST_SESSION_SECRET;
		process.env.NODE_ENV = 'test';
	});

	afterEach(() => {
		restoreEnv('SESSION_SECRET', previousSecret);
		restoreEnv('NODE_ENV', previousNodeEnv);
	});

	it('round-trips a session through the cookie', () => {
		const cookie = sessionCookie(session);
		const request = new Request('http://127.0.0.1/auth/token', {
			headers: { cookie }
		});
		expect(readSession(request)).toEqual(session);
		expect(cookie).not.toContain(session.refreshToken);
	});

	it('returns null when the cookie is missing or unrelated', () => {
		expect(readSession(new Request('http://127.0.0.1/'))).toBeNull();
		expect(
			readSession(
				new Request('http://127.0.0.1/', {
					headers: { cookie: 'other=value' }
				})
			)
		).toBeNull();
	});

	it('rejects tampered, truncated, and invalid cookies', () => {
		const cookie = sessionCookie(session);
		const value = cookie.split(';')[0]?.slice('gh_session='.length) ?? '';
		const request = (raw: string) =>
			new Request('http://127.0.0.1/', { headers: { cookie: `gh_session=${raw}` } });

		expect(readSession(request(`${value}aa`))).toBeNull();
		expect(readSession(request(value.slice(0, 10)))).toBeNull();
		expect(readSession(request('not-valid'))).toBeNull();
	});

	it('treats a rotated secret as signed out', () => {
		const cookie = sessionCookie(session);
		process.env.SESSION_SECRET = 'ghunami-test-rotated-session-key-32chars!!';
		const request = new Request('http://127.0.0.1/', { headers: { cookie } });
		expect(readSession(request)).toBeNull();
	});

	it('requires a long secret when creating a cookie', () => {
		delete process.env.SESSION_SECRET;
		expect(() => sessionCookie(session)).toThrow(/SESSION_SECRET/);
		process.env.SESSION_SECRET = 'too-short';
		expect(() => sessionCookie(session)).toThrow(/SESSION_SECRET/);
	});

	it('clears the cookie with Max-Age=0', () => {
		expect(clearedCookie()).toMatch(/gh_session=;/);
		expect(clearedCookie()).toMatch(/Max-Age=0/);
	});

	it('sets HttpOnly, Path, SameSite, and Max-Age; Secure only in production', () => {
		const cookie = sessionCookie(session);
		expect(cookie).toMatch(/HttpOnly/);
		expect(cookie).toMatch(/Path=\//);
		expect(cookie).toMatch(/SameSite=Lax/);
		expect(cookie).toMatch(/Max-Age=2592000/);
		expect(cookie).not.toMatch(/Secure/);

		process.env.NODE_ENV = 'production';
		expect(sessionCookie(session)).toMatch(/Secure/);
	});
});
