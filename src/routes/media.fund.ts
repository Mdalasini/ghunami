import type { LoaderFunctionArgs } from 'react-router';
import { isFundID } from '../../convex/lib/fundId';
import { convexSiteUrl } from '../lib/media';
import { loadServerEnv } from '../lib/env.server';
import { readSession } from '../lib/session.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
	loadServerEnv();
	const session = readSession(request);
	const fundID = params.fundID ?? '';
	if (!session || !isFundID(fundID)) {
		return new Response('Not found', { status: 404 });
	}

	const kind = new URL(request.url).searchParams.get('kind') === 'original' ? 'original' : 'cover';
	const url = `${convexSiteUrl()}/media?fundID=${encodeURIComponent(fundID)}&kind=${kind}`;
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${session.accessToken}` }
	});
	if (!response.ok || !response.body) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(response.body, {
		headers: {
			'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
			'Cache-Control': 'private, max-age=60',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}
