import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { callbackKeyFromPath, parseStkCallback } from './lib/mpesa';

const http = httpRouter();

http.route({
	path: '/media',
	method: 'GET',
	handler: httpAction(async (ctx, request) => {
		const url = new URL(request.url);
		const fundID = url.searchParams.get('fundID') ?? '';
		const kind = url.searchParams.get('kind') === 'original' ? 'original' : 'cover';
		const file = await ctx.runQuery(internal.funds.mediaFile, { fundID, kind });
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

http.route({
	pathPrefix: '/mpesa/stk/',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const callbackKey = callbackKeyFromPath(new URL(request.url).pathname);
		if (!callbackKey) return new Response('Not found', { status: 404 });

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return new Response('Bad request', { status: 400 });
		}

		const parsed = parseStkCallback(body);
		if (!parsed) return new Response('Bad request', { status: 400 });

		await ctx.runMutation(internal.donations.applyCallback, {
			callbackKey,
			merchantRequestId: parsed.merchantRequestId,
			checkoutRequestId: parsed.checkoutRequestId,
			resultCode: parsed.resultCode,
			resultDesc: parsed.resultDesc,
			amount: parsed.amount,
			phone: parsed.phone,
			receipt: parsed.receipt
		});
		return new Response(null, { status: 200 });
	})
});

export default http;
