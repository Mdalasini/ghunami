import { api } from '../../convex/_generated/api';
import { convexServer } from './convex.server';
import { sessionCookie, type Session } from './session.server';

/** Seconds of remaining life below which we refresh rather than reuse the JWT. */
const SKEW = 60;

const inflight = new Map<string, Promise<Session | null>>();

export function accessTokenFresh(jwt: string, now = Date.now() / 1000): boolean {
	const payload = jwt.split('.')[1];
	if (!payload) return false;
	try {
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
		return typeof claims.exp === 'number' && claims.exp - SKEW > now;
	} catch {
		return false;
	}
}

/**
 * WorkOS rotates refresh tokens, so overlapping refreshes sign the user out.
 * Media and `/auth/token` share this map in-process.
 */
export async function liveSession(
	session: Session,
	opts: { force?: boolean } = {}
): Promise<{ session: Session; setCookie?: string } | null> {
	if (!opts.force && accessTokenFresh(session.accessToken)) {
		return { session };
	}

	let pending = inflight.get(session.refreshToken);
	if (!pending) {
		pending = convexServer()
			.action(api.authFlow.refresh, { refreshToken: session.refreshToken })
			.finally(() => {
				inflight.delete(session.refreshToken);
			});
		inflight.set(session.refreshToken, pending);
	}

	const renewed = await pending;
	if (!renewed) return null;
	return { session: renewed, setCookie: sessionCookie(renewed) };
}
