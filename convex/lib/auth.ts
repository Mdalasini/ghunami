import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<Doc<'users'>> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new Error('Not authenticated');
	}

	const user = await ctx.db
		.query('users')
		.withIndex('by_token', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
		.unique();

	if (!user) {
		throw new Error('User not found');
	}

	return user;
}

export async function getCurrentUserOrNull(
	ctx: QueryCtx | MutationCtx
): Promise<Doc<'users'> | null> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}

	return await ctx.db
		.query('users')
		.withIndex('by_token', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
		.unique();
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<'users'>> {
	const user = await getCurrentUser(ctx);
	if (user.role !== 'admin') {
		throw new Error('Admin access required');
	}
	return user;
}
