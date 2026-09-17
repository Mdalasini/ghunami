import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
	action,
	internalMutation,
	internalQuery,
	query,
	type ActionCtx,
	type MutationCtx,
	type QueryCtx
} from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';
import { isFundID } from './lib/fundId';
import {
	DONATE_PRESETS,
	GUEST_WINDOW_MAX,
	GUEST_WINDOW_MS,
	MPESA_MAX_AMOUNT,
	MPESA_MIN_AMOUNT,
	PHONE_WINDOW_MAX,
	PHONE_WINDOW_MS,
	STK_COOLDOWN_MS,
	TOKEN_REFRESH_SKEW_MS,
	amountsMatch,
	buildStkPushBody,
	mpesaConfigOrNull,
	oauthBasic,
	parseCallbackKey,
	parseDonateAmount,
	parseDonateDisplayName,
	parseDonateIdempotencyKey,
	parseGuestSessionId,
	parseMpesaConfig,
	parseResultCode,
	parseStatusKey,
	randomHex,
	normalizeKenyanMsisdn,
	type AttemptStatus,
	type MpesaConfig
} from './lib/mpesa';

const environmentValidator = v.union(v.literal('sandbox'), v.literal('production'));
const statusValidator = v.union(
	v.literal('pending'),
	v.literal('accepted'),
	v.literal('unknown'),
	v.literal('succeeded'),
	v.literal('cancelled'),
	v.literal('failed')
);

const publicStatus = v.object({
	status: statusValidator,
	amount: v.number(),
	currency: v.literal('KES'),
	environment: environmentValidator
});

const donationItem = v.object({
	_id: v.id('donationAttempts'),
	amount: v.number(),
	createdAt: v.number(),
	displayName: v.union(v.string(), v.null()),
	environment: environmentValidator,
	testPayment: v.boolean()
});

async function fundByPublicId(ctx: QueryCtx | MutationCtx, fundID: string) {
	if (!isFundID(fundID)) return null;
	return await ctx.db
		.query('funds')
		.withIndex('by_fundID', (q) => q.eq('fundID', fundID))
		.unique();
}

async function canSeeFund(ctx: QueryCtx, fund: Doc<'funds'> | null) {
	if (!fund) return false;
	if (fund.status === 'live') return true;
	const user = await getCurrentUserOrNull(ctx);
	return user !== null && fund.ownerId === user._id;
}

function raisedFor(fund: Doc<'funds'>, environment: 'sandbox' | 'production') {
	if (environment === 'sandbox') {
		return {
			raised: fund.sandboxRaised ?? 0,
			donationCount: fund.sandboxDonationCount ?? 0
		};
	}
	return {
		raised: fund.liveRaised ?? 0,
		donationCount: fund.liveDonationCount ?? 0
	};
}

function publicAttempt(attempt: Doc<'donationAttempts'>) {
	return {
		status: attempt.status,
		amount: attempt.amount,
		currency: 'KES' as const,
		environment: attempt.environment
	};
}

export const publicConfig = query({
	args: {},
	returns: v.object({
		donateEnabled: v.boolean(),
		environment: v.union(v.literal('sandbox'), v.literal('unconfigured'), v.literal('blocked')),
		minAmount: v.number(),
		maxAmount: v.number(),
		presets: v.array(v.number()),
		reason: v.union(v.string(), v.null())
	}),
	handler: async () => {
		try {
			parseMpesaConfig();
			return {
				donateEnabled: true,
				environment: 'sandbox' as const,
				minAmount: MPESA_MIN_AMOUNT,
				maxAmount: MPESA_MAX_AMOUNT,
				presets: [...DONATE_PRESETS],
				reason: null
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Donations aren’t configured.';
			const blocked = /Production M-PESA is blocked/.test(message);
			return {
				donateEnabled: false,
				environment: blocked ? ('blocked' as const) : ('unconfigured' as const),
				minAmount: MPESA_MIN_AMOUNT,
				maxAmount: MPESA_MAX_AMOUNT,
				presets: [...DONATE_PRESETS],
				reason: blocked ? 'Donations aren’t available yet.' : 'Donations aren’t available yet.'
			};
		}
	}
});

export const fundSummary = query({
	args: { fundID: v.string() },
	returns: v.union(
		v.object({
			raised: v.number(),
			donationCount: v.number(),
			environment: v.union(v.literal('sandbox'), v.literal('production')),
			testPayments: v.boolean()
		}),
		v.null()
	),
	handler: async (ctx, args) => {
		const fund = await fundByPublicId(ctx, args.fundID);
		if (!(await canSeeFund(ctx, fund)) || !fund) return null;
		const environment = mpesaConfigOrNull()?.environment ?? 'sandbox';
		const totals = raisedFor(fund, environment);
		return {
			...totals,
			environment,
			testPayments: environment === 'sandbox'
		};
	}
});

export const listDonations = query({
	args: {
		fundID: v.string(),
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		page: v.array(donationItem),
		isDone: v.boolean(),
		continueCursor: v.string()
	}),
	handler: async (ctx, args) => {
		const fund = await fundByPublicId(ctx, args.fundID);
		if (!(await canSeeFund(ctx, fund)) || !fund) {
			return { page: [], isDone: true, continueCursor: '' };
		}
		const environment = mpesaConfigOrNull()?.environment ?? 'sandbox';
		const result = await ctx.db
			.query('donationAttempts')
			.withIndex('by_fund_env_status_created', (q) =>
				q.eq('fundDocId', fund._id).eq('environment', environment).eq('status', 'succeeded')
			)
			.order('desc')
			.paginate(args.paginationOpts);
		return {
			page: result.page.map((row) => ({
				_id: row._id,
				amount: row.amount,
				createdAt: row.createdAt,
				displayName: row.displayName ?? null,
				environment: row.environment,
				testPayment: row.environment === 'sandbox'
			})),
			isDone: result.isDone,
			continueCursor: result.continueCursor
		};
	}
});

export const getStatus = query({
	args: { statusKey: v.string() },
	returns: v.union(publicStatus, v.null()),
	handler: async (ctx, args) => {
		try {
			parseStatusKey(args.statusKey);
		} catch {
			return null;
		}
		const attempt = await ctx.db
			.query('donationAttempts')
			.withIndex('by_statusKey', (q) => q.eq('statusKey', args.statusKey))
			.unique();
		if (!attempt) return null;
		return publicAttempt(attempt);
	}
});

export const getCachedToken = internalQuery({
	args: { environment: v.string(), now: v.number() },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('mpesaOAuth')
			.withIndex('by_environment', (q) => q.eq('environment', args.environment))
			.unique();
		if (!row || row.expiresAt <= args.now + TOKEN_REFRESH_SKEW_MS) return null;
		return row.accessToken;
	}
});

export const storeToken = internalMutation({
	args: {
		environment: v.string(),
		accessToken: v.string(),
		expiresAt: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('mpesaOAuth')
			.withIndex('by_environment', (q) => q.eq('environment', args.environment))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				accessToken: args.accessToken,
				expiresAt: args.expiresAt
			});
		} else {
			await ctx.db.insert('mpesaOAuth', args);
		}
		return null;
	}
});

export const beginAttempt = internalMutation({
	args: {
		fundID: v.string(),
		amount: v.number(),
		phone: v.string(),
		guestSessionId: v.string(),
		idempotencyKey: v.string(),
		environment: environmentValidator,
		displayName: v.optional(v.string())
	},
	returns: v.object({
		attemptId: v.id('donationAttempts'),
		statusKey: v.string(),
		callbackKey: v.string(),
		status: statusValidator,
		replay: v.boolean()
	}),
	handler: async (ctx, args) => {
		const amount = parseDonateAmount(args.amount);
		const phone = normalizeKenyanMsisdn(args.phone);
		const guestSessionId = parseGuestSessionId(args.guestSessionId);
		const idempotencyKey = parseDonateIdempotencyKey(args.idempotencyKey);
		const displayName = parseDonateDisplayName(args.displayName);
		const fund = await fundByPublicId(ctx, args.fundID);
		if (!fund || fund.status !== 'live') {
			throw new Error('This fund isn’t accepting donations.');
		}

		const existing = await ctx.db
			.query('donationAttempts')
			.withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', idempotencyKey))
			.unique();
		if (existing) {
			if (
				existing.fundDocId !== fund._id ||
				existing.amount !== amount ||
				existing.phone !== phone ||
				existing.environment !== args.environment ||
				(existing.displayName ?? undefined) !== displayName
			) {
				throw new Error('Invalid request. Try again.');
			}
			return {
				attemptId: existing._id,
				statusKey: existing.statusKey,
				callbackKey: existing.callbackKey,
				status: existing.status,
				replay: true
			};
		}

		const now = Date.now();
		await assertRateLimits(ctx, phone, guestSessionId, now);

		const user = await getCurrentUserOrNull(ctx);
		const statusKey = randomHex(24);
		const callbackKey = randomHex(24);
		const attemptId = await ctx.db.insert('donationAttempts', {
			fundDocId: fund._id,
			fundID: fund.fundID,
			amount,
			currency: 'KES',
			environment: args.environment,
			phone,
			guestSessionId,
			userId: user?._id,
			...(displayName ? { displayName } : {}),
			status: 'pending',
			credited: false,
			idempotencyKey,
			statusKey,
			callbackKey,
			createdAt: now,
			updatedAt: now
		});
		return { attemptId, statusKey, callbackKey, status: 'pending' as const, replay: false };
	}
});

async function assertRateLimits(
	ctx: MutationCtx,
	phone: string,
	guestSessionId: string,
	now: number
) {
	const recentPhone = await ctx.db
		.query('donationAttempts')
		.withIndex('by_phone_created', (q) => q.eq('phone', phone).gte('createdAt', now - PHONE_WINDOW_MS))
		.order('desc')
		.take(PHONE_WINDOW_MAX + 1);
	const newestPhone = recentPhone[0];
	if (newestPhone && now - newestPhone.createdAt < STK_COOLDOWN_MS) {
		throw new Error('Wait a minute before sending another prompt to this number.');
	}
	if (recentPhone.length >= PHONE_WINDOW_MAX) {
		throw new Error('Too many attempts for this number. Try again later.');
	}

	const recentGuest = await ctx.db
		.query('donationAttempts')
		.withIndex('by_guest_created', (q) =>
			q.eq('guestSessionId', guestSessionId).gte('createdAt', now - GUEST_WINDOW_MS)
		)
		.order('desc')
		.take(GUEST_WINDOW_MAX + 1);
	const newestGuest = recentGuest[0];
	if (newestGuest && now - newestGuest.createdAt < STK_COOLDOWN_MS) {
		throw new Error('Wait a minute before trying another donation.');
	}
	if (recentGuest.length >= GUEST_WINDOW_MAX) {
		throw new Error('Too many attempts. Try again later.');
	}
}

export const acceptAttempt = internalMutation({
	args: {
		attemptId: v.id('donationAttempts'),
		merchantRequestId: v.string(),
		checkoutRequestId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt) return null;
		if (attempt.status === 'succeeded') {
			await ctx.db.patch(attempt._id, {
				merchantRequestId: attempt.merchantRequestId ?? args.merchantRequestId,
				checkoutRequestId: attempt.checkoutRequestId ?? args.checkoutRequestId,
				updatedAt: Date.now()
			});
			return null;
		}
		if (attempt.status === 'cancelled' || attempt.status === 'failed') {
			await ctx.db.patch(attempt._id, {
				merchantRequestId: attempt.merchantRequestId ?? args.merchantRequestId,
				checkoutRequestId: attempt.checkoutRequestId ?? args.checkoutRequestId,
				updatedAt: Date.now()
			});
			return null;
		}
		await ctx.db.patch(attempt._id, {
			status: attempt.status === 'unknown' ? 'unknown' : 'accepted',
			merchantRequestId: args.merchantRequestId,
			checkoutRequestId: args.checkoutRequestId,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const failAttempt = internalMutation({
	args: {
		attemptId: v.id('donationAttempts'),
		resultDesc: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt || attempt.status === 'succeeded') return null;
		if (attempt.status === 'cancelled' || attempt.status === 'failed') return null;
		await ctx.db.patch(attempt._id, {
			status: 'failed',
			resultDesc: args.resultDesc,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const markUnknown = internalMutation({
	args: { attemptId: v.id('donationAttempts') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt) return null;
		if (attempt.status === 'succeeded' || attempt.status === 'cancelled' || attempt.status === 'failed') {
			return null;
		}
		await ctx.db.patch(attempt._id, { status: 'unknown', updatedAt: Date.now() });
		return null;
	}
});

export const applyCallback = internalMutation({
	args: {
		callbackKey: v.string(),
		merchantRequestId: v.string(),
		checkoutRequestId: v.string(),
		resultCode: v.number(),
		resultDesc: v.optional(v.string()),
		amount: v.optional(v.number()),
		phone: v.optional(v.string()),
		receipt: v.optional(v.string())
	},
	returns: v.object({
		applied: v.boolean(),
		status: v.union(statusValidator, v.null())
	}),
	handler: async (ctx, args): Promise<{ applied: boolean; status: AttemptStatus | null }> => {
		const callbackKey = parseCallbackKey(args.callbackKey);
		if (!callbackKey) return { applied: false, status: null };
		const attempt = await ctx.db
			.query('donationAttempts')
			.withIndex('by_callbackKey', (q) => q.eq('callbackKey', callbackKey))
			.unique();
		if (!attempt) return { applied: false, status: null };

		if (attempt.status === 'succeeded') {
			return { applied: true, status: attempt.status };
		}

		const now = Date.now();
		const ids = {
			merchantRequestId: attempt.merchantRequestId ?? args.merchantRequestId,
			checkoutRequestId: attempt.checkoutRequestId ?? args.checkoutRequestId
		};

		if (args.resultCode === 0) {
			if (args.amount === undefined || !amountsMatch(attempt.amount, args.amount)) {
				await ctx.db.patch(attempt._id, {
					...ids,
					status: 'failed',
					resultCode: args.resultCode,
					resultDesc: 'Callback amount did not match.',
					updatedAt: now
				});
				return { applied: true, status: 'failed' };
			}
			if (!args.phone || args.phone !== attempt.phone) {
				await ctx.db.patch(attempt._id, {
					...ids,
					status: 'failed',
					resultCode: args.resultCode,
					resultDesc: 'Callback phone did not match.',
					updatedAt: now
				});
				return { applied: true, status: 'failed' };
			}
			if (!attempt.credited) {
				await creditFund(ctx, attempt);
			}
			await ctx.db.patch(attempt._id, {
				...ids,
				status: 'succeeded',
				credited: true,
				resultCode: 0,
				resultDesc: args.resultDesc,
				receipt: args.receipt,
				updatedAt: now
			});
			return { applied: true, status: 'succeeded' };
		}

		const status: AttemptStatus = args.resultCode === 1032 ? 'cancelled' : 'failed';
		await ctx.db.patch(attempt._id, {
			...ids,
			status,
			resultCode: args.resultCode,
			resultDesc: args.resultDesc,
			updatedAt: now
		});
		return { applied: true, status };
	}
});

async function creditFund(ctx: MutationCtx, attempt: Doc<'donationAttempts'>) {
	const fund = await ctx.db.get(attempt.fundDocId);
	if (!fund) return;
	if (attempt.environment === 'sandbox') {
		await ctx.db.patch(fund._id, {
			sandboxRaised: (fund.sandboxRaised ?? 0) + attempt.amount,
			sandboxDonationCount: (fund.sandboxDonationCount ?? 0) + 1
		});
		return;
	}
	await ctx.db.patch(fund._id, {
		liveRaised: (fund.liveRaised ?? 0) + attempt.amount,
		liveDonationCount: (fund.liveDonationCount ?? 0) + 1
	});
}

const initiateReturn = v.object({
	statusKey: v.string(),
	status: statusValidator,
	amount: v.number(),
	environment: environmentValidator
});

export const initiate = action({
	args: {
		fundID: v.string(),
		amount: v.number(),
		phone: v.string(),
		guestSessionId: v.string(),
		idempotencyKey: v.string(),
		displayName: v.optional(v.string())
	},
	returns: initiateReturn,
	handler: async (ctx, args): Promise<{
		statusKey: string;
		status: AttemptStatus;
		amount: number;
		environment: 'sandbox' | 'production';
	}> => {
		const config = parseMpesaConfig();
		const amount = parseDonateAmount(args.amount);
		const phone = normalizeKenyanMsisdn(args.phone);
		parseGuestSessionId(args.guestSessionId);
		parseDonateIdempotencyKey(args.idempotencyKey);
		const displayName = parseDonateDisplayName(args.displayName);

		const started = await ctx.runMutation(internal.donations.beginAttempt, {
			fundID: args.fundID,
			amount,
			phone,
			guestSessionId: args.guestSessionId,
			idempotencyKey: args.idempotencyKey,
			environment: config.environment,
			...(displayName ? { displayName } : {})
		});

		if (started.replay) {
			return {
				statusKey: started.statusKey,
				status: started.status,
				amount,
				environment: config.environment
			};
		}

		try {
			const token = await oauthToken(ctx, config);
			const body = buildStkPushBody({
				config,
				amount,
				phone,
				callbackKey: started.callbackKey,
				fundID: args.fundID,
				now: Date.now()
			});
			const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(20_000)
			});
			const payload: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				await ctx.runMutation(internal.donations.failAttempt, {
					attemptId: started.attemptId,
					resultDesc: 'Provider rejected the request.'
				});
				throw new Error('Couldn’t start the M-PESA prompt. Try again.');
			}
			const code = parseResultCode(
				payload && typeof payload === 'object' ? (payload as { ResponseCode?: unknown }).ResponseCode : null
			);
			if (code !== 0) {
				await ctx.runMutation(internal.donations.failAttempt, {
					attemptId: started.attemptId,
					resultDesc: 'Provider did not accept the request.'
				});
				throw new Error('Couldn’t start the M-PESA prompt. Try again.');
			}
			const merchantRequestId =
				payload && typeof payload === 'object' && typeof (payload as { MerchantRequestID?: unknown }).MerchantRequestID === 'string'
					? (payload as { MerchantRequestID: string }).MerchantRequestID
					: '';
			const checkoutRequestId =
				payload && typeof payload === 'object' && typeof (payload as { CheckoutRequestID?: unknown }).CheckoutRequestID === 'string'
					? (payload as { CheckoutRequestID: string }).CheckoutRequestID
					: '';
			if (!merchantRequestId || !checkoutRequestId) {
				await ctx.runMutation(internal.donations.markUnknown, { attemptId: started.attemptId });
				return {
					statusKey: started.statusKey,
					status: 'unknown',
					amount,
					environment: config.environment
				};
			}
			await ctx.runMutation(internal.donations.acceptAttempt, {
				attemptId: started.attemptId,
				merchantRequestId,
				checkoutRequestId
			});
			return {
				statusKey: started.statusKey,
				status: 'accepted',
				amount,
				environment: config.environment
			};
		} catch (error) {
			const timeout =
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError' || /abort|network|timeout/i.test(error.message));
			if (timeout) {
				await ctx.runMutation(internal.donations.markUnknown, { attemptId: started.attemptId });
				return {
					statusKey: started.statusKey,
					status: 'unknown',
					amount,
					environment: config.environment
				};
			}
			if (error instanceof Error && error.message.startsWith('Wait ')) throw error;
			if (error instanceof Error && error.message.startsWith('Too many')) throw error;
			if (error instanceof Error && /Couldn’t start the M-PESA prompt/.test(error.message)) {
				await ctx.runMutation(internal.donations.failAttempt, { attemptId: started.attemptId });
				throw error;
			}
			await ctx.runMutation(internal.donations.markUnknown, { attemptId: started.attemptId });
			return {
				statusKey: started.statusKey,
				status: 'unknown',
				amount,
				environment: config.environment
			};
		}
	}
});

async function oauthToken(ctx: { runQuery: ActionCtx['runQuery']; runMutation: ActionCtx['runMutation'] }, config: MpesaConfig): Promise<string> {
	const cached = await ctx.runQuery(internal.donations.getCachedToken, {
		environment: config.environment,
		now: Date.now()
	});
	if (cached) return cached;
	const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
		headers: { Authorization: `Basic ${oauthBasic(config.consumerKey, config.consumerSecret)}` },
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok) throw new Error('Couldn’t start the M-PESA prompt. Try again.');
	const payload: unknown = await response.json().catch(() => null);
	const accessToken =
		payload && typeof payload === 'object' && typeof (payload as { access_token?: unknown }).access_token === 'string'
			? (payload as { access_token: string }).access_token
			: '';
	const expiresIn = parseResultCode(
		payload && typeof payload === 'object' ? (payload as { expires_in?: unknown }).expires_in : null
	);
	if (!accessToken) throw new Error('Couldn’t start the M-PESA prompt. Try again.');
	const ttl = (expiresIn && expiresIn > 0 ? expiresIn : 3599) * 1000;
	await ctx.runMutation(internal.donations.storeToken, {
		environment: config.environment,
		accessToken,
		expiresAt: Date.now() + ttl
	});
	return accessToken;
}
