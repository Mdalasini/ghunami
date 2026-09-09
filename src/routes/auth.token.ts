import type { LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { convexServer } from '../lib/convex.server';
import { loadServerEnv } from '../lib/env.server';
import { clearedCookie, readSession, sessionCookie } from '../lib/session.server';

/** Seconds of remaining life below which we refresh rather than hand it out. */
const SKEW = 60;

function expiresAt(jwt: string): number {
	const payload = jwt.split('.')[1];
	if (!payload) return 0;
	try {
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		return typeof claims.exp === 'number' ? claims.exp : 0;
	} catch {
		return 0;
	}
}

/**
 * The browser's only way to reach its own access token. The refresh token stays
 * in the httpOnly cookie and is never serialized to the client.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	loadServerEnv();
	const session = readSession(request);
	if (!session) {
		return Response.json({ token: null }, { status: 200 });
	}

	const url = new URL(request.url);
	const force = url.searchParams.get('force') === '1';
	const fresh = expiresAt(session.accessToken) - SKEW > Date.now() / 1000;

	if (fresh && !force) {
		return Response.json({ token: session.accessToken });
	}

	const renewed = await convexServer().action(api.authFlow.refresh, {
		refreshToken: session.refreshToken
	});

	if (!renewed) {
		return Response.json({ token: null }, { headers: { 'Set-Cookie': clearedCookie() } });
	}

	return Response.json(
		{ token: renewed.accessToken },
		{ headers: { 'Set-Cookie': sessionCookie(renewed) } }
	);
}
