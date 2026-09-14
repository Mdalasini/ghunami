import { ConvexHttpClient } from 'convex/browser';
import { loadServerEnv } from './env.server';

let client: ConvexHttpClient | null = null;

/**
 * Unauthenticated server Convex client. Do not call setAuth on this singleton;
 * public loaders share it with WorkOS actions.
 */
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
