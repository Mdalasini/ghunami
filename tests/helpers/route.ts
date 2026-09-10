import { RouterContextProvider, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';

export type RouteArgs = LoaderFunctionArgs & ActionFunctionArgs;

export function routeArgs(request: Request): RouteArgs {
	const url = new URL(request.url);
	return {
		request,
		url,
		params: {},
		pattern: url.pathname,
		context: new RouterContextProvider()
	};
}

export function formRequest(url: string, fields: Record<string, string>): Request {
	return new Request(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(fields)
	});
}

export function isResponse(value: unknown): value is Response {
	return value instanceof Response;
}
