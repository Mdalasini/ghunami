import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const crop = v.object({
	x: v.number(),
	y: v.number(),
	width: v.number(),
	height: v.number()
});

export default defineSchema({
	users: defineTable({
		tokenIdentifier: v.string(),
		name: v.string(),
		email: v.string()
	}).index('by_token', ['tokenIdentifier']),

	uploads: defineTable({
		ownerId: v.id('users'),
		storageId: v.id('_storage'),
		kind: v.union(v.literal('cover'), v.literal('original')),
		fundDocId: v.union(v.id('funds'), v.null())
	})
		.index('by_storageId', ['storageId'])
		.index('by_owner', ['ownerId']),

	funds: defineTable({
		fundID: v.string(),
		ownerId: v.id('users'),
		goal: v.number(),
		title: v.string(),
		story: v.string(),
		coverStorageId: v.optional(v.id('_storage')),
		coverOriginalStorageId: v.optional(v.id('_storage')),
		coverCrop: v.optional(crop),
		coverName: v.optional(v.string()),
		coverSkipped: v.boolean(),
		status: v.union(v.literal('draft'), v.literal('live')),
		publishedAt: v.optional(v.number()),
		idempotencyKey: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		sandboxRaised: v.optional(v.number()),
		sandboxDonationCount: v.optional(v.number()),
		liveRaised: v.optional(v.number()),
		liveDonationCount: v.optional(v.number())
	})
		.index('by_fundID', ['fundID'])
		.index('by_owner_created', ['ownerId', 'createdAt'])
		.index('by_owner_idempotency', ['ownerId', 'idempotencyKey']),

	donationAttempts: defineTable({
		fundDocId: v.id('funds'),
		fundID: v.string(),
		amount: v.number(),
		currency: v.literal('KES'),
		environment: v.union(v.literal('sandbox'), v.literal('production')),
		phone: v.string(),
		guestSessionId: v.string(),
		userId: v.optional(v.id('users')),
		displayName: v.optional(v.string()),
		status: v.union(
			v.literal('pending'),
			v.literal('accepted'),
			v.literal('unknown'),
			v.literal('succeeded'),
			v.literal('cancelled'),
			v.literal('failed')
		),
		credited: v.boolean(),
		idempotencyKey: v.string(),
		statusKey: v.string(),
		callbackKey: v.string(),
		merchantRequestId: v.optional(v.string()),
		checkoutRequestId: v.optional(v.string()),
		receipt: v.optional(v.string()),
		resultCode: v.optional(v.number()),
		resultDesc: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_idempotencyKey', ['idempotencyKey'])
		.index('by_statusKey', ['statusKey'])
		.index('by_callbackKey', ['callbackKey'])
		.index('by_checkoutRequestId', ['checkoutRequestId'])
		.index('by_phone_created', ['phone', 'createdAt'])
		.index('by_guest_created', ['guestSessionId', 'createdAt'])
		.index('by_fund_env_status_created', ['fundDocId', 'environment', 'status', 'createdAt']),

	mpesaOAuth: defineTable({
		environment: v.string(),
		accessToken: v.string(),
		expiresAt: v.number()
	}).index('by_environment', ['environment'])
});
