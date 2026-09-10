import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createCookie } from 'react-router';
import { safeReturnTo } from './returnTo';

const MAX_AGE = 10 * 60;

function stateCookie() {
	const secret = process.env.SESSION_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error('SESSION_SECRET must be set to at least 32 characters.');
	}
	const secure = process.env.NODE_ENV === 'production';
	return createCookie(secure ? '__Host-gh_oauth_state' : 'gh_oauth_state', {
		httpOnly: true,
		secure,
		sameSite: 'lax',
		path: '/',
		maxAge: MAX_AGE,
		secrets: [secret]
	});
}

export async function createOAuthState(returnTo: string) {
	const nonce = randomBytes(32).toString('base64url');
	return {
		state: nonce,
		cookie: await stateCookie().serialize({
			nonce,
			returnTo: safeReturnTo(returnTo),
			expiresAt: Date.now() + MAX_AGE * 1000
		})
	};
}

/** Only the signed browser cookie supplies redirect data; URL state is opaque. */
export async function validateOAuthState(request: Request): Promise<{ returnTo: string } | null> {
	const states = new URL(request.url).searchParams.getAll('state');
	const state = states[0];
	if (states.length !== 1 || !state || !/^[A-Za-z0-9_-]{43}$/.test(state)) return null;

	try {
		const stored = await stateCookie().parse(request.headers.get('Cookie'));
		if (
			!stored ||
			typeof stored.nonce !== 'string' ||
			!/^[A-Za-z0-9_-]{43}$/.test(stored.nonce) ||
			typeof stored.expiresAt !== 'number' ||
			!Number.isFinite(stored.expiresAt) ||
			stored.expiresAt <= Date.now() ||
			!timingSafeEqual(Buffer.from(state), Buffer.from(stored.nonce))
		) return null;
		return { returnTo: safeReturnTo(stored.returnTo) };
	} catch {
		return null;
	}
}

export function clearedOAuthStateCookie(): Promise<string> {
	return stateCookie().serialize('', { maxAge: 0 });
}
