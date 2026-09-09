import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { getCurrentUserOrNull } from './lib/auth';

const meReturn = v.object({
	_id: v.id('users'),
	name: v.string(),
	email: v.string(),
	pictureUrl: v.optional(v.string()),
	role: v.union(v.literal('user'), v.literal('admin'))
});

export const storeUser = mutation({
	args: {},
	returns: v.id('users'),
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}

		const existing = await ctx.db
			.query('users')
			.withIndex('by_token', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
			.unique();

		const name = identity.name ?? identity.email ?? 'Anonymous';
		const email = (identity.email ?? '').trim().toLowerCase();
		const pictureUrl = identity.pictureUrl ?? undefined;

		if (existing) {
			// The AuthKit access token carries no `email` claim, so these can be
			// blank. Never let a blank overwrite what `upsertFromWorkOS` recorded.
			await ctx.db.patch(existing._id, {
				...(name && name !== 'Anonymous' ? { name } : {}),
				...(email ? { email } : {}),
				...(pictureUrl ? { pictureUrl } : {}),
				updatedAt: Date.now()
			});
			return existing._id;
		}

		return await ctx.db.insert('users', {
			tokenIdentifier: identity.tokenIdentifier,
			name,
			email,
			pictureUrl,
			role: 'user',
			createdAt: Date.now()
		});
	}
});

export const me = query({
	args: {},
	returns: v.union(meReturn, v.null()),
	handler: async (ctx) => {
		const user = await getCurrentUserOrNull(ctx);
		if (!user) {
			return null;
		}
		return {
			_id: user._id,
			name: user.name,
			email: user.email,
			pictureUrl: user.pictureUrl,
			role: user.role
		};
	}
});


/**
 * Written the moment WorkOS confirms an authentication, which is the only point
 * where we hold a *verified* email — the access token itself carries no `email`
 * claim, so `storeUser` alone would leave the column blank.
 * Internal: the caller must have
 * already authenticated against WorkOS.
 */
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
			await ctx.db.patch(existing._id, { name, email, updatedAt: Date.now() });
			return existing._id;
		}

		return await ctx.db.insert('users', {
			tokenIdentifier,
			name,
			email,
			role: 'user',
			createdAt: Date.now()
		});
	}
});
