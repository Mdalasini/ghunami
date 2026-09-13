import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { AuthenticationException } from '@workos-inc/node';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { restoreEnv } from '../helpers/session';
import { authFlowModules } from './modules';

const TEST_WORKOS_API_KEY = 'ghunami-test-only-workos-api-key';
const TEST_WORKOS_CLIENT_ID = 'client_test_isolated';

const workos = vi.hoisted(() => ({
	createUser: vi.fn(),
	authenticateWithPassword: vi.fn(),
	authenticateWithEmailVerification: vi.fn(),
	createPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
	getAuthorizationUrl: vi.fn(),
	authenticateWithCode: vi.fn(),
	authenticateWithRefreshToken: vi.fn()
}));

vi.mock('@workos-inc/node', async (importOriginal) => ({
	...await importOriginal<typeof import('@workos-inc/node')>(),
	WorkOS: class WorkOS {
		userManagement = workos;
	}
}));

function harness() {
	return convexTest(schema, authFlowModules);
}

function workosUser(overrides: Record<string, string | null> = {}) {
	return {
		id: 'user_maya',
		email: 'maya@example.com',
		firstName: 'Maya',
		lastName: 'Otieno',
		...overrides
	};
}

function tokens(user = workosUser()) {
	return {
		accessToken: 'access-token',
		refreshToken: 'refresh-token',
		user
	};
}

describe('authFlow', () => {
	const previousKey = process.env.WORKOS_API_KEY;
	const previousClient = process.env.WORKOS_CLIENT_ID;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		process.env.WORKOS_API_KEY = TEST_WORKOS_API_KEY;
		process.env.WORKOS_CLIENT_ID = TEST_WORKOS_CLIENT_ID;
		workos.createUser.mockResolvedValue({ id: 'user_maya' });
		workos.authenticateWithPassword.mockResolvedValue(tokens());
		workos.authenticateWithEmailVerification.mockResolvedValue(tokens());
		workos.createPasswordReset.mockResolvedValue({ token: 'secret-reset-token', passwordResetUrl: 'https://example.com/reset?token=secret' });
		workos.resetPassword.mockResolvedValue({ user: workosUser() });
		workos.getAuthorizationUrl.mockReturnValue('https://accounts.google.com/o/oauth2/auth?fake=1');
		workos.authenticateWithCode.mockResolvedValue(tokens());
		workos.authenticateWithRefreshToken.mockResolvedValue(tokens());
	});

	afterEach(() => {
		expect(console.error).not.toHaveBeenCalled();
		expect(console.warn).not.toHaveBeenCalled();
		expect(console.log).not.toHaveBeenCalled();
		restoreEnv('WORKOS_API_KEY', previousKey);
		restoreEnv('WORKOS_CLIENT_ID', previousClient);
		vi.restoreAllMocks();
	});

	const credentials = { email: 'maya@example.com', password: ' original password ', signUp: false };
	const signup = { ...credentials, signUp: true, firstName: ' Maya ', lastName: ' Otieno ' };
	const verification = { code: ' 123456 ', pendingAuthenticationToken: ' opaque-token ' };
	const expectedSession = {
		accessToken: 'access-token', refreshToken: 'refresh-token',
		email: 'maya@example.com', firstName: 'Maya', lastName: 'Otieno'
	};

	it.each([false, true])('authenticates and records the WorkOS identity (signup=%s)', async (signUp) => {
		const t = harness();
		const result = await t.action(api.authFlow.authenticatePassword, {
			...signup, signUp, email: '  Caller@Example.COM ', firstName: ' Caller '
		});
		expect(result).toEqual({ session: expectedSession, error: null, pendingAuthenticationToken: null });
		expect(workos.authenticateWithPassword).toHaveBeenCalledExactlyOnceWith({
			clientId: TEST_WORKOS_CLIENT_ID, email: 'caller@example.com', password: credentials.password
		});
		if (signUp) {
			expect(workos.createUser).toHaveBeenCalledExactlyOnceWith({
				email: 'caller@example.com', password: credentials.password, firstName: 'Caller', lastName: 'Otieno'
			});
			expect(workos.createUser.mock.invocationCallOrder[0]).toBeLessThan(workos.authenticateWithPassword.mock.invocationCallOrder[0]!);
		} else {
			expect(workos.createUser).not.toHaveBeenCalled();
		}
		const users = await t.run(ctx => ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({
			tokenIdentifier: `https://api.workos.com/user_management/${TEST_WORKOS_CLIENT_ID}|user_maya`,
			email: 'maya@example.com', name: 'Maya Otieno'
		});
	});

	it.each(['', ' ', 'missing-at.example.com', 'a@@example.com', 'a@b', 'a b@example.com', `${'a'.repeat(250)}@example.com`])('rejects invalid email %j before SDK calls', async (email) => {
		const t = harness();
		expect(await t.action(api.authFlow.authenticatePassword, { ...signup, email })).toEqual({
			session: null, error: 'Enter a valid email address.', pendingAuthenticationToken: null
		});
		expect(await t.action(api.authFlow.requestPasswordReset, { email })).toEqual({ ok: false, error: 'Enter a valid email address.' });
		expect(workos.createUser).not.toHaveBeenCalled();
		expect(workos.authenticateWithPassword).not.toHaveBeenCalled();
		expect(workos.createPasswordReset).not.toHaveBeenCalled();
	});

	it.each(['', ' \t\n '])('rejects blank passwords %j', async (password) => {
		const t = harness();
		for (const signUp of [true, false]) {
			expect(await t.action(api.authFlow.authenticatePassword, { ...signup, signUp, password })).toEqual({
				session: null, error: 'Enter your password.', pendingAuthenticationToken: null
			});
		}
		expect(await t.action(api.authFlow.resetPassword, { token: 'token', password })).toEqual({ ok: false, error: 'Enter your new password.' });
		expect(workos.createUser).not.toHaveBeenCalled();
		expect(workos.authenticateWithPassword).not.toHaveBeenCalled();
		expect(workos.resetPassword).not.toHaveBeenCalled();
	});

	it.each([
		{ firstName: undefined }, { lastName: undefined }, { firstName: '' }, { lastName: '  ' },
		{ firstName: 'a'.repeat(101) }, { lastName: 'a'.repeat(101) },
		{ firstName: 'Ma\nya' }, { lastName: 'O\u0000tieno' }
	])('validates signup names %j', async (overrides) => {
		const t = harness();
		expect(await t.action(api.authFlow.authenticatePassword, { ...signup, ...overrides })).toEqual({
			session: null, error: 'Enter your first and last name (1–100 characters each).', pendingAuthenticationToken: null
		});
		expect(workos.createUser).not.toHaveBeenCalled();
		expect(workos.authenticateWithPassword).not.toHaveBeenCalled();
	});

	it('never authenticates after a failed or duplicate signup', async () => {
		workos.createUser.mockRejectedValueOnce(new Error('duplicate email; secret password'));
		const t = harness();
		expect(await t.action(api.authFlow.authenticatePassword, signup)).toEqual({
			session: null, error: 'We couldn’t create your account. Try signing in, or use a different password.', pendingAuthenticationToken: null
		});
		expect(workos.authenticateWithPassword).not.toHaveBeenCalled();
		expect(await t.run(ctx => ctx.db.query('users').collect())).toEqual([]);
	});

	it.each(['login', 'signup', 'verification'] as const)('returns the SDK email verification challenge for %s without recording a session', async (flow) => {
		const challenge = new AuthenticationException(403, {
			code: 'email_verification_required', pending_authentication_token: 'pending-secret'
		}, 'request-id');
		workos.authenticateWithPassword.mockRejectedValueOnce(challenge);
		workos.authenticateWithEmailVerification.mockRejectedValueOnce(challenge);
		const t = harness();
		const result = flow === 'verification'
			? await t.action(api.authFlow.verifyEmail, verification)
			: await t.action(api.authFlow.authenticatePassword, flow === 'signup' ? signup : credentials);
		expect(result).toEqual({ session: null, error: null, pendingAuthenticationToken: 'pending-secret' });
		expect(await t.run(ctx => ctx.db.query('users').collect())).toEqual([]);
	});

	it.each([
		new Error('secret password and token'),
		new AuthenticationException(403, { code: 'email_verification_required' }, 'request-id'),
		new AuthenticationException(403, { code: 'email_verification_required', pending_authentication_token: ' ' }, 'request-id'),
		new AuthenticationException(403, { code: 'mfa_enrollment', pending_authentication_token: 'secret' }, 'request-id'),
		{ code: 'email_verification_required', pendingAuthenticationToken: 'untrusted-secret' }
	])('returns safe errors for other or malformed failures (%#)', async (error) => {
		workos.authenticateWithPassword.mockRejectedValueOnce(error);
		workos.authenticateWithEmailVerification.mockRejectedValueOnce(error);
		const t = harness();
		expect(await t.action(api.authFlow.authenticatePassword, credentials)).toEqual({
			session: null, error: 'Sign-in failed. Check your email and password, then try again.', pendingAuthenticationToken: null
		});
		expect(await t.action(api.authFlow.verifyEmail, verification)).toEqual({
			session: null, error: 'That code didn’t work. Check it, or sign in again.', pendingAuthenticationToken: null
		});
		expect(await t.run(ctx => ctx.db.query('users').collect())).toEqual([]);
	});

	it('verifies email with trimmed code and unchanged opaque token, then records identity', async () => {
		const t = harness();
		expect(await t.action(api.authFlow.verifyEmail, verification)).toEqual({
			session: expectedSession, error: null, pendingAuthenticationToken: null
		});
		expect(workos.authenticateWithEmailVerification).toHaveBeenCalledExactlyOnceWith({
			clientId: TEST_WORKOS_CLIENT_ID, code: '123456', pendingAuthenticationToken: verification.pendingAuthenticationToken
		});
		expect(await t.run(ctx => ctx.db.query('users').collect())).toMatchObject([
			{ email: 'maya@example.com', name: 'Maya Otieno' }
		]);
		expect(workos.createUser).not.toHaveBeenCalled();
	});

	it.each([{ code: '' }, { code: ' ' }, { pendingAuthenticationToken: '' }, { pendingAuthenticationToken: ' \n ' }])('rejects blank verification input %j', async (overrides) => {
		const t = harness();
		expect(await t.action(api.authFlow.verifyEmail, { ...verification, ...overrides })).toEqual({
			session: null, error: 'Enter the verification code and try again.', pendingAuthenticationToken: null
		});
		expect(workos.authenticateWithEmailVerification).not.toHaveBeenCalled();
	});

	it('requests a reset using only normalized email and does not expose the reset token or URL', async () => {
		const t = harness();
		expect(await t.action(api.authFlow.requestPasswordReset, { email: ' Maya@Example.COM ' })).toEqual({ ok: true, error: null });
		expect(workos.createPasswordReset).toHaveBeenCalledExactlyOnceWith({ email: 'maya@example.com' });
		expect(await t.run(ctx => ctx.db.query('users').collect())).toEqual([]);
	});

	it('resets using SDK newPassword, preserving password/token and creating no session', async () => {
		const t = harness();
		expect(await t.action(api.authFlow.resetPassword, { token: ' opaque-token ', password: credentials.password })).toEqual({ ok: true, error: null });
		expect(workos.resetPassword).toHaveBeenCalledExactlyOnceWith({ token: ' opaque-token ', newPassword: credentials.password });
		expect(workos.authenticateWithPassword).not.toHaveBeenCalled();
		expect(await t.run(ctx => ctx.db.query('users').collect())).toEqual([]);
	});

	it.each(['', ' \t '])('rejects blank reset token %j', async (token) => {
		expect(await harness().action(api.authFlow.resetPassword, { token, password: credentials.password })).toEqual({ ok: false, error: 'Open a valid password reset link.' });
		expect(workos.resetPassword).not.toHaveBeenCalled();
	});

	it('returns safe errors for reset failures', async () => {
		workos.createPasswordReset.mockRejectedValueOnce(new Error('email secret reset URL'));
		workos.resetPassword.mockRejectedValueOnce(new Error('secret token and password'));
		const t = harness();
		expect(await t.action(api.authFlow.requestPasswordReset, { email: credentials.email })).toEqual({ ok: false, error: 'We couldn’t request a password reset. Try again.' });
		expect(await t.action(api.authFlow.resetPassword, { token: 'expired', password: credentials.password })).toEqual({ ok: false, error: 'We couldn’t reset your password. Try a different password or request a new link.' });
		expect(await t.run(ctx => ctx.db.query('users').collect())).toEqual([]);
	});

	it.each(['WORKOS_API_KEY', 'WORKOS_CLIENT_ID'])('handles missing %s safely in new actions', async (key) => {
		delete process.env[key];
		const t = harness();
		for (const result of [
			await t.action(api.authFlow.authenticatePassword, credentials),
			await t.action(api.authFlow.verifyEmail, verification)
		]) {
			expect(result).toEqual({ session: null, error: expect.any(String), pendingAuthenticationToken: null });
		}
		for (const result of [
			await t.action(api.authFlow.requestPasswordReset, { email: credentials.email }),
			await t.action(api.authFlow.resetPassword, { token: 'token', password: credentials.password })
		]) expect(result).toEqual({ ok: false, error: expect.any(String) });
		for (const method of Object.values(workos)) expect(method).not.toHaveBeenCalled();
	});

	it('googleUrl asks WorkOS for a Google OAuth URL', async () => {
		const t = harness();
		const url = await t.action(api.authFlow.googleUrl, {
			redirectUri: 'http://127.0.0.1/callback',
			state: '{"returnTo":"/create"}'
		});
		expect(url).toBe('https://accounts.google.com/o/oauth2/auth?fake=1');
		expect(workos.getAuthorizationUrl).toHaveBeenCalledWith({
			clientId: TEST_WORKOS_CLIENT_ID,
			provider: 'GoogleOAuth',
			redirectUri: 'http://127.0.0.1/callback',
			state: '{"returnTo":"/create"}'
		});
	});

	it('exchangeCode records the user; a failed exchange does not', async () => {
		const t = harness();
		const ok = await t.action(api.authFlow.exchangeCode, { code: 'ok-code' });
		expect(ok.session?.email).toBe('maya@example.com');
		expect(workos.authenticateWithCode).toHaveBeenCalledWith({
			clientId: TEST_WORKOS_CLIENT_ID,
			code: 'ok-code'
		});
		expect(await t.run(async (ctx) => ctx.db.query('users').collect())).toHaveLength(1);

		workos.authenticateWithCode.mockRejectedValueOnce(new Error('bad code'));
		await expect(t.action(api.authFlow.exchangeCode, { code: 'bad' })).resolves.toEqual({
			session: null,
			error: 'Sign-in failed. Try again.'
		});
	});

	it.each(['authenticatePassword', 'verifyEmail', 'exchangeCode', 'refresh'] as const)('%s maps absent WorkOS names to null', async (flow) => {
		const t = harness();
		const result = tokens();
		Reflect.deleteProperty(result.user, 'firstName');
		Reflect.deleteProperty(result.user, 'lastName');
		workos.authenticateWithPassword.mockResolvedValueOnce(result);
				workos.authenticateWithEmailVerification.mockResolvedValueOnce(result);
		workos.authenticateWithCode.mockResolvedValueOnce(result);
		workos.authenticateWithRefreshToken.mockResolvedValueOnce(result);
		const response = flow === 'authenticatePassword'
			? (await t.action(api.authFlow.authenticatePassword, credentials)).session
			: flow === 'verifyEmail'
				? (await t.action(api.authFlow.verifyEmail, verification)).session
			: flow === 'exchangeCode'
				? (await t.action(api.authFlow.exchangeCode, { code: 'code' })).session
				: await t.action(api.authFlow.refresh, { refreshToken: 'refresh' });
		expect(response).toEqual({
			accessToken: 'access-token', refreshToken: 'refresh-token',
			email: 'maya@example.com', firstName: null, lastName: null
		});
		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(flow === 'refresh' ? 0 : 1);
		if (flow !== 'refresh') expect(users[0]?.name).toBe('maya@example.com');
	});

	it('refresh returns a new session or null, without writing users', async () => {
		const t = harness();
		await expect(t.action(api.authFlow.refresh, { refreshToken: 'r1' })).resolves.toEqual({
			accessToken: 'access-token',
			refreshToken: 'refresh-token',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: 'Otieno'
		});
		expect(workos.authenticateWithRefreshToken).toHaveBeenCalledWith({
			clientId: TEST_WORKOS_CLIENT_ID,
			refreshToken: 'r1'
		});
		expect(await t.run(async (ctx) => ctx.db.query('users').collect())).toEqual([]);

		workos.authenticateWithRefreshToken.mockRejectedValueOnce(new Error('revoked'));
		await expect(t.action(api.authFlow.refresh, { refreshToken: 'dead' })).resolves.toBeNull();
	});
});
