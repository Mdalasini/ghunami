import { ConvexHttpClient } from 'convex/browser';
import { loadServerEnv } from './env.server';

let client: ConvexHttpClient | null = null;

/** Server-side Convex client, used to reach the WorkOS actions. */
export function convexServer(): ConvexHttpClient {
	loadServerEnv();
	if (!client) {
		const url = import.meta.env.VITE_CONVEX_URL;
		if (!url) {
			throw new Error('VITE_CONVEX_URL is not set.');
		}
		client = new ConvexHttpClient(url);
	}
	return client;
}
