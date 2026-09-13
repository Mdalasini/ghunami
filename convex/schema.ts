import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	users: defineTable({
		tokenIdentifier: v.string(),
		name: v.string(),
		email: v.string(),
		// Transitional validators for existing documents; see MIGRATIONS.md.
		pictureUrl: v.optional(v.string()),
		role: v.optional(v.union(v.literal('user'), v.literal('admin'))),
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number())
	}).index('by_token', ['tokenIdentifier'])
});
