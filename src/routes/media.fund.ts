import type { LoaderFunctionArgs } from 'react-router';
import { isFundID } from '../../convex/lib/fundId';
import { liveSession } from '../lib/liveSession.server';
import { convexSiteUrl } from '../lib/media';
import { loadServerEnv } from '../lib/env.server';
import { clearedCookie, readSession } from '../lib/session.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
	loadServerEnv();
	const session = readSession(request);
	const fundID = params.fundID ?? '';
	if (!session || !isFundID(fundID)) {
		return new Response('Not found', { status: 404 });
	}

	const live = await liveSession(session);
	if (!live) {
		return new Response('Not found', { status: 404, headers: { 'Set-Cookie': clearedCookie() } });
	}

	const kind = new URL(request.url).searchParams.get('kind') === 'original' ? 'original' : 'cover';
	const url = `${convexSiteUrl()}/media?fundID=${encodeURIComponent(fundID)}&kind=${kind}`;
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${live.session.accessToken}` }
	});
	if (!response.ok || !response.body) {
		return new Response('Not found', {
			status: 404,
			headers: live.setCookie ? { 'Set-Cookie': live.setCookie } : undefined
		});
	}

	const headers: Record<string, string> = {
		'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff'
	};
	if (live.setCookie) headers['Set-Cookie'] = live.setCookie;
	return new Response(response.body, { headers });
}
