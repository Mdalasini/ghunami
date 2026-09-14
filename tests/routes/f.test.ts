import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import { isResponse, routeArgs } from '../helpers/route';

const query = vi.fn();

vi.mock('../../src/lib/convex.server', () => ({
	convexServer: () => ({ query })
}));

const live = {
	fundID: 'Ab3',
	goal: 50_000,
	title: 'Help Maya get home',
	story: '<p>Raising travel money so Maya can get home safely.</p>',
	status: 'live' as const,
	hasCover: false,
	organiserName: 'Maya Otieno',
	publishedAt: 1,
	updatedAt: 2
};

function loaderArgs(url: string, params: Record<string, string>) {
	const request = new Request(url);
	return { ...routeArgs(request), params };
}

async function load(url: string, params: Record<string, string>) {
	const { loader } = await import('../../src/routes/f');
	return loader(loaderArgs(url, params));
}

function dataOf<T>(result: unknown): T {
	if (result && typeof result === 'object' && 'data' in result) {
		return (result as { data: T }).data;
	}
	return result as T;
}

function statusOf(result: unknown): number | undefined {
	if (isResponse(result)) return result.status;
	if (result && typeof result === 'object' && 'init' in result) {
		return (result as { init?: { status?: number } }).init?.status;
	}
	return undefined;
}

describe('public fund loader', () => {
	beforeEach(() => {
		query.mockReset();
	});

	it('returns 404 for malformed IDs without querying', async () => {
		const result = await load('https://ghunami.test/f/nope', { fundID: 'nope' });
		expect(statusOf(result)).toBe(404);
		expect(dataOf<{ fund: null }>(result).fund).toBeNull();
		expect(query).not.toHaveBeenCalled();
	});

	it('returns 404 for missing and draft funds without a Location header', async () => {
		query.mockResolvedValueOnce(null);
		const result = await load('https://ghunami.test/f/Ab3/secret-title', { fundID: 'Ab3', slug: 'secret-title' });
		expect(statusOf(result)).toBe(404);
		expect(isResponse(result) && result.headers.get('Location')).toBeFalsy();
		expect(JSON.stringify(dataOf(result))).not.toMatch(/secret-title|Help Maya/);
		expect(getFunctionName(query.mock.calls[0]?.[0])).toBe('funds:getPublic');
	});

	it('redirects a bare live ID to the canonical path and keeps the query string', async () => {
		query.mockResolvedValueOnce(live);
		const result = await load('https://ghunami.test/f/Ab3?from=sms', { fundID: 'Ab3' });
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.status).toBe(302);
		expect(result.headers.get('Location')).toBe('/f/Ab3/help-maya-get-home?from=sms');
	});

	it('redirects an outdated slug and renders the canonical path without a redirect', async () => {
		query.mockResolvedValueOnce(live);
		const redirected = await load('https://ghunami.test/f/Ab3/old-title', { fundID: 'Ab3', slug: 'old-title' });
		expect(isResponse(redirected)).toBe(true);
		if (!isResponse(redirected)) return;
		expect(redirected.status).toBe(302);
		expect(redirected.headers.get('Location')).toBe('/f/Ab3/help-maya-get-home');

		query.mockResolvedValueOnce(live);
		const canonical = await load('https://ghunami.test/f/Ab3/help-maya-get-home', {
			fundID: 'Ab3',
			slug: 'help-maya-get-home'
		});
		expect(isResponse(canonical)).toBe(false);
		expect(statusOf(canonical)).toBeUndefined();
		expect(dataOf<{ fund: { title: string } }>(canonical).fund.title).toBe(live.title);
	});

	it('does not loop on Unicode titles', async () => {
		const tokyo = { ...live, title: '東京' };
		query.mockResolvedValueOnce(tokyo);
		const encoded = await load(`https://ghunami.test/f/Ab3/${encodeURIComponent('東京')}`, {
			fundID: 'Ab3',
			slug: '東京'
		});
		expect(isResponse(encoded)).toBe(false);
		expect(dataOf<{ fund: { title: string } }>(encoded).fund.title).toBe('東京');
	});

	it('lets backend failures surface instead of turning them into 404', async () => {
		query.mockRejectedValueOnce(new Error('Convex unreachable'));
		await expect(load('https://ghunami.test/f/Ab3', { fundID: 'Ab3' })).rejects.toThrow(/Convex unreachable/);
	});
});
