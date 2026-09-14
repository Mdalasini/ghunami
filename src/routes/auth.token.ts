import type { LoaderFunctionArgs } from 'react-router';
import { liveSession } from '../lib/liveSession.server';
import { loadServerEnv } from '../lib/env.server';
import { clearedCookie, readSession } from '../lib/session.server';

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

	const force = new URL(request.url).searchParams.get('force') === '1';
	const live = await liveSession(session, { force });
	if (!live) {
		return Response.json({ token: null }, { headers: { 'Set-Cookie': clearedCookie() } });
	}

	return Response.json(
		{ token: live.session.accessToken },
		live.setCookie ? { headers: { 'Set-Cookie': live.setCookie } } : undefined
	);
}
