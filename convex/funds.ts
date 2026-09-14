import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { getCurrentUserOrNull, requireUser } from './lib/auth';
import { assertUploadMeta, parseGoal, parseIdempotencyKey, parseStory, parseTitle } from './lib/fundFields';
import { allocateFundID, isFundID } from './lib/fundId';

const cropValidator = v.object({
	x: v.number(),
	y: v.number(),
	width: v.number(),
	height: v.number()
});

const fundStatus = v.union(v.literal('draft'), v.literal('live'));

const previewReturn = v.object({
	fundID: v.string(),
	goal: v.number(),
	title: v.string(),
	story: v.string(),
	status: fundStatus,
	coverSkipped: v.boolean(),
	hasCover: v.boolean(),
	hasOriginal: v.boolean(),
	coverCrop: v.optional(cropValidator),
	coverName: v.optional(v.string()),
	organiserName: v.string(),
	createdAt: v.number(),
	updatedAt: v.number()
});

const listItem = v.object({
	fundID: v.string(),
	title: v.string(),
	goal: v.number(),
	status: fundStatus,
	hasCover: v.boolean(),
	createdAt: v.number()
});

const publicReturn = v.object({
	fundID: v.string(),
	goal: v.number(),
	title: v.string(),
	story: v.string(),
	status: v.literal('live'),
	hasCover: v.boolean(),
	organiserName: v.string(),
	publishedAt: v.optional(v.number()),
	updatedAt: v.number()
});

function publicOrganiserName(name: string | undefined): string {
	const trimmed = name?.trim() ?? '';
	if (!trimmed || trimmed.includes('@')) return 'An organiser';
	return trimmed;
}

async function fundByPublicId(ctx: QueryCtx | MutationCtx, fundID: string) {
	if (!isFundID(fundID)) return null;
	return await ctx.db
		.query('funds')
		.withIndex('by_fundID', (q) => q.eq('fundID', fundID))
		.unique();
}

async function ownedFund(ctx: QueryCtx | MutationCtx, fundID: string, ownerId: Id<'users'>) {
	const fund = await fundByPublicId(ctx, fundID);
	if (!fund || fund.ownerId !== ownerId) return null;
	return fund;
}

function toPreview(fund: Doc<'funds'>, organiserName: string) {
	return {
		fundID: fund.fundID,
		goal: fund.goal,
		title: fund.title,
		story: fund.story,
		status: fund.status,
		coverSkipped: fund.coverSkipped,
		hasCover: fund.coverStorageId !== undefined,
		hasOriginal: fund.coverOriginalStorageId !== undefined,
		coverCrop: fund.coverCrop,
		coverName: fund.coverName,
		organiserName,
		createdAt: fund.createdAt,
		updatedAt: fund.updatedAt
	};
}

async function claimUpload(
	ctx: MutationCtx,
	ownerId: Id<'users'>,
	uploadId: Id<'uploads'> | undefined,
	kind: 'cover' | 'original',
	fundDocId: Id<'funds'> | null
) {
	if (!uploadId) return null;
	const upload = await ctx.db.get(uploadId);
	if (!upload || upload.ownerId !== ownerId || upload.kind !== kind) {
		throw new Error('That photo could not be saved. Try another one.');
	}
	if (upload.fundDocId !== null && upload.fundDocId !== fundDocId) {
		throw new Error('That photo could not be saved. Try another one.');
	}
	return upload;
}

async function deleteStorage(ctx: MutationCtx, storageId: Id<'_storage'> | undefined) {
	if (!storageId) return;
	try {
		await ctx.storage.delete(storageId);
	} catch {
		// Already gone.
	}
}

async function releaseUpload(ctx: MutationCtx, storageId: Id<'_storage'> | undefined) {
	if (!storageId) return;
	const row = await ctx.db
		.query('uploads')
		.withIndex('by_storageId', (q) => q.eq('storageId', storageId))
		.unique();
	if (row) await ctx.db.delete(row._id);
	await deleteStorage(ctx, storageId);
}

async function writeOwnedFund(
	ctx: MutationCtx,
	ownerId: Id<'users'>,
	fund: Doc<'funds'>,
	args: {
		goal: number;
		title: string;
		story: string;
		coverSkipped: boolean;
		coverUploadId?: Id<'uploads'>;
		originalUploadId?: Id<'uploads'>;
		coverCrop?: { x: number; y: number; width: number; height: number };
		coverName?: string;
		cover: 'keep' | 'replace' | 'clear';
	}
) {
	const goal = parseGoal(args.goal);
	const title = parseTitle(args.title);
	const story = parseStory(args.story);
	const now = Date.now();

	if (args.cover === 'keep') {
		await ctx.db.patch(fund._id, { goal, title, story, updatedAt: now });
		return fund.fundID;
	}

	if (args.cover === 'clear') {
		await releaseUpload(ctx, fund.coverStorageId);
		await releaseUpload(ctx, fund.coverOriginalStorageId);
		await ctx.db.patch(fund._id, {
			goal,
			title,
			story,
			coverStorageId: undefined,
			coverOriginalStorageId: undefined,
			coverCrop: undefined,
			coverName: undefined,
			coverSkipped: args.coverSkipped,
			updatedAt: now
		});
		return fund.fundID;
	}

	const cover = await claimUpload(ctx, ownerId, args.coverUploadId, 'cover', fund._id);
	if (!cover) throw new Error('That photo could not be saved. Try another one.');
	const original = await claimUpload(ctx, ownerId, args.originalUploadId, 'original', fund._id);

	if (fund.coverStorageId && fund.coverStorageId !== cover.storageId) {
		await releaseUpload(ctx, fund.coverStorageId);
	}
	if (fund.coverOriginalStorageId && fund.coverOriginalStorageId !== original?.storageId) {
		await releaseUpload(ctx, fund.coverOriginalStorageId);
	}

	await ctx.db.patch(fund._id, {
		goal,
		title,
		story,
		coverStorageId: cover.storageId,
		coverOriginalStorageId: original?.storageId,
		coverCrop: original && args.coverCrop ? args.coverCrop : undefined,
		coverName: args.coverName,
		coverSkipped: false,
		updatedAt: now
	});
	await ctx.db.patch(cover._id, { fundDocId: fund._id });
	if (original) await ctx.db.patch(original._id, { fundDocId: fund._id });
	return fund.fundID;
}

export const generateUploadUrl = mutation({
	args: {},
	returns: v.string(),
	handler: async (ctx) => {
		await requireUser(ctx);
		return await ctx.storage.generateUploadUrl();
	}
});

export const registerUpload = mutation({
	args: {
		storageId: v.id('_storage'),
		kind: v.union(v.literal('cover'), v.literal('original'))
	},
	returns: v.id('uploads'),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const existing = await ctx.db
			.query('uploads')
			.withIndex('by_storageId', (q) => q.eq('storageId', args.storageId))
			.unique();
		if (existing) {
			if (existing.ownerId !== user._id || existing.kind !== args.kind) {
				throw new Error('That photo could not be saved. Try another one.');
			}
			return existing._id;
		}
		const meta = await ctx.db.system.get('_storage', args.storageId);
		try {
			assertUploadMeta(args.kind, meta ? { contentType: meta.contentType ?? undefined, size: meta.size } : null);
		} catch (error) {
			await deleteStorage(ctx, args.storageId);
			throw error;
		}
		return await ctx.db.insert('uploads', {
			ownerId: user._id,
			storageId: args.storageId,
			kind: args.kind,
			fundDocId: null
		});
	}
});

export const create = mutation({
	args: {
		idempotencyKey: v.string(),
		goal: v.number(),
		title: v.string(),
		story: v.string(),
		coverSkipped: v.boolean(),
		coverUploadId: v.optional(v.id('uploads')),
		originalUploadId: v.optional(v.id('uploads')),
		coverCrop: v.optional(cropValidator),
		coverName: v.optional(v.string())
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const idempotencyKey = parseIdempotencyKey(args.idempotencyKey);
		const existing = await ctx.db
			.query('funds')
			.withIndex('by_owner_idempotency', (q) =>
				q.eq('ownerId', user._id).eq('idempotencyKey', idempotencyKey)
			)
			.unique();
		if (existing) {
			return await writeOwnedFund(ctx, user._id, existing, {
				...args,
				cover: args.coverUploadId ? 'replace' : args.coverSkipped ? 'clear' : 'keep'
			});
		}

		const goal = parseGoal(args.goal);
		const title = parseTitle(args.title);
		const story = parseStory(args.story);
		const cover = await claimUpload(ctx, user._id, args.coverUploadId, 'cover', null);
		const original = await claimUpload(ctx, user._id, args.originalUploadId, 'original', null);
		const now = Date.now();
		const fundID = await allocateFundID(async (id) => (await fundByPublicId(ctx, id)) !== null);

		const fundDocId = await ctx.db.insert('funds', {
			fundID,
			ownerId: user._id,
			goal,
			title,
			story,
			coverStorageId: cover?.storageId,
			coverOriginalStorageId: original?.storageId,
			coverCrop: original && args.coverCrop ? args.coverCrop : undefined,
			coverName: cover ? args.coverName : undefined,
			coverSkipped: cover ? false : args.coverSkipped,
			status: 'draft',
			idempotencyKey,
			createdAt: now,
			updatedAt: now
		});
		if (cover) await ctx.db.patch(cover._id, { fundDocId });
		if (original) await ctx.db.patch(original._id, { fundDocId });
		return fundID;
	}
});

export const discardUpload = mutation({
	args: { uploadId: v.id('uploads') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const upload = await ctx.db.get(args.uploadId);
		if (!upload || upload.ownerId !== user._id || upload.fundDocId !== null) return null;
		await ctx.db.delete(upload._id);
		await deleteStorage(ctx, upload.storageId);
		return null;
	}
});

export const update = mutation({
	args: {
		fundID: v.string(),
		goal: v.number(),
		title: v.string(),
		story: v.string(),
		coverSkipped: v.boolean(),
		coverUploadId: v.optional(v.id('uploads')),
		originalUploadId: v.optional(v.id('uploads')),
		coverCrop: v.optional(cropValidator),
		coverName: v.optional(v.string()),
		cover: v.union(v.literal('keep'), v.literal('replace'), v.literal('clear'))
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const fund = await ownedFund(ctx, args.fundID, user._id);
		if (!fund) throw new Error('Fund not found');
		return await writeOwnedFund(ctx, user._id, fund, args);
	}
});

export const publish = mutation({
	args: { fundID: v.string() },
	returns: v.object({
		fundID: v.string(),
		title: v.string(),
		status: v.literal('live'),
		publishedAt: v.number()
	}),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const fund = await ownedFund(ctx, args.fundID, user._id);
		if (!fund) throw new Error('Fund not found');
		parseGoal(fund.goal);
		parseTitle(fund.title);
		parseStory(fund.story);
		if (fund.status === 'live' && fund.publishedAt !== undefined) {
			return {
				fundID: fund.fundID,
				title: fund.title,
				status: 'live' as const,
				publishedAt: fund.publishedAt
			};
		}
		const now = Date.now();
		const publishedAt = fund.publishedAt ?? now;
		await ctx.db.patch(fund._id, { status: 'live', publishedAt, updatedAt: now });
		return { fundID: fund.fundID, title: fund.title, status: 'live' as const, publishedAt };
	}
});

export const getPublic = query({
	args: { fundID: v.string() },
	returns: v.union(publicReturn, v.null()),
	handler: async (ctx, args) => {
		const fund = await fundByPublicId(ctx, args.fundID);
		if (!fund || fund.status !== 'live') return null;
		const owner = await ctx.db.get(fund.ownerId);
		return {
			fundID: fund.fundID,
			goal: fund.goal,
			title: fund.title,
			story: fund.story,
			status: 'live' as const,
			hasCover: fund.coverStorageId !== undefined,
			organiserName: publicOrganiserName(owner?.name),
			publishedAt: fund.publishedAt,
			updatedAt: fund.updatedAt
		};
	}
});

export const getPreview = query({
	args: { fundID: v.string() },
	returns: v.union(previewReturn, v.null()),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const fund = await ownedFund(ctx, args.fundID, user._id);
		if (!fund) return null;
		return toPreview(fund, user.name);
	}
});

export const listMine = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		page: v.array(listItem),
		isDone: v.boolean(),
		continueCursor: v.string()
	}),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx);
		const result = await ctx.db
			.query('funds')
			.withIndex('by_owner_created', (q) => q.eq('ownerId', user._id))
			.order('desc')
			.paginate(args.paginationOpts);
		return {
			page: result.page.map((fund) => ({
				fundID: fund.fundID,
				title: fund.title,
				goal: fund.goal,
				status: fund.status,
				hasCover: fund.coverStorageId !== undefined,
				createdAt: fund.createdAt
			})),
			isDone: result.isDone,
			continueCursor: result.continueCursor
		};
	}
});

export const mediaFile = internalQuery({
	args: {
		fundID: v.string(),
		kind: v.union(v.literal('cover'), v.literal('original'))
	},
	returns: v.union(
		v.object({
			storageId: v.id('_storage'),
			contentType: v.string()
		}),
		v.null()
	),
	handler: async (ctx, args) => {
		const fund = await fundByPublicId(ctx, args.fundID);
		if (!fund) return null;
		const user = await getCurrentUserOrNull(ctx);
		const isOwner = user !== null && fund.ownerId === user._id;
		if (args.kind === 'original') {
			if (!isOwner) return null;
		} else if (fund.status !== 'live' && !isOwner) {
			return null;
		}
		const storageId = args.kind === 'original' ? fund.coverOriginalStorageId : fund.coverStorageId;
		if (!storageId) return null;
		const meta = await ctx.db.system.get('_storage', storageId);
		return {
			storageId,
			contentType: meta?.contentType || 'application/octet-stream'
		};
	}
});
