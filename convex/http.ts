import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

const http = httpRouter();

http.route({
	path: '/media',
	method: 'GET',
	handler: httpAction(async (ctx, request) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return new Response('Not found', { status: 404 });

		const url = new URL(request.url);
		const fundID = url.searchParams.get('fundID') ?? '';
		const kind = url.searchParams.get('kind') === 'original' ? 'original' : 'cover';
		const file = await ctx.runQuery(internal.funds.mediaForOwner, { fundID, kind });
		if (!file) return new Response('Not found', { status: 404 });

		const blob = await ctx.storage.get(file.storageId);
		if (!blob) return new Response('Not found', { status: 404 });

		return new Response(blob, {
			headers: {
				'Content-Type': file.contentType,
				'Cache-Control': 'no-store',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	})
});

export default http;
