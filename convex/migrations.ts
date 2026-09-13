import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

/** Run page by page after deploying the transitional schema; see MIGRATIONS.md. */
export const removeLegacyUserFields = internalMutation({
	args: { cursor: v.union(v.string(), v.null()) },
	returns: v.object({ cursor: v.string(), isDone: v.boolean(), processed: v.number() }),
	handler: async (ctx, { cursor }) => {
		const result = await ctx.db.query('users').paginate({ cursor, numItems: 100 });
		for (const user of result.page) {
			await ctx.db.patch(user._id, {
				role: undefined,
				pictureUrl: undefined,
				createdAt: undefined,
				updatedAt: undefined
			});
		}
		return {
			cursor: result.continueCursor,
			isDone: result.isDone,
			processed: result.page.length
		};
	}
});
