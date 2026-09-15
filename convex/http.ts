import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { callbackKeyFromPath, parseStkCallback, reversalKeyFromPath, parseReversalResult } from './lib/mpesa';

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

http.route({
	pathPrefix: '/mpesa/reversal/result/',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const callbackKey = reversalKeyFromPath(new URL(request.url).pathname, 'result');
		if (!callbackKey) return new Response('Not found', { status: 404 });

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return new Response('Bad request', { status: 400 });
		}

		const parsed = parseReversalResult(body);
		if (!parsed) return new Response('Bad request', { status: 400 });

		await ctx.runMutation(internal.reversals.applyReversalResult, {
			callbackKey,
			originatorConversationId: parsed.originatorConversationId,
			conversationId: parsed.conversationId,
			resultCode: parsed.resultCode,
			resultDesc: parsed.resultDesc,
			reversalReceipt: parsed.reversalReceipt,
			originalTransactionId: parsed.originalTransactionId,
			amount: parsed.amount
		});
		return new Response(null, { status: 200 });
	})
});

http.route({
	pathPrefix: '/mpesa/reversal/timeout/',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const timeoutKey = reversalKeyFromPath(new URL(request.url).pathname, 'timeout');
		if (!timeoutKey) return new Response('Not found', { status: 404 });
		try {
			await request.json();
		} catch {
			// Timeout notices may arrive empty; capability is enough to mark unknown.
		}
		await ctx.runMutation(internal.reversals.applyReversalTimeout, { timeoutKey });
		return new Response(null, { status: 200 });
	})
});

export default http;
