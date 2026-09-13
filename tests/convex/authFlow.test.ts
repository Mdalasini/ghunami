import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { restoreEnv } from '../helpers/session';
import { authFlowModules } from './modules';

const TEST_WORKOS_API_KEY = 'ghunami-test-only-workos-api-key';
const TEST_WORKOS_CLIENT_ID = 'client_test_isolated';

const workos = vi.hoisted(() => ({
	createUser: vi.fn(),
	createMagicAuth: vi.fn(),
	authenticateWithMagicAuth: vi.fn(),
	getAuthorizationUrl: vi.fn(),
	authenticateWithCode: vi.fn(),
	authenticateWithRefreshToken: vi.fn()
}));

vi.mock('@workos-inc/node', () => ({
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
		process.env.WORKOS_API_KEY = TEST_WORKOS_API_KEY;
		process.env.WORKOS_CLIENT_ID = TEST_WORKOS_CLIENT_ID;
		workos.createUser.mockResolvedValue({ id: 'user_maya' });
		workos.createMagicAuth.mockResolvedValue({ id: 'magic_1' });
		workos.authenticateWithMagicAuth.mockResolvedValue(tokens());
		workos.getAuthorizationUrl.mockReturnValue('https://accounts.google.com/o/oauth2/auth?fake=1');
		workos.authenticateWithCode.mockResolvedValue(tokens());
		workos.authenticateWithRefreshToken.mockResolvedValue(tokens());
	});

	afterEach(() => {
		restoreEnv('WORKOS_API_KEY', previousKey);
		restoreEnv('WORKOS_CLIENT_ID', previousClient);
		vi.restoreAllMocks();
	});

	it('sendCode normalizes email and does not create a user unless firstName is set', async () => {
		const t = harness();
		await expect(
			t.action(api.authFlow.sendCode, { email: '  Maya@Example.COM ' })
		).resolves.toEqual({ ok: true, error: null });

		expect(workos.createUser).not.toHaveBeenCalled();
		expect(workos.createMagicAuth).toHaveBeenCalledWith({ email: 'maya@example.com' });
	});

	it('sendCode creates a user when firstName is present, then still sends a code if they already exist', async () => {
		const t = harness();
		await t.action(api.authFlow.sendCode, {
			email: 'maya@example.com',
			firstName: ' Maya ',
			lastName: ' Otieno '
		});
		expect(workos.createUser).toHaveBeenCalledWith({
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: 'Otieno'
		});

		workos.createUser.mockRejectedValueOnce(new Error('User already exists'));
		await expect(
			t.action(api.authFlow.sendCode, { email: 'maya@example.com', firstName: 'Maya' })
		).resolves.toEqual({ ok: true, error: null });
		expect(workos.createMagicAuth).toHaveBeenCalledTimes(2);
	});

	it('sendCode returns our copy when WorkOS cannot mail the code', async () => {
		workos.createMagicAuth.mockRejectedValueOnce(new Error('WorkOS named the address'));
		const t = harness();
		await expect(t.action(api.authFlow.sendCode, { email: 'maya@example.com' })).resolves.toEqual({
			ok: false,
			error: 'We couldn’t send that code. Try again.'
		});
	});

	it('verifyCode records the WorkOS identity and returns a session', async () => {
		const t = harness();
		const result = await t.action(api.authFlow.verifyCode, {
			email: '  Maya@Example.COM ',
			code: ' 123456 '
		});
		expect(workos.authenticateWithMagicAuth).toHaveBeenCalledWith({
			clientId: TEST_WORKOS_CLIENT_ID,
			email: 'maya@example.com',
			code: '123456'
		});
		expect(result).toEqual({
			session: {
				accessToken: 'access-token',
				refreshToken: 'refresh-token',
				email: 'maya@example.com',
				firstName: 'Maya',
				lastName: 'Otieno'
			},
			error: null
		});

		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({
			tokenIdentifier: `https://api.workos.com/user_management/${TEST_WORKOS_CLIENT_ID}|user_maya`,
			email: 'maya@example.com',
			name: 'Maya Otieno'
		});
	});

	it('verifyCode returns a safe error and no session when the code is wrong', async () => {
		workos.authenticateWithMagicAuth.mockRejectedValueOnce(new Error('invalid code for maya@example.com'));
		const t = harness();
		await expect(
			t.action(api.authFlow.verifyCode, { email: 'maya@example.com', code: '000000' })
		).resolves.toEqual({
			session: null,
			error: 'That code didn’t work. Check it, or send a new one.'
		});
		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(users).toEqual([]);
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

	it.each(['verifyCode', 'exchangeCode', 'refresh'] as const)('%s maps absent WorkOS names to null', async (flow) => {
		const t = harness();
		const result = tokens();
		Reflect.deleteProperty(result.user, 'firstName');
		Reflect.deleteProperty(result.user, 'lastName');
		workos.authenticateWithMagicAuth.mockResolvedValueOnce(result);
		workos.authenticateWithCode.mockResolvedValueOnce(result);
		workos.authenticateWithRefreshToken.mockResolvedValueOnce(result);
		const response = flow === 'verifyCode'
			? (await t.action(api.authFlow.verifyCode, { email: 'maya@example.com', code: '123456' })).session
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
