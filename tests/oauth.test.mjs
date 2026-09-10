import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.SESSION_SECRET = 'test-only-secret-with-at-least-32-characters';
process.env.NODE_ENV = 'production';

// Load the real route loaders, replacing only the remote Convex boundary.
const server = await createServer({
	configFile: false,
	server: { middlewareMode: true },
	appType: 'custom',
	plugins: [{
		name: 'mock-convex',
		enforce: 'pre',
		load(id) {
			if (id.endsWith('/src/lib/convex.server.ts')) {
				return 'export function convexServer() { return globalThis.oauthTestConvex; }';
			}
			if (id.endsWith('/src/lib/env.server.ts')) {
				return 'export function loadServerEnv() {}';
			}
		}
	}]
});
after(() => server.close());
const { loader: initiate } = await server.ssrLoadModule('/src/routes/auth.google.ts');
const { loader: callback } = await server.ssrLoadModule('/src/routes/callback.tsx');
const { readSession } = await server.ssrLoadModule('/src/lib/session.server.ts');

const session = {
	accessToken: 'access', refreshToken: 'refresh', email: 'user@example.com',
	firstName: null, lastName: null
};
let calls;
let exchangeResult;
let exchangeError;
function reset() {
	calls = [];
	exchangeResult = { session, error: null };
	exchangeError = false;
	globalThis.oauthTestConvex = {
		async action(_action, args) {
			calls.push(args);
			if ('redirectUri' in args) {
				return `https://provider.example/authorize?state=${args.state}`;
			}
			if (exchangeError) throw new Error('Provider unavailable');
			return exchangeResult;
		}
	};
}
async function start(returnTo = '/saved') {
	const response = await initiate({ request: new Request(
		`https://app.example/auth/google?returnTo=${encodeURIComponent(returnTo)}`
	) });
	return {
		response,
		state: new URL(response.headers.get('Location')).searchParams.get('state'),
		cookie: response.headers.get('Set-Cookie').split(';')[0]
	};
}
function finish(state, cookie, extra = 'code=valid-code') {
	const query = new URLSearchParams(extra);
	if (state !== null) query.append('state', state);
	return callback({ request: new Request(`https://app.example/callback?${query}`, {
		headers: cookie ? { Cookie: cookie } : {}
	}) });
}
function assertCleared(result) {
	const headers = result instanceof Response ? result.headers : new Headers(result.init.headers);
	assert.equal(headers.get('Cache-Control'), 'no-store');
	assert.ok(headers.getSetCookie().some(cookie =>
		cookie.startsWith('__Host-gh_oauth_state=') && cookie.includes('Max-Age=0')));
	return headers;
}
function assertNoSession(result) {
	const headers = new Headers(result.init.headers);
	assert.equal(headers.get('Cache-Control'), 'no-store');
	assert.ok(!headers.getSetCookie().some(cookie => cookie.startsWith('gh_session=')));
}

test('initiation generates independent opaque state and a secure browser cookie', async () => {
	reset();
	const first = await start();
	const second = await start();
	assert.match(first.state, /^[A-Za-z0-9_-]{43}$/);
	assert.notEqual(first.state, second.state);
	assert.equal(calls[0].state, first.state);
	assert.equal(calls[0].redirectUri, 'https://app.example/callback');
	const cookie = first.response.headers.get('Set-Cookie');
	for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) {
		assert.ok(cookie.includes(attribute), attribute);
	}
	assert.ok(!cookie.includes('Domain='));
	assert.equal(first.response.headers.get('Cache-Control'), 'no-store');
});

test('invalid browser correlation never exchanges a code or installs a session', async (t) => {
	for (const scenario of ['missing state', 'missing cookie', 'other browser', 'malformed state',
		'tampered cookie', 'expired cookie', 'duplicate state']) {
		await t.test(scenario, async () => {
			reset();
			const first = await start();
			const other = await start();
			let state = first.state;
			let cookie = first.cookie;
			let extra = 'code=valid-code';
			if (scenario === 'missing state') state = null;
			if (scenario === 'missing cookie') cookie = null;
			if (scenario === 'other browser') cookie = other.cookie;
			if (scenario === 'malformed state') state = JSON.stringify({ returnTo: '/saved' });
			if (scenario === 'tampered cookie') cookie += 'tampered';
			if (scenario === 'duplicate state') extra += `&state=${first.state}`;
			const now = Date.now;
			if (scenario === 'expired cookie') Date.now = () => now() + 601_000;
			let result;
			try { result = await finish(state, cookie, extra); }
			finally { Date.now = now; }
			assert.equal(result.init.status, 400);
			assert.equal(calls.length, 2, 'only initiation may contact Convex');
			assertNoSession(result);
		});
	}
});

test('matching state exchanges code, preserves returnTo, and clears temporary cookie', async () => {
	reset();
	const flow = await start('/saved?view=all');
	const result = await finish(flow.state, flow.cookie, 'code=valid-code&returnTo=https://evil.example');
	assert.equal(result.status, 302);
	assert.equal(result.headers.get('Location'), '/saved?view=all');
	assert.deepEqual(calls[1], { code: 'valid-code' });
	const cookies = assertCleared(result).getSetCookie();
	assert.equal(cookies.length, 2);
	const installed = cookies.find(cookie => cookie.startsWith('gh_session='));
	assert.deepEqual(readSession(new Request('https://app.example', {
		headers: { Cookie: installed.split(';')[0] }
	})), session);
	// Once the browser applies the clearing cookie, the old state is no longer accepted.
	const replay = await finish(flow.state, cookies[0].split(';')[0]);
	assert.equal(replay.init.status, 400);
	assert.equal(calls.length, 2);
	assertNoSession(replay);
});

test('a stale callback does not clear a newer login attempt', async () => {
	reset();
	const old = await start();
	const current = await start();
	const rejected = await finish(old.state, current.cookie);
	assert.equal(rejected.init.status, 400);
	assert.equal(new Headers(rejected.init.headers).get('Set-Cookie'), null);
	assert.equal(calls.length, 2);
	const accepted = await finish(current.state, current.cookie);
	assert.equal(accepted.status, 302);
	assertCleared(accepted);
});

test('external returnTo is not used for the successful redirect', async () => {
	reset();
	const flow = await start('https://evil.example');
	const result = await finish(flow.state, flow.cookie);
	assert.equal(result.headers.get('Location'), '/');
});

test('cancellation and exchange failures clear state without installing a session', async (t) => {
	for (const scenario of ['provider error', 'missing code', 'exchange rejected', 'exchange threw']) {
		await t.test(scenario, async () => {
			reset();
			const flow = await start();
			let extra = 'code=valid-code';
			if (scenario === 'provider error') extra += '&error=access_denied';
			if (scenario === 'missing code') extra = '';
			if (scenario === 'exchange rejected') exchangeResult = { session: null, error: 'Failed' };
			if (scenario === 'exchange threw') exchangeError = true;
			const result = await finish(flow.state, flow.cookie, extra);
			assertCleared(result);
			assertNoSession(result);
			assert.equal(calls.length, scenario.startsWith('exchange') ? 2 : 1);
		});
	}
});
