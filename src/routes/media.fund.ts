import type { LoaderFunctionArgs } from 'react-router';
import { isFundID } from '../../convex/lib/fundId';
import { liveSession } from '../lib/liveSession.server';
import { convexSiteUrl } from '../lib/media';
import { loadServerEnv } from '../lib/env.server';
import { clearedCookie, readSession } from '../lib/session.server';

function passthrough(response: Response, extra: Record<string, string> = {}) {
	const headers: Record<string, string> = {
		'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		...extra
	};
	return new Response(response.body, { headers });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	loadServerEnv();
	const fundID = params.fundID ?? '';
	if (!isFundID(fundID)) {
		return new Response('Not found', { status: 404 });
	}

	const kind = new URL(request.url).searchParams.get('kind') === 'original' ? 'original' : 'cover';
	const url = `${convexSiteUrl()}/media?fundID=${encodeURIComponent(fundID)}&kind=${kind}`;

	if (kind === 'cover') {
		const anon = await fetch(url);
		if (anon.ok && anon.body) return passthrough(anon);
	}

	const session = readSession(request);
	if (!session) {
		return new Response('Not found', { status: 404 });
	}

	const live = await liveSession(session);
	if (!live) {
		return new Response('Not found', { status: 404, headers: { 'Set-Cookie': clearedCookie() } });
	}

	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${live.session.accessToken}` }
	});
	if (!response.ok || !response.body) {
		return new Response('Not found', {
			status: 404,
			headers: live.setCookie ? { 'Set-Cookie': live.setCookie } : undefined
		});
	}

	return passthrough(response, live.setCookie ? { 'Set-Cookie': live.setCookie } : {});
}
