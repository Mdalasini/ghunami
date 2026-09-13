'use node';

import { v } from 'convex/values';
import { WorkOS, type AuthenticationResponse } from '@workos-inc/node';
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
 * Records the verified identity. This is the only moment we hold an email WorkOS
 * has actually confirmed, so it is where the `users` row gets its email — the
 * access token has no `email` claim to fall back on.
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

/**
 * WorkOS error text names the address back at the caller and reads like an API,
 * so it stays in the logs and the user gets our copy instead.
 */
function message(error: unknown, fallback: string): string {
	console.error('workos', error);
	return fallback;
}

/**
 * Mails a six-digit code. When `firstName` is present the email belongs to
 * nobody yet, so the account is created first. An already-taken email is not an
 * error here — we fall through to the code, which logs the existing user in.
 */
export const sendCode = action({
	args: {
		email: v.string(),
		firstName: v.optional(v.string()),
		lastName: v.optional(v.string())
	},
	returns: v.object({ ok: v.boolean(), error: v.union(v.string(), v.null()) }),
	handler: async (_ctx, args) => {
		const { workos } = client();
		const email = args.email.trim().toLowerCase();

		if (args.firstName) {
			try {
				await workos.userManagement.createUser({
					email,
					firstName: args.firstName.trim(),
					lastName: args.lastName?.trim() || undefined
				});
			} catch {
				// Already registered. The code below still authenticates them.
			}
		}

		try {
			await workos.userManagement.createMagicAuth({ email });
			return { ok: true, error: null };
		} catch (error) {
			return { ok: false, error: message(error, 'We couldn’t send that code. Try again.') };
		}
	}
});

/** Trades the emailed code for a WorkOS session. */
export const verifyCode = action({
	args: { email: v.string(), code: v.string() },
	returns: v.object({
		session: v.union(session, v.null()),
		error: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const { workos, clientId } = client();
		try {
			const result = await workos.userManagement.authenticateWithMagicAuth({
				clientId,
				email: args.email.trim().toLowerCase(),
				code: args.code.trim()
			});
			await record(ctx, clientId, result.user);
			return { session: toSession(result), error: null };
		} catch (error) {
			return {
				session: null,
				error: message(error, 'That code didn’t work. Check it, or send a new one.')
			};
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
		} catch (error) {
			return { session: null, error: message(error, 'Sign-in failed. Try again.') };
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
