import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';

const meReturn = v.object({
	_id: v.id('users'),
	name: v.string(),
	email: v.string()
});

export const me = query({
	args: {},
	returns: v.union(meReturn, v.null()),
	handler: async (ctx) => {
		const user = await getCurrentUserOrNull(ctx);
		if (!user) return null;
		return { _id: user._id, name: user.name, email: user.email };
	}
});

/** Records the verified WorkOS identity; access tokens carry no email claim. */
export const upsertFromWorkOS = internalMutation({
	args: {
		issuer: v.string(),
		workosUserId: v.string(),
		email: v.string(),
		firstName: v.union(v.string(), v.null()),
		lastName: v.union(v.string(), v.null())
	},
	returns: v.id('users'),
	handler: async (ctx, args) => {
		const tokenIdentifier = `${args.issuer}|${args.workosUserId}`;
		const email = args.email.trim().toLowerCase();
		const name = [args.firstName, args.lastName].filter(Boolean).join(' ').trim() || email;

		const existing = await ctx.db
			.query('users')
			.withIndex('by_token', (q) => q.eq('tokenIdentifier', tokenIdentifier))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, { name, email });
			return existing._id;
		}

		return await ctx.db.insert('users', { tokenIdentifier, name, email });
	}
});
