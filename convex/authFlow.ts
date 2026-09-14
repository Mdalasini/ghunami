'use node';

import { v } from 'convex/values';
import { WorkOS, AuthenticationException, type AuthenticationResponse } from '@workos-inc/node';
import { internal } from './_generated/api';
import { action } from './_generated/server';
import type { ActionCtx } from './_generated/server';

/**
 * Every WorkOS call lives here. The API key and client id are already set on the
 * Convex deployment by Convex-managed WorkOS, so the secret never leaves the
 * backend and the browser only ever sees tokens it is entitled to.
 */
function client(): { workos: WorkOS; clientId: string } {
	const apiKey = process.env.WORKOS_API_KEY;
	const clientId = process.env.WORKOS_CLIENT_ID;
	if (!apiKey || !clientId) {
		throw new Error('WORKOS_API_KEY and WORKOS_CLIENT_ID must be set on the Convex deployment.');
	}
	return { workos: new WorkOS(apiKey, { clientId }), clientId };
}

const session = v.object({
	accessToken: v.string(),
	refreshToken: v.string(),
	email: v.string(),
	firstName: v.union(v.string(), v.null()),
	lastName: v.union(v.string(), v.null())
});

function toSession(result: AuthenticationResponse) {
	return {
		accessToken: result.accessToken,
		refreshToken: result.refreshToken,
		email: result.user.email,
		firstName: result.user.firstName ?? null,
		lastName: result.user.lastName ?? null
	};
}

/**
 * Records the authenticated WorkOS identity rather than caller-supplied details.
 * Email verification is enforced by the WorkOS environment's auth policy.
 * The access token has no `email` claim to fall back on.
 */
async function record(
	ctx: ActionCtx,
	clientId: string,
	user: AuthenticationResponse['user']
): Promise<void> {
	await ctx.runMutation(internal.users.upsertFromWorkOS, {
		issuer: `https://api.workos.com/user_management/${clientId}`,
		workosUserId: user.id,
		email: user.email,
		firstName: user.firstName ?? null,
		lastName: user.lastName ?? null
	});
}

const authenticationResult = v.object({
	session: v.union(session, v.null()),
	error: v.union(v.string(), v.null()),
	pendingAuthenticationToken: v.union(v.string(), v.null())
});
const operationResult = v.object({ ok: v.boolean(), error: v.union(v.string(), v.null()) });

function authenticationFailure(error: string) {
	return { session: null, error, pendingAuthenticationToken: null };
}

// Never log SDK exceptions: their raw data can contain credentials and tokens.
function authenticationError(error: unknown, fallback: string) {
	if (
		error instanceof AuthenticationException &&
		error.code === 'email_verification_required' &&
		typeof error.pendingAuthenticationToken === 'string' &&
		error.pendingAuthenticationToken.trim()
	) {
		return { session: null, error: null, pendingAuthenticationToken: error.pendingAuthenticationToken };
	}
	return authenticationFailure(fallback);
}

function validEmail(email: string): boolean {
	return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validName(name: string | undefined): boolean {
	return !!name && name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name);
}

/** Creates password accounts only on explicit signup, then authenticates them. */
export const authenticatePassword = action({
	args: {
		email: v.string(),
		password: v.string(),
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string()),
		signUp: v.boolean()
	},
	returns: authenticationResult,
	handler: async (ctx, args) => {
		const email = args.email.trim().toLowerCase();
		const firstName = args.firstName?.trim();
		const lastName = args.lastName?.trim();
		if (!validEmail(email)) return authenticationFailure('Enter a valid email address.');
		if (!args.password.trim()) return authenticationFailure('Enter your password.');
		if (args.signUp && (!validName(firstName) || !validName(lastName))) {
			return authenticationFailure('Enter your first and last name (1–100 characters each).');
		}

		try {
			const { workos, clientId } = client();
			if (args.signUp) {
				try {
					await workos.userManagement.createUser({ email, password: args.password, firstName, lastName });
				} catch {
					// A duplicate or failed signup must never fall through to sign-in.
					return authenticationFailure('We couldn’t create your account. Try signing in, or use a different password.');
				}
			}
			const result = await workos.userManagement.authenticateWithPassword({
				clientId, email, password: args.password
			});
			await record(ctx, clientId, result.user);
			return { session: toSession(result), error: null, pendingAuthenticationToken: null };
		} catch (error) {
			return authenticationError(error, 'Sign-in failed. Check your email and password, then try again.');
		}
	}
});

/** Completes the email verification challenge from password authentication. */
export const verifyEmail = action({
	args: { code: v.string(), pendingAuthenticationToken: v.string() },
	returns: authenticationResult,
	handler: async (ctx, args) => {
		const code = args.code.trim();
		if (!code || !args.pendingAuthenticationToken.trim()) {
			return authenticationFailure('Enter the verification code and try again.');
		}
		try {
			const { workos, clientId } = client();
			const result = await workos.userManagement.authenticateWithEmailVerification({
				clientId, code, pendingAuthenticationToken: args.pendingAuthenticationToken
			});
			await record(ctx, clientId, result.user);
			return { session: toSession(result), error: null, pendingAuthenticationToken: null };
		} catch (error) {
			return authenticationError(error, 'That code didn’t work. Check it, or sign in again.');
		}
	}
});

/** WorkOS sends the reset email using the reset URL configured in its dashboard. */
export const requestPasswordReset = action({
	args: { email: v.string() },
	returns: operationResult,
	handler: async (_ctx, args) => {
		const email = args.email.trim().toLowerCase();
		if (!validEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
		try {
			const { workos } = client();
			await workos.userManagement.createPasswordReset({ email });
			return { ok: true, error: null };
		} catch {
			return { ok: false, error: 'We couldn’t request a password reset. Try again.' };
		}
	}
});

/** A reset does not install a session; the caller must sign in afterward. */
export const resetPassword = action({
	args: { token: v.string(), password: v.string() },
	returns: operationResult,
	handler: async (_ctx, args) => {
		if (!args.token.trim()) return { ok: false, error: 'Open a valid password reset link.' };
		if (!args.password.trim()) return { ok: false, error: 'Enter your new password.' };
		try {
			const { workos } = client();
			await workos.userManagement.resetPassword({ token: args.token, newPassword: args.password });
			return { ok: true, error: null };
		} catch {
			return { ok: false, error: 'We couldn’t reset your password. Try a different password or request a new link.' };
		}
	}
});

/** The app server supplies an opaque nonce bound to its signed browser cookie. */
export const googleUrl = action({
	args: { redirectUri: v.string(), state: v.string() },
	returns: v.string(),
	handler: async (_ctx, args) => {
		const { workos, clientId } = client();
		return workos.userManagement.getAuthorizationUrl({
			clientId,
			provider: 'GoogleOAuth',
			redirectUri: args.redirectUri,
			state: args.state
		});
	}
});

/**
 * Exchanges the `?code=` WorkOS hands back after Google. This action cannot read
 * browser cookies: the app callback must validate browser-bound OAuth state
 * before calling it, and only that callback may install the returned session.
 */
export const exchangeCode = action({
	args: { code: v.string() },
	returns: v.object({
		session: v.union(session, v.null()),
		error: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const { workos, clientId } = client();
		try {
			const result = await workos.userManagement.authenticateWithCode({
				clientId,
				code: args.code
			});
			await record(ctx, clientId, result.user);
			return { session: toSession(result), error: null };
		} catch {
			return { session: null, error: 'Sign-in failed. Try again.' };
		}
	}
});

/** Called by the token route once the access token is close to expiring. */
export const refresh = action({
	args: { refreshToken: v.string() },
	returns: v.union(session, v.null()),
	handler: async (_ctx, args) => {
		const { workos, clientId } = client();
		try {
			const result = await workos.userManagement.authenticateWithRefreshToken({
				clientId,
				refreshToken: args.refreshToken
			});
			return toSession(result);
		} catch {
			return null;
		}
	}
});
