import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { api, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { modules } from './modules';
import { restoreEnv } from '../helpers/session';

function harness() {
	return convexTest(schema, modules);
}

const maya = {
	issuer: 'https://example.test',
	workosUserId: 'maya',
	email: 'maya@example.com',
	firstName: 'Maya',
	lastName: 'Otieno'
};

const draft = {
	idempotencyKey: 'create-1-aaaaaaaa',
	goal: 50_000,
	title: 'Help Maya get home',
	story: '<p>Raising travel money so Maya can get home safely.</p>',
	coverSkipped: true
};

const guest = 'ab'.repeat(16);
const phone = '254712345678';

const envNames = [
	'MPESA_ENVIRONMENT',
	'MPESA_CONSUMER_KEY',
	'MPESA_CONSUMER_SECRET',
	'MPESA_SHORTCODE',
	'MPESA_PASSKEY',
	'MPESA_TRANSACTION_TYPE',
	'CONVEX_SITE_URL'
] as const;

const previous = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

function setSandboxEnv() {
	process.env.MPESA_ENVIRONMENT = 'sandbox';
	process.env.MPESA_CONSUMER_KEY = 'test-key';
	process.env.MPESA_CONSUMER_SECRET = 'test-secret';
	process.env.MPESA_SHORTCODE = '174379';
	process.env.MPESA_PASSKEY = 'test-passkey';
	process.env.MPESA_TRANSACTION_TYPE = 'CustomerPayBillOnline';
	process.env.CONVEX_SITE_URL = 'https://test.convex.site';
}

async function asUser(t: ReturnType<typeof harness>, person: typeof maya) {
	await t.mutation(internal.users.upsertFromWorkOS, person);
	return t.withIdentity({ subject: person.workosUserId, issuer: person.issuer });
}

async function liveFund(t: ReturnType<typeof harness>) {
	const owner = await asUser(t, maya);
	const fundID = await owner.mutation(api.funds.create, {
		...draft,
		idempotencyKey: `create-${crypto.randomUUID()}`
	});
	await owner.mutation(api.funds.publish, { fundID });
	return { owner, fundID };
}

function stkOk() {
	return {
		MerchantRequestID: 'm-1',
		CheckoutRequestID: 'ws_CO_1',
		ResponseCode: '0',
		ResponseDescription: 'Success. Request accepted for processing',
		CustomerMessage: 'Success. Request accepted for processing'
	};
}

function mockDaraja(handler?: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const calls: { url: string; init?: RequestInit }[] = [];
	vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		if (handler) return await handler(url, init);
		if (url.includes('/oauth/v1/generate')) {
			return Response.json({ access_token: 'tok', expires_in: 3599 });
		}
		if (url.includes('/mpesa/stkpush/v1/processrequest')) {
			return Response.json(stkOk());
		}
		throw new Error(`unexpected fetch ${url}`);
	});
	return calls;
}

function successBody(overrides: Record<string, unknown> = {}) {
	return {
		Body: {
			stkCallback: {
				MerchantRequestID: 'm-1',
				CheckoutRequestID: 'ws_CO_1',
				ResultCode: 0,
				ResultDesc: 'The service request is processed successfully.',
				CallbackMetadata: {
					Item: [
						{ Name: 'Amount', Value: 100.0 },
						{ Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
						{ Name: 'PhoneNumber', Value: 254712345678 }
					]
				},
				...overrides
			}
		}
	};
}

async function attemptRow(t: ReturnType<typeof harness>) {
	return await t.run(async (ctx) => {
		return await ctx.db.query('donationAttempts').first();
	});
}

describe('sandbox donations', () => {
	beforeEach(() => {
		setSandboxEnv();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		for (const name of envNames) restoreEnv(name, previous[name]);
	});

	it('rejects drafts and does not credit on accepted STK', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const fundID = await owner.mutation(api.funds.create, draft);
		mockDaraja();
		await expect(
			t.action(api.donations.initiate, {
				fundID,
				amount: 100,
				phone,
				guestSessionId: guest,
				idempotencyKey: 'donate-1-aaaaaaaa'
			})
		).rejects.toThrow(/accepting donations/);

		const { fundID: liveID } = await liveFund(t);
		const started = await t.action(api.donations.initiate, {
			fundID: liveID,
			amount: 100,
			phone,
			guestSessionId: guest,
			idempotencyKey: 'donate-2-aaaaaaaa'
		});
		expect(started.status).toBe('accepted');
		const summary = await t.query(api.donations.fundSummary, { fundID: liveID });
		expect(summary).toMatchObject({ raised: 0, donationCount: 0, testPayments: true });
		const status = await t.query(api.donations.getStatus, { statusKey: started.statusKey });
		expect(status).toMatchObject({ status: 'accepted', amount: 100 });
		expect(JSON.stringify(status)).not.toMatch(/254712345678|tok|test-passkey/);
	});

	it('sends the documented sandbox STK payload and reuses oauth tokens', async () => {
		const t = harness();
		const { fundID } = await liveFund(t);
		const calls = mockDaraja();
		await t.action(api.donations.initiate, {
			fundID,
			amount: 500,
			phone: '0712345678',
			guestSessionId: guest,
			idempotencyKey: 'donate-3-aaaaaaaa'
		});
		await t.action(api.donations.initiate, {
			fundID,
			amount: 500,
			phone: '0722000000',
			guestSessionId: 'cd'.repeat(16),
			idempotencyKey: 'donate-3b-aaaaaaa'
		});
		const oauth = calls.filter((call) => call.url.includes('/oauth/v1/generate'));
		const stk = calls.filter((call) => call.url.includes('/stkpush/v1/processrequest'));
		expect(oauth).toHaveLength(1);
		expect(stk).toHaveLength(2);
		const body = JSON.parse(String(stk[0]?.init?.body));
		expect(body.PartyB).toBe('174379');
		expect(body.PartyA).toBe('254712345678');
		expect(body.PhoneNumber).toBe('254712345678');
		expect(body.Amount).toBe(500);
		expect(body.TransactionType).toBe('CustomerPayBillOnline');
		expect(body.CallBackURL).toMatch(/^https:\/\/test\.convex\.site\/mpesa\/stk\/[a-f0-9]{48}$/);
		expect(body.AccountReference).toMatch(/^[A-Za-z0-9]{1,12}$/);
		expect(String(body.TransactionDesc).length).toBeLessThanOrEqual(13);
		expect(stk[0]?.init?.headers).toMatchObject({ Authorization: 'Bearer tok' });
		expect(JSON.stringify(body)).not.toContain('test-secret');
	});

	it('credits success once, ignores a late failure, and hides private fields', async () => {
		const t = harness();
		const { fundID } = await liveFund(t);
		mockDaraja();
		const started = await t.action(api.donations.initiate, {
			fundID,
			amount: 100,
			phone,
			guestSessionId: guest,
			idempotencyKey: 'donate-4-aaaaaaaa'
		});
		const row = await attemptRow(t);
		expect(row?.phone).toBe(phone);
		const path = `/mpesa/stk/${row!.callbackKey}`;
		const ok = await t.fetch(path, { method: 'POST', body: JSON.stringify(successBody()) });
		expect(ok.status).toBe(200);
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 100, donationCount: 1 });
		const again = await t.fetch(path, { method: 'POST', body: JSON.stringify(successBody()) });
		expect(again.status).toBe(200);
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 100, donationCount: 1 });
		const lateFail = await t.fetch(path, {
			method: 'POST',
			body: JSON.stringify({
				Body: {
					stkCallback: {
						MerchantRequestID: 'm-1',
						CheckoutRequestID: 'ws_CO_1',
						ResultCode: 1032,
						ResultDesc: 'Request cancelled by user'
					}
				}
			})
		});
		expect(lateFail.status).toBe(200);
		expect(await t.query(api.donations.getStatus, { statusKey: started.statusKey })).toMatchObject({
			status: 'succeeded'
		});
		const list = await t.query(api.donations.listDonations, {
			fundID,
			paginationOpts: { numItems: 10, cursor: null }
		});
		expect(list.page).toEqual([
			expect.objectContaining({ amount: 100, testPayment: true })
		]);
		expect(JSON.stringify(list)).not.toMatch(/254712345678|callbackKey|statusKey/);
	});

	it('records cancellation, failure, and mismatched metadata without crediting', async () => {
		const t = harness();
		const { fundID } = await liveFund(t);
		mockDaraja();
		await t.action(api.donations.initiate, {
			fundID,
			amount: 100,
			phone,
			guestSessionId: guest,
			idempotencyKey: 'donate-5-aaaaaaaa'
		});
		const row = await attemptRow(t);
		const cancelled = await t.fetch(`/mpesa/stk/${row!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify({
				Body: {
					stkCallback: {
						MerchantRequestID: 'm-1',
						CheckoutRequestID: 'ws_CO_1',
						ResultCode: 1032,
						ResultDesc: 'Request cancelled by user'
					}
				}
			})
		});
		expect(cancelled.status).toBe(200);
		expect(await t.query(api.donations.getStatus, { statusKey: row!.statusKey })).toMatchObject({
			status: 'cancelled'
		});
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 0 });

		const t2 = harness();
		const live2 = await liveFund(t2);
		mockDaraja();
		await t2.action(api.donations.initiate, {
			fundID: live2.fundID,
			amount: 100,
			phone,
			guestSessionId: guest,
			idempotencyKey: 'donate-6-aaaaaaaa'
		});
		const row2 = await t2.run(async (ctx) => ctx.db.query('donationAttempts').first());
		await t2.fetch(`/mpesa/stk/${row2!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify(successBody({
				CallbackMetadata: {
					Item: [
						{ Name: 'Amount', Value: 999 },
						{ Name: 'PhoneNumber', Value: 254712345678 },
						{ Name: 'MpesaReceiptNumber', Value: 'X' }
					]
				}
			} as never))
		});
		expect(await t2.query(api.donations.fundSummary, { fundID: live2.fundID })).toMatchObject({ raised: 0 });
		expect(await t2.query(api.donations.getStatus, { statusKey: row2!.statusKey })).toMatchObject({
			status: 'failed'
		});
	});

	it('applies an early callback before the initiation response is stored', async () => {
		const t = harness();
		const { fundID } = await liveFund(t);
		const started = await t.mutation(internal.donations.beginAttempt, {
			fundID,
			amount: 100,
			phone,
			guestSessionId: guest,
			idempotencyKey: 'donate-7-aaaaaaaa',
			environment: 'sandbox'
		});
		expect(started.status).toBe('pending');
		const row = await attemptRow(t);
		await t.fetch(`/mpesa/stk/${row!.callbackKey}`, { method: 'POST', body: JSON.stringify(successBody()) });
		expect(await t.query(api.donations.getStatus, { statusKey: started.statusKey })).toMatchObject({
			status: 'succeeded'
		});
		await t.mutation(internal.donations.acceptAttempt, {
			attemptId: started.attemptId,
			merchantRequestId: 'm-1',
			checkoutRequestId: 'ws_CO_1'
		});
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 100, donationCount: 1 });
		expect(await t.query(api.donations.getStatus, { statusKey: started.statusKey })).toMatchObject({
			status: 'succeeded'
		});
	});

	it('replays duplicate submissions without a second STK and rate-limits a phone', async () => {
		const t = harness();
		const { fundID } = await liveFund(t);
		const calls = mockDaraja();
		const args = {
			fundID,
			amount: 100,
			phone,
			guestSessionId: guest,
			idempotencyKey: 'donate-8-aaaaaaaa'
		};
		const first = await t.action(api.donations.initiate, args);
		const second = await t.action(api.donations.initiate, args);
		expect(second.statusKey).toBe(first.statusKey);
		expect(calls.filter((call) => call.url.includes('/stkpush')).length).toBe(1);
		await expect(
			t.action(api.donations.initiate, { ...args, idempotencyKey: 'donate-8b-aaaaaaa' })
		).rejects.toThrow(/Wait a minute/);
		await expect(
			t.action(api.donations.initiate, {
				...args,
				amount: 200,
				idempotencyKey: 'donate-8-aaaaaaaa'
			})
		).rejects.toThrow(/Invalid request/);
	});

	it('keeps unknown timeouts pending and blocks private status access', async () => {
		const t = harness();
		const { fundID } = await liveFund(t);
		mockDaraja(async (url) => {
			if (url.includes('/oauth/v1/generate')) {
				return Response.json({ access_token: 'tok', expires_in: 3599 });
			}
			const error = new Error('timeout');
			error.name = 'TimeoutError';
			throw error;
		});
		const started = await t.action(api.donations.initiate, {
			fundID,
			amount: 100,
			phone,
			guestSessionId: guest,
			idempotencyKey: 'donate-9-aaaaaaaa'
		});
		expect(started.status).toBe('unknown');
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 0 });
		expect(await t.query(api.donations.getStatus, { statusKey: 'ff'.repeat(16) })).toBeNull();
		expect(await t.query(api.donations.getStatus, { statusKey: 'nope' })).toBeNull();
		const row = await attemptRow(t);
		expect(row?.status).toBe('unknown');
		expect((await t.fetch('/mpesa/stk/nope', { method: 'POST', body: '{}' })).status).toBe(404);
	});

	it('rejects non-zero ResponseCode as not paid and malformed callbacks', async () => {
		const t = harness();
		const { fundID } = await liveFund(t);
		mockDaraja(async (url) => {
			if (url.includes('/oauth/v1/generate')) return Response.json({ access_token: 'tok', expires_in: 3599 });
			return Response.json({
				MerchantRequestID: 'm-1',
				CheckoutRequestID: 'ws_CO_1',
				ResponseCode: '1',
				ResponseDescription: 'rejected'
			});
		});
		await expect(
			t.action(api.donations.initiate, {
				fundID,
				amount: 100,
				phone,
				guestSessionId: guest,
				idempotencyKey: 'donate-10-aaaaaaa'
			})
		).rejects.toThrow(/prompt/);
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 0 });
		expect((await t.fetch('/mpesa/stk/aa'.concat('bb'.repeat(15)), { method: 'POST', body: 'not-json' })).status).toBe(
			400
		);
	});
});
