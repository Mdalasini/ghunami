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
		updatedAt: v.number()
	})
		.index('by_fundID', ['fundID'])
		.index('by_owner_created', ['ownerId', 'createdAt'])
		.index('by_owner_idempotency', ['ownerId', 'idempotencyKey'])
});
