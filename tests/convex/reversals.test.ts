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

const kofi = {
	issuer: 'https://example.test',
	workosUserId: 'kofi',
	email: 'kofi@example.com',
	firstName: 'Kofi',
	lastName: 'Mensah'
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
const operatorToken = `${maya.issuer}|${maya.workosUserId}`;

const envNames = [
	'MPESA_ENVIRONMENT',
	'MPESA_CONSUMER_KEY',
	'MPESA_CONSUMER_SECRET',
	'MPESA_SHORTCODE',
	'MPESA_PASSKEY',
	'MPESA_TRANSACTION_TYPE',
	'MPESA_STK_ENABLED',
	'MPESA_REVERSAL_INITIATOR',
	'MPESA_REVERSAL_SECURITY_CREDENTIAL',
	'GHUNAMI_OPERATOR_TOKEN_IDENTIFIERS',
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
	process.env.MPESA_STK_ENABLED = 'true';
	process.env.MPESA_REVERSAL_INITIATOR = 'apiop37';
	process.env.MPESA_REVERSAL_SECURITY_CREDENTIAL = 'test-reversal-credential';
	process.env.GHUNAMI_OPERATOR_TOKEN_IDENTIFIERS = operatorToken;
	process.env.CONVEX_SITE_URL = 'https://test.convex.site';
}

async function asUser(t: ReturnType<typeof harness>, person: typeof maya) {
	await t.mutation(internal.users.upsertFromWorkOS, person);
	return t.withIdentity({ subject: person.workosUserId, issuer: person.issuer });
}

async function paidDonation(t: ReturnType<typeof harness>) {
	const owner = await asUser(t, maya);
	const fundID = await owner.mutation(api.funds.create, {
		...draft,
		idempotencyKey: `create-${crypto.randomUUID()}`
	});
	await owner.mutation(api.funds.publish, { fundID });
	await t.action(api.donations.initiate, {
		fundID,
		amount: 100,
		phone,
		guestSessionId: guest,
		idempotencyKey: `donate-${crypto.randomUUID().slice(0, 8)}-aaaa`
	});
	const row = await t.run(async (ctx) => ctx.db.query('donationAttempts').order('desc').first());
	if (!row) throw new Error('missing attempt');
	await t.fetch(`/mpesa/stk/${row.callbackKey}`, {
		method: 'POST',
		body: JSON.stringify({
			Body: {
				stkCallback: {
					MerchantRequestID: 'm-1',
					CheckoutRequestID: 'ws_CO_1',
					ResultCode: 0,
					CallbackMetadata: {
						Item: [
							{ Name: 'Amount', Value: 100.0 },
							{ Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
							{ Name: 'PhoneNumber', Value: 254712345678 }
						]
					}
				}
			}
		})
	});
	return { owner, fundID, row: (await t.run(async (ctx) => ctx.db.get(row._id)))! };
}

function reversalAck() {
	return {
		OriginatorConversationID: 'orig-1',
		ConversationID: 'AG_1',
		ResponseCode: '0',
		ResponseDescription: 'Accept the service request successfully.'
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
			return Response.json({
				MerchantRequestID: 'm-1',
				CheckoutRequestID: 'ws_CO_1',
				ResponseCode: '0'
			});
		}
		if (url.includes('/mpesa/reversal/v1/request')) {
			return Response.json(reversalAck());
		}
		throw new Error(`unexpected fetch ${url}`);
	});
	return calls;
}

function successResult(overrides: Record<string, unknown> = {}) {
	return {
		Result: {
			ResultType: 0,
			ResultCode: 0,
			ResultDesc: 'The service request is processed successfully.',
			OriginatorConversationID: 'orig-1',
			ConversationID: 'AG_1',
			TransactionID: 'SKE52PAWR9',
			ResultParameters: {
				ResultParameter: [
					{ Key: 'Amount', Value: 100.0 },
					{ Key: 'OriginalTransactionID', Value: 'NLJ7RT61SV' }
				]
			},
			...overrides
		}
	};
}

describe('sandbox reversals', () => {
	beforeEach(() => {
		setSandboxEnv();
		mockDaraja();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		for (const name of envNames) restoreEnv(name, previous[name]);
	});

	it('denies fund owners and guests, and hides the operator list', async () => {
		const t = harness();
		const { owner, row } = await paidDonation(t);
		delete process.env.GHUNAMI_OPERATOR_TOKEN_IDENTIFIERS;
		expect(await owner.query(api.reversals.access, {})).toEqual({ operator: false });
		await expect(owner.query(api.reversals.listPayments, { paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow(
			/Not authorized/
		);
		await expect(
			owner.action(api.reversals.initiate, {
				donationAttemptId: row._id,
				reason: 'wrong prompt',
				idempotencyKey: 'rev-1-aaaaaaaa',
				confirm: true
			})
		).rejects.toThrow(/Not authorized/);
		expect(await t.query(api.reversals.access, {})).toEqual({ operator: false });
	});

	it('requires confirmation, reversal credentials, and the original receipt', async () => {
		const t = harness();
		const { owner, row } = await paidDonation(t);
		const operator = await asUser(t, maya);
		await expect(
			operator.action(api.reversals.initiate, {
				donationAttemptId: row._id,
				reason: 'wrong prompt',
				idempotencyKey: 'rev-2-aaaaaaaa',
				confirm: false
			})
		).rejects.toThrow(/Confirm/);
		delete process.env.MPESA_REVERSAL_INITIATOR;
		await expect(
			operator.action(api.reversals.initiate, {
				donationAttemptId: row._id,
				reason: 'wrong prompt',
				idempotencyKey: 'rev-2b-aaaaaaa',
				confirm: true
			})
		).rejects.toThrow(/MPESA_REVERSAL_INITIATOR/);
		process.env.MPESA_REVERSAL_INITIATOR = 'apiop37';
		const started = await t.mutation(internal.donations.beginAttempt, {
			fundID: row.fundID,
			amount: 100,
			phone: '254722000000',
			guestSessionId: 'cd'.repeat(16),
			idempotencyKey: 'donate-unconf-aaaa',
			environment: 'sandbox',
			merchantShortcode: '174379'
		});
		await expect(
			operator.action(api.reversals.initiate, {
				donationAttemptId: started.attemptId,
				reason: 'wrong prompt',
				idempotencyKey: 'rev-2c-aaaaaaa',
				confirm: true
			})
		).rejects.toThrow(/confirmed payments/);
		expect(owner).toBeTruthy();
	});

	it('posts the documented reversal payload using the stored receipt', async () => {
		const t = harness();
		const { row } = await paidDonation(t);
		const calls = mockDaraja();
		const operator = await asUser(t, maya);
		await operator.action(api.reversals.initiate, {
			donationAttemptId: row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-3-aaaaaaaa',
			confirm: true
		});
		const reversal = calls.find((call) => call.url === 'https://sandbox.safaricom.co.ke/mpesa/reversal/v1/request');
		const body = JSON.parse(String(reversal?.init?.body));
		expect(body.CommandID).toBe('TransactionReversal');
		expect(body.TransactionID).toBe('NLJ7RT61SV');
		expect(body.TransactionID).not.toBe(row.checkoutRequestId);
		expect(body.Amount).toBe(100);
		expect(body.ReceiverParty).toBe('174379');
		expect(body.RecieverIdentifierType).toBe('11');
		expect(body.Initiator).toBe('apiop37');
		expect(body.Remarks).toBe('wrong prompt');
		expect(body.ResultURL).toMatch(/^https:\/\/test\.convex\.site\/mpesa\/reversal\/result\/[a-f0-9]{48}$/);
		expect(body.QueueTimeOutURL).toMatch(/^https:\/\/test\.convex\.site\/mpesa\/reversal\/timeout\/[a-f0-9]{48}$/);
		expect(JSON.stringify(body)).not.toContain('test-secret');
		expect(JSON.stringify(body)).not.toContain('test-passkey');
	});

	it('rejects merchant mismatch, concurrent keys, and treats accept as not refunded', async () => {
		const t = harness();
		const { fundID, row } = await paidDonation(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(row._id, { merchantShortcode: '600000' });
		});
		const operator = await asUser(t, maya);
		await expect(
			operator.action(api.reversals.initiate, {
				donationAttemptId: row._id,
				reason: 'wrong prompt',
				idempotencyKey: 'rev-4-aaaaaaaa',
				confirm: true
			})
		).rejects.toThrow(/merchant or environment/);

		const t2 = harness();
		const paid = await paidDonation(t2);
		const op = await asUser(t2, maya);
		const first = await op.action(api.reversals.initiate, {
			donationAttemptId: paid.row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-4b-aaaaaaa',
			confirm: true
		});
		expect(first.status).toBe('accepted');
		expect(await t2.query(api.donations.fundSummary, { fundID: paid.fundID })).toMatchObject({
			raised: 100,
			donationCount: 1
		});
		await expect(
			op.action(api.reversals.initiate, {
				donationAttemptId: paid.row._id,
				reason: 'duplicate try',
				idempotencyKey: 'rev-4c-aaaaaaa',
				confirm: true
			})
		).rejects.toThrow(/already in progress/);
		const replay = await op.action(api.reversals.initiate, {
			donationAttemptId: paid.row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-4b-aaaaaaa',
			confirm: true
		});
		expect(replay.reversalId).toBe(first.reversalId);
		expect(fundID).toBeTruthy();
	});

	it('applies success once, rejects bad capabilities, and handles string codes', async () => {
		const t = harness();
		const { fundID, row } = await paidDonation(t);
		const operator = await asUser(t, maya);
		const started = await operator.action(api.reversals.initiate, {
			donationAttemptId: row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-5-aaaaaaaa',
			confirm: true
		});
		const reversal = await t.run(async (ctx) => ctx.db.query('reversalAttempts').first());
		const ok = await t.fetch(`/mpesa/reversal/result/${reversal!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify(successResult({ ResultCode: '0' }))
		});
		expect(ok.status).toBe(200);
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 0, donationCount: 0 });
		expect(await t.query(api.donations.getStatus, { statusKey: row.statusKey })).toMatchObject({
			status: 'succeeded',
			reversed: true
		});
		const again = await t.fetch(`/mpesa/reversal/result/${reversal!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify(successResult())
		});
		expect(again.status).toBe(200);
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 0, donationCount: 0 });
		const list = await t.query(api.donations.listDonations, {
			fundID,
			paginationOpts: { numItems: 10, cursor: null }
		});
		expect(list.page).toEqual([]);
		expect((await t.fetch('/mpesa/reversal/result/nope', { method: 'POST', body: '{}' })).status).toBe(404);
		expect(
			(await t.fetch(`/mpesa/reversal/result/${'ff'.repeat(16)}`, { method: 'POST', body: JSON.stringify(successResult()) }))
				.status
		).toBe(200);
		const viewed = await operator.query(api.reversals.getReversal, { reversalId: started.reversalId });
		expect(viewed).toMatchObject({ status: 'succeeded', receipt: 'NLJ7RT61SV', reversalReceipt: 'SKE52PAWR9' });
		expect(JSON.stringify(await t.query(api.donations.listDonations, { fundID, paginationOpts: { numItems: 10, cursor: null } }))).not.toMatch(
			/254712|wrong prompt|SKE52PAWR9|test-reversal/
		);
		const outsider = await asUser(t, kofi);
		await expect(outsider.query(api.reversals.getReversal, { reversalId: started.reversalId })).rejects.toThrow(
			/Not authorized/
		);
	});

	it('quarantines metadata mismatch and keeps R000001 as review, not a local debit', async () => {
		const t = harness();
		const { fundID, row } = await paidDonation(t);
		const operator = await asUser(t, maya);
		await operator.action(api.reversals.initiate, {
			donationAttemptId: row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-6-aaaaaaaa',
			confirm: true
		});
		const reversal = await t.run(async (ctx) => ctx.db.query('reversalAttempts').first());
		await t.fetch(`/mpesa/reversal/result/${reversal!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify(
				successResult({
					ResultParameters: {
						ResultParameter: [
							{ Key: 'Amount', Value: 50 },
							{ Key: 'OriginalTransactionID', Value: 'OTHER' }
						]
					}
				})
			)
		});
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 100 });
		expect((await t.run(async (ctx) => ctx.db.query('reversalAttempts').first()))?.reviewRequired).toBe(true);

		const t2 = harness();
		const paid = await paidDonation(t2);
		const op = await asUser(t2, maya);
		await op.action(api.reversals.initiate, {
			donationAttemptId: paid.row._id,
			reason: 'already reversed',
			idempotencyKey: 'rev-6b-aaaaaaa',
			confirm: true
		});
		const r2 = await t2.run(async (ctx) => ctx.db.query('reversalAttempts').first());
		await t2.fetch(`/mpesa/reversal/result/${r2!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify({
				Result: {
					ResultType: 0,
					ResultCode: 'R000001',
					ResultDesc: 'The transaction has already been reversed',
					OriginatorConversationID: 'orig-1',
					ConversationID: 'AG_1',
					TransactionID: 'SKE0000000'
				}
			})
		});
		expect(await t2.query(api.donations.fundSummary, { fundID: paid.fundID })).toMatchObject({ raised: 100 });
		expect((await t2.run(async (ctx) => ctx.db.query('reversalAttempts').first()))?.status).toBe('unknown');
		await expect(
			op.action(api.reversals.initiate, {
				donationAttemptId: paid.row._id,
				reason: 'try again',
				idempotencyKey: 'rev-6c-aaaaaaa',
				confirm: true
			})
		).rejects.toThrow(/already in progress/);
	});

	it('applies early, duplicate, late, timeout, failure, and late STK without re-credit', async () => {
		const t = harness();
		const { fundID, row } = await paidDonation(t);
		const operator = await asUser(t, maya);
		const begun = await t.mutation(internal.reversals.beginReversal, {
			donationAttemptId: row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-7-aaaaaaaa',
			environment: 'sandbox',
			merchantShortcode: '174379',
			operatorUserId: (await t.run(async (ctx) => ctx.db.query('users').first()))!._id,
			operatorTokenIdentifier: operatorToken
		});
		await t.fetch(`/mpesa/reversal/result/${begun.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify(successResult())
		});
		expect(await t.query(api.donations.fundSummary, { fundID })).toMatchObject({ raised: 0 });
		await t.mutation(internal.reversals.acceptReversal, {
			reversalId: begun.reversalId,
			originatorConversationId: 'orig-1',
			conversationId: 'AG_1'
		});
		expect((await operator.query(api.reversals.getReversal, { reversalId: begun.reversalId }))?.status).toBe(
			'succeeded'
		);

		const t2 = harness();
		const paid = await paidDonation(t2);
		const op = await asUser(t2, maya);
		const started = await op.action(api.reversals.initiate, {
			donationAttemptId: paid.row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-7b-aaaaaaa',
			confirm: true
		});
		const r2 = await t2.run(async (ctx) => ctx.db.query('reversalAttempts').first());
		expect(
			(await t2.fetch(`/mpesa/reversal/timeout/${r2!.timeoutKey}`, { method: 'POST', body: '{}' })).status
		).toBe(200);
		expect((await op.query(api.reversals.getReversal, { reversalId: started.reversalId }))?.status).toBe('unknown');
		await t2.fetch(`/mpesa/reversal/result/${r2!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify(successResult())
		});
		expect(await t2.query(api.donations.fundSummary, { fundID: paid.fundID })).toMatchObject({ raised: 0 });
		await t2.fetch(`/mpesa/stk/${paid.row.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify({
				Body: {
					stkCallback: {
						MerchantRequestID: 'm-1',
						CheckoutRequestID: 'ws_CO_1',
						ResultCode: 0,
						CallbackMetadata: {
							Item: [
								{ Name: 'Amount', Value: 100.0 },
								{ Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
								{ Name: 'PhoneNumber', Value: 254712345678 }
							]
						}
					}
				}
			})
		});
		expect(await t2.query(api.donations.fundSummary, { fundID: paid.fundID })).toMatchObject({ raised: 0 });

		const t3 = harness();
		const paid3 = await paidDonation(t3);
		const op3 = await asUser(t3, maya);
		await op3.action(api.reversals.initiate, {
			donationAttemptId: paid3.row._id,
			reason: 'invalid',
			idempotencyKey: 'rev-7c-aaaaaaa',
			confirm: true
		});
		const r3 = await t3.run(async (ctx) => ctx.db.query('reversalAttempts').first());
		await t3.fetch(`/mpesa/reversal/result/${r3!.callbackKey}`, {
			method: 'POST',
			body: JSON.stringify({
				Result: {
					ResultType: 0,
					ResultCode: 'R000002',
					ResultDesc: 'The OriginalTransactionID is invalid.',
					OriginatorConversationID: 'orig-1',
					ConversationID: 'AG_1',
					TransactionID: 'SKE0000000'
				}
			})
		});
		expect((await t3.run(async (ctx) => ctx.db.query('reversalAttempts').first()))?.status).toBe('failed');
		expect(await t3.query(api.donations.fundSummary, { fundID: paid3.fundID })).toMatchObject({ raised: 100 });

		const t4 = harness();
		mockDaraja(async (url) => {
			if (url.includes('/oauth/v1/generate')) return Response.json({ access_token: 'tok', expires_in: 3599 });
			if (url.includes('/stkpush')) {
				return Response.json({ MerchantRequestID: 'm-1', CheckoutRequestID: 'ws_CO_1', ResponseCode: '0' });
			}
			const error = new Error('timeout');
			error.name = 'TimeoutError';
			throw error;
		});
		const paid4 = await paidDonation(t4);
		const op4 = await asUser(t4, maya);
		const timed = await op4.action(api.reversals.initiate, {
			donationAttemptId: paid4.row._id,
			reason: 'wrong prompt',
			idempotencyKey: 'rev-7d-aaaaaaa',
			confirm: true
		});
		expect(timed.status).toBe('unknown');
		expect(await t4.query(api.donations.fundSummary, { fundID: paid4.fundID })).toMatchObject({ raised: 100 });
	});

	it('rejects legacy records without merchant provenance and masks operator phones', async () => {
		const t = harness();
		const { row } = await paidDonation(t);
		await t.run(async (ctx) => {
			await ctx.db.patch(row._id, { merchantShortcode: undefined });
		});
		const operator = await asUser(t, maya);
		await expect(
			operator.action(api.reversals.initiate, {
				donationAttemptId: row._id,
				reason: 'wrong prompt',
				idempotencyKey: 'rev-8-aaaaaaaa',
				confirm: true
			})
		).rejects.toThrow(/missing merchant records/);
		const listed = await operator.query(api.reversals.listPayments, {
			paginationOpts: { numItems: 10, cursor: null }
		});
		expect(JSON.stringify(listed)).not.toMatch(/254712345678/);
		expect(listed.page[0]?.maskedPhone).toMatch(/\*\*\*/);
	});
});
