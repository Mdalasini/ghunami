import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
	action,
	internalMutation,
	internalQuery,
	query,
	type ActionCtx,
	type MutationCtx
} from './_generated/server';
import { requireOperator } from './lib/operators';
import {
	REVERSAL_COOLDOWN_MS,
	REVERSAL_WINDOW_MAX,
	REVERSAL_WINDOW_MS,
	amountsMatch,
	buildReversalBody,
	isAlreadyReversedCode,
	isReversalSuccessCode,
	maskMsisdn,
	parseCallbackKey,
	parseDonateIdempotencyKey,
	parseReversalConfig,
	parseReversalReason,
	parseResultCode,
	randomHex,
	requestOAuthToken,
	type ReversalConfig,
	type ReversalStatus
} from './lib/mpesa';

const environmentValidator = v.union(v.literal('sandbox'), v.literal('production'));
const reversalStatusValidator = v.union(
	v.literal('pending'),
	v.literal('accepted'),
	v.literal('unknown'),
	v.literal('succeeded'),
	v.literal('failed')
);

const operatorPayment = v.object({
	attemptId: v.id('donationAttempts'),
	fundID: v.string(),
	fundTitle: v.string(),
	amount: v.number(),
	environment: environmentValidator,
	createdAt: v.number(),
	receipt: v.string(),
	maskedPhone: v.string(),
	reversed: v.boolean(),
	reversalStatus: v.union(reversalStatusValidator, v.null()),
	reviewRequired: v.boolean()
});

const operatorReversal = v.object({
	reversalId: v.id('reversalAttempts'),
	attemptId: v.id('donationAttempts'),
	status: reversalStatusValidator,
	amount: v.number(),
	environment: environmentValidator,
	receipt: v.string(),
	reversalReceipt: v.union(v.string(), v.null()),
	reason: v.string(),
	reviewRequired: v.boolean(),
	resultDesc: v.union(v.string(), v.null())
});

export const access = query({
	args: {},
	returns: v.object({ operator: v.boolean() }),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return { operator: false };
		try {
			await requireOperator(ctx);
			return { operator: true };
		} catch {
			return { operator: false };
		}
	}
});

export const listPayments = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		page: v.array(operatorPayment),
		isDone: v.boolean(),
		continueCursor: v.string()
	}),
	handler: async (ctx, args) => {
		await requireOperator(ctx);
		const result = await ctx.db.query('donationAttempts').order('desc').paginate(args.paginationOpts);
		const page = [];
		for (const row of result.page) {
			if (row.status !== 'succeeded' || !row.receipt) continue;
			const fund = await ctx.db.get(row.fundDocId);
			const reversal = row.activeReversalId ? await ctx.db.get(row.activeReversalId) : null;
			page.push({
				attemptId: row._id,
				fundID: row.fundID,
				fundTitle: fund?.title ?? row.fundID,
				amount: row.amount,
				environment: row.environment,
				createdAt: row.createdAt,
				receipt: row.receipt,
				maskedPhone: maskMsisdn(row.phone),
				reversed: row.reversed === true,
				reversalStatus: reversal?.status ?? (row.reversed ? ('succeeded' as const) : null),
				reviewRequired: reversal?.reviewRequired === true
			});
		}
		return { page, isDone: result.isDone, continueCursor: result.continueCursor };
	}
});

export const getReversal = query({
	args: { reversalId: v.id('reversalAttempts') },
	returns: v.union(operatorReversal, v.null()),
	handler: async (ctx, args) => {
		await requireOperator(ctx);
		const row = await ctx.db.get(args.reversalId);
		if (!row) return null;
		return {
			reversalId: row._id,
			attemptId: row.donationAttemptId,
			status: row.status,
			amount: row.amount,
			environment: row.environment,
			receipt: row.originalReceipt,
			reversalReceipt: row.reversalReceipt ?? null,
			reason: row.reason,
			reviewRequired: row.reviewRequired === true,
			resultDesc: row.resultDesc ?? null
		};
	}
});

export const beginReversal = internalMutation({
	args: {
		donationAttemptId: v.id('donationAttempts'),
		reason: v.string(),
		idempotencyKey: v.string(),
		environment: environmentValidator,
		merchantShortcode: v.string(),
		operatorUserId: v.id('users'),
		operatorTokenIdentifier: v.string()
	},
	returns: v.object({
		reversalId: v.id('reversalAttempts'),
		callbackKey: v.string(),
		timeoutKey: v.string(),
		status: reversalStatusValidator,
		receipt: v.string(),
		amount: v.number(),
		shortcode: v.string(),
		replay: v.boolean()
	}),
	handler: async (ctx, args) => {
		const reason = parseReversalReason(args.reason);
		const idempotencyKey = parseDonateIdempotencyKey(args.idempotencyKey);
		const existing = await ctx.db
			.query('reversalAttempts')
			.withIndex('by_idempotencyKey', (q) => q.eq('idempotencyKey', idempotencyKey))
			.unique();
		if (existing) {
			if (
				existing.donationAttemptId !== args.donationAttemptId ||
				existing.operatorUserId !== args.operatorUserId
			) {
				throw new Error('Invalid request. Try again.');
			}
			return {
				reversalId: existing._id,
				callbackKey: existing.callbackKey,
				timeoutKey: existing.timeoutKey,
				status: existing.status,
				receipt: existing.originalReceipt,
				amount: existing.amount,
				shortcode: existing.merchantShortcode,
				replay: true
			};
		}

		const donation = await ctx.db.get(args.donationAttemptId);
		if (!donation) throw new Error('Payment not found.');
		if (donation.status !== 'succeeded' || !donation.receipt) {
			throw new Error('Only confirmed payments with an M-PESA receipt can be reversed.');
		}
		if (donation.reversed) {
			throw new Error('This payment is already marked reversed.');
		}
		if (!donation.merchantShortcode) {
			throw new Error(
				'This payment is missing merchant records. Review it manually; Ghunami will not guess from current settings.'
			);
		}
		if (donation.environment !== args.environment || donation.merchantShortcode !== args.merchantShortcode) {
			throw new Error(
				'This payment’s merchant or environment does not match the current sandbox collection account. Do not reverse it from this deployment.'
			);
		}
		if (donation.activeReversalId) {
			const open = await ctx.db.get(donation.activeReversalId);
			if (open && open.status !== 'failed') {
				throw new Error('A reversal is already in progress for this payment.');
			}
		}

		await assertReversalRateLimits(ctx, args.operatorUserId, Date.now());

		const now = Date.now();
		const callbackKey = randomHex(24);
		const timeoutKey = randomHex(24);
		const reversalId = await ctx.db.insert('reversalAttempts', {
			donationAttemptId: donation._id,
			originalReceipt: donation.receipt,
			amount: donation.amount,
			currency: 'KES',
			environment: donation.environment,
			merchantShortcode: donation.merchantShortcode,
			operatorUserId: args.operatorUserId,
			operatorTokenIdentifier: args.operatorTokenIdentifier,
			reason,
			idempotencyKey,
			callbackKey,
			timeoutKey,
			status: 'pending',
			accountingApplied: false,
			createdAt: now,
			updatedAt: now
		});
		await ctx.db.patch(donation._id, { activeReversalId: reversalId, updatedAt: now });
		return {
			reversalId,
			callbackKey,
			timeoutKey,
			status: 'pending' as const,
			receipt: donation.receipt,
			amount: donation.amount,
			shortcode: donation.merchantShortcode,
			replay: false
		};
	}
});

async function assertReversalRateLimits(ctx: MutationCtx, operatorUserId: Id<'users'>, now: number) {
	const recent = await ctx.db
		.query('reversalAttempts')
		.withIndex('by_operator_created', (q) =>
			q.eq('operatorUserId', operatorUserId).gte('createdAt', now - REVERSAL_WINDOW_MS)
		)
		.order('desc')
		.take(REVERSAL_WINDOW_MAX + 1);
	const newest = recent[0];
	if (newest && now - newest.createdAt < REVERSAL_COOLDOWN_MS) {
		throw new Error('Wait a minute before submitting another reversal.');
	}
	if (recent.length >= REVERSAL_WINDOW_MAX) {
		throw new Error('Too many reversal attempts. Try again later.');
	}
}

export const acceptReversal = internalMutation({
	args: {
		reversalId: v.id('reversalAttempts'),
		originatorConversationId: v.string(),
		conversationId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.reversalId);
		if (!row) return null;
		if (row.status === 'succeeded' || row.status === 'failed') {
			await ctx.db.patch(row._id, {
				originatorConversationId: row.originatorConversationId ?? args.originatorConversationId,
				conversationId: row.conversationId ?? args.conversationId,
				updatedAt: Date.now()
			});
			return null;
		}
		await ctx.db.patch(row._id, {
			status: row.status === 'unknown' ? 'unknown' : 'accepted',
			originatorConversationId: row.originatorConversationId ?? args.originatorConversationId,
			conversationId: row.conversationId ?? args.conversationId,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const failReversal = internalMutation({
	args: {
		reversalId: v.id('reversalAttempts'),
		resultDesc: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.reversalId);
		if (!row || row.status === 'succeeded') return null;
		if (row.status === 'failed') return null;
		await ctx.db.patch(row._id, {
			status: 'failed',
			resultDesc: args.resultDesc,
			updatedAt: Date.now()
		});
		await releaseDonation(ctx, row);
		return null;
	}
});

export const markReversalUnknown = internalMutation({
	args: { reversalId: v.id('reversalAttempts') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.reversalId);
		if (!row) return null;
		if (row.status === 'succeeded' || row.status === 'failed') return null;
		await ctx.db.patch(row._id, { status: 'unknown', updatedAt: Date.now() });
		return null;
	}
});

export const applyReversalResult = internalMutation({
	args: {
		callbackKey: v.string(),
		originatorConversationId: v.string(),
		conversationId: v.string(),
		resultCode: v.string(),
		resultDesc: v.optional(v.string()),
		reversalReceipt: v.optional(v.string()),
		originalTransactionId: v.optional(v.string()),
		amount: v.optional(v.number())
	},
	returns: v.object({ applied: v.boolean(), status: v.union(reversalStatusValidator, v.null()) }),
	handler: async (ctx, args) => {
		const callbackKey = parseCallbackKey(args.callbackKey);
		if (!callbackKey) return { applied: false, status: null };
		const row = await ctx.db
			.query('reversalAttempts')
			.withIndex('by_callbackKey', (q) => q.eq('callbackKey', callbackKey))
			.unique();
		if (!row) return { applied: false, status: null };
		return await applyParsedResult(ctx, row, args);
	}
});

export const applyReversalTimeout = internalMutation({
	args: { timeoutKey: v.string() },
	returns: v.object({ applied: v.boolean(), status: v.union(reversalStatusValidator, v.null()) }),
	handler: async (ctx, args): Promise<{ applied: boolean; status: ReversalStatus | null }> => {
		const timeoutKey = parseCallbackKey(args.timeoutKey);
		if (!timeoutKey) return { applied: false, status: null };
		const row = await ctx.db
			.query('reversalAttempts')
			.withIndex('by_timeoutKey', (q) => q.eq('timeoutKey', timeoutKey))
			.unique();
		if (!row) return { applied: false, status: null };
		if (row.status === 'succeeded' || row.status === 'failed') {
			return { applied: true, status: row.status as ReversalStatus };
		}
		await ctx.db.patch(row._id, {
			status: 'unknown',
			resultDesc: row.resultDesc ?? 'Provider timed out before a result arrived.',
			updatedAt: Date.now()
		});
		return { applied: true, status: 'unknown' as const };
	}
});

async function applyParsedResult(
	ctx: MutationCtx,
	row: Doc<'reversalAttempts'>,
	args: {
		originatorConversationId: string;
		conversationId: string;
		resultCode: string;
		resultDesc?: string;
		reversalReceipt?: string;
		originalTransactionId?: string;
		amount?: number;
	}
): Promise<{ applied: boolean; status: ReversalStatus }> {
	if (row.status === 'succeeded') {
		return { applied: true, status: row.status };
	}

	const now = Date.now();
	const ids = {
		originatorConversationId: row.originatorConversationId ?? args.originatorConversationId,
		conversationId: row.conversationId ?? args.conversationId
	};
	if (
		(row.originatorConversationId && row.originatorConversationId !== args.originatorConversationId) ||
		(row.conversationId && row.conversationId !== args.conversationId)
	) {
		await ctx.db.patch(row._id, {
			...ids,
			status: 'unknown',
			reviewRequired: true,
			metadataMismatch: true,
			resultCode: args.resultCode,
			resultDesc: 'Callback conversation IDs did not match this reversal.',
			updatedAt: now
		});
		return { applied: true, status: 'unknown' };
	}

	if (args.originalTransactionId && args.originalTransactionId !== row.originalReceipt) {
		await ctx.db.patch(row._id, {
			...ids,
			status: 'unknown',
			reviewRequired: true,
			metadataMismatch: true,
			resultCode: args.resultCode,
			resultDesc: 'Callback original receipt did not match.',
			reversalReceipt: args.reversalReceipt,
			updatedAt: now
		});
		return { applied: true, status: 'unknown' };
	}
	if (args.amount !== undefined && !amountsMatch(row.amount, args.amount)) {
		await ctx.db.patch(row._id, {
			...ids,
			status: 'unknown',
			reviewRequired: true,
			metadataMismatch: true,
			resultCode: args.resultCode,
			resultDesc: 'Callback amount did not match.',
			reversalReceipt: args.reversalReceipt,
			updatedAt: now
		});
		return { applied: true, status: 'unknown' };
	}

	if (isAlreadyReversedCode(args.resultCode)) {
		await ctx.db.patch(row._id, {
			...ids,
			status: 'unknown',
			reviewRequired: true,
			resultCode: args.resultCode,
			resultDesc:
				args.resultDesc ??
				'Provider reports this transaction is already reversed. Reconcile on the M-PESA portal; Ghunami will not mark it refunded from this code.',
			reversalReceipt: args.reversalReceipt,
			updatedAt: now
		});
		return { applied: true, status: 'unknown' };
	}

	if (isReversalSuccessCode(args.resultCode)) {
		await applyAccountingOnce(ctx, row);
		await ctx.db.patch(row._id, {
			...ids,
			status: 'succeeded',
			accountingApplied: true,
			resultCode: args.resultCode,
			resultDesc: args.resultDesc,
			reversalReceipt: args.reversalReceipt,
			updatedAt: now
		});
		return { applied: true, status: 'succeeded' };
	}

	await ctx.db.patch(row._id, {
		...ids,
		status: 'failed',
		resultCode: args.resultCode,
		resultDesc: args.resultDesc,
		reversalReceipt: args.reversalReceipt,
		updatedAt: now
	});
	await releaseDonation(ctx, row);
	return { applied: true, status: 'failed' };
}

async function applyAccountingOnce(ctx: MutationCtx, row: Doc<'reversalAttempts'>) {
	if (row.accountingApplied) return;
	const donation = await ctx.db.get(row.donationAttemptId);
	if (!donation || donation.reversed) return;
	if (donation.credited) {
		const fund = await ctx.db.get(donation.fundDocId);
		if (fund) {
			if (donation.environment === 'sandbox') {
				await ctx.db.patch(fund._id, {
					sandboxRaised: Math.max(0, (fund.sandboxRaised ?? 0) - donation.amount),
					sandboxDonationCount: Math.max(0, (fund.sandboxDonationCount ?? 0) - 1)
				});
			} else {
				await ctx.db.patch(fund._id, {
					liveRaised: Math.max(0, (fund.liveRaised ?? 0) - donation.amount),
					liveDonationCount: Math.max(0, (fund.liveDonationCount ?? 0) - 1)
				});
			}
		}
	}
	await ctx.db.patch(donation._id, {
		reversed: true,
		updatedAt: Date.now()
	});
}

async function releaseDonation(ctx: MutationCtx, row: Doc<'reversalAttempts'>) {
	const donation = await ctx.db.get(row.donationAttemptId);
	if (!donation || donation.activeReversalId !== row._id) return;
	await ctx.db.patch(donation._id, { activeReversalId: undefined, updatedAt: Date.now() });
}

const initiateReturn = v.object({
	reversalId: v.id('reversalAttempts'),
	status: reversalStatusValidator,
	amount: v.number(),
	environment: environmentValidator
});

export const initiate = action({
	args: {
		donationAttemptId: v.id('donationAttempts'),
		reason: v.string(),
		idempotencyKey: v.string(),
		confirm: v.boolean()
	},
	returns: initiateReturn,
	handler: async (ctx, args): Promise<{
		reversalId: Id<'reversalAttempts'>;
		status: ReversalStatus;
		amount: number;
		environment: 'sandbox' | 'production';
	}> => {
		if (args.confirm !== true) {
			throw new Error('Confirm this reversal before submitting.');
		}
		const operator: { userId: Id<'users'>; tokenIdentifier: string } = await ctx.runQuery(
			internal.reversals.requireOperatorUser,
			{}
		);
		const config = parseReversalConfig();
		const started = await ctx.runMutation(internal.reversals.beginReversal, {
			donationAttemptId: args.donationAttemptId,
			reason: args.reason,
			idempotencyKey: args.idempotencyKey,
			environment: config.environment,
			merchantShortcode: config.shortcode,
			operatorUserId: operator.userId,
			operatorTokenIdentifier: operator.tokenIdentifier
		});
		if (started.replay) {
			return {
				reversalId: started.reversalId,
				status: started.status,
				amount: started.amount,
				environment: config.environment
			};
		}
		try {
			const token = await oauthToken(ctx, config);
			const body = buildReversalBody({
				config,
				receipt: started.receipt,
				amount: started.amount,
				shortcode: started.shortcode,
				callbackKey: started.callbackKey,
				timeoutKey: started.timeoutKey,
				remarks: args.reason
			});
			const response = await fetch(`${config.baseUrl}/mpesa/reversal/v1/request`, {
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
				await ctx.runMutation(internal.reversals.failReversal, {
					reversalId: started.reversalId,
					resultDesc: 'Provider rejected the reversal request.'
				});
				throw new Error('Couldn’t submit the reversal. Try again.');
			}
			const code = parseResultCode(
				payload && typeof payload === 'object' ? (payload as { ResponseCode?: unknown }).ResponseCode : null
			);
			if (code !== 0) {
				await ctx.runMutation(internal.reversals.failReversal, {
					reversalId: started.reversalId,
					resultDesc: 'Provider did not accept the reversal request.'
				});
				throw new Error('Couldn’t submit the reversal. Try again.');
			}
			const originatorConversationId =
				payload &&
				typeof payload === 'object' &&
				typeof (payload as { OriginatorConversationID?: unknown }).OriginatorConversationID === 'string'
					? (payload as { OriginatorConversationID: string }).OriginatorConversationID
					: '';
			const conversationId =
				payload &&
				typeof payload === 'object' &&
				typeof (payload as { ConversationID?: unknown }).ConversationID === 'string'
					? (payload as { ConversationID: string }).ConversationID
					: '';
			if (!originatorConversationId || !conversationId) {
				await ctx.runMutation(internal.reversals.markReversalUnknown, { reversalId: started.reversalId });
				return {
					reversalId: started.reversalId,
					status: 'unknown' as const,
					amount: started.amount,
					environment: config.environment
				};
			}
			await ctx.runMutation(internal.reversals.acceptReversal, {
				reversalId: started.reversalId,
				originatorConversationId,
				conversationId
			});
			return {
				reversalId: started.reversalId,
				status: 'accepted' as const,
				amount: started.amount,
				environment: config.environment
			};
		} catch (error) {
			const timeout =
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError' || /abort|network|timeout/i.test(error.message));
			if (timeout) {
				await ctx.runMutation(internal.reversals.markReversalUnknown, { reversalId: started.reversalId });
				return {
					reversalId: started.reversalId,
					status: 'unknown' as const,
					amount: started.amount,
					environment: config.environment
				};
			}
			if (error instanceof Error && error.message.startsWith('Wait ')) throw error;
			if (error instanceof Error && error.message.startsWith('Too many')) throw error;
			if (error instanceof Error && /Couldn’t submit the reversal/.test(error.message)) throw error;
			await ctx.runMutation(internal.reversals.markReversalUnknown, { reversalId: started.reversalId });
			return {
				reversalId: started.reversalId,
				status: 'unknown' as const,
				amount: started.amount,
				environment: config.environment
			};
		}
	}
});

export const requireOperatorUser = internalQuery({
	args: {},
	returns: v.object({
		userId: v.id('users'),
		tokenIdentifier: v.string()
	}),
	handler: async (ctx) => {
		const operator = await requireOperator(ctx);
		return { userId: operator.user._id, tokenIdentifier: operator.tokenIdentifier };
	}
});

async function oauthToken(ctx: ActionCtx, config: ReversalConfig): Promise<string> {
	const cached = await ctx.runQuery(internal.donations.getCachedToken, {
		environment: config.environment,
		now: Date.now()
	});
	if (cached) return cached;
	const token = await requestOAuthToken(config);
	await ctx.runMutation(internal.donations.storeToken, {
		environment: config.environment,
		accessToken: token.accessToken,
		expiresAt: token.expiresAt
	});
	return token.accessToken;
}
