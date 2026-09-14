import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { api, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { allocateFundID, FUND_ID_ATTEMPTS, FUND_ID_SPACE, isFundID, randomFundID } from '../../convex/lib/fundId';
import { modules } from './modules';

function harness() {
	return convexTest(schema, modules);
}

const maya = {
	issuer: 'https://example.test',
	workosUserId: 'maya',
	email: 'maya@example.com',
	firstName: 'Maya',
	lastName: 'Otieno'
};

const lee = { ...maya, workosUserId: 'lee', email: 'lee@example.com', firstName: 'Lee' };

async function storeTypedBlob(
	t: ReturnType<typeof harness>,
	blob: Blob,
	contentType: string
) {
	return await t.run(async (ctx) => {
		const storageId = await ctx.storage.store(blob);
		await ctx.db.patch(storageId as never, { contentType } as never);
		return storageId;
	});
}

async function asUser(
	t: ReturnType<typeof harness>,
	person: typeof maya
) {
	await t.mutation(internal.users.upsertFromWorkOS, person);
	return t.withIdentity({ subject: person.workosUserId, issuer: person.issuer });
}

const draft = {
	idempotencyKey: 'create-1-aaaaaaaa',
	goal: 50_000,
	title: 'Help Maya get home',
	story: '<p>Raising travel money so Maya can get home safely.</p>',
	coverSkipped: true
};

describe('fund IDs', () => {
	it('treats case as distinct and documents the 62³ namespace', () => {
		expect(isFundID('Ab3')).toBe(true);
		expect(isFundID('ab3')).toBe(true);
		expect(isFundID('AB3')).toBe(true);
		expect(new Set(['Ab3', 'ab3', 'AB3']).size).toBe(3);
		expect(isFundID('Ab')).toBe(false);
		expect(isFundID('Ab34')).toBe(false);
		expect(isFundID('Ab/')).toBe(false);
		expect(FUND_ID_SPACE).toBe(238_328);
		expect(isFundID(randomFundID())).toBe(true);
	});

	it('retries collisions and fails after a bounded number of attempts', async () => {
		let calls = 0;
		await expect(
			allocateFundID(async () => true, () => {
				calls += 1;
				return 'Aa1';
			})
		).rejects.toThrow(/allocate a fund ID/);
		expect(calls).toBe(FUND_ID_ATTEMPTS);

		let n = 0;
		const taken = new Set(['Aa1']);
		const id = await allocateFundID(
			async (candidate) => taken.has(candidate),
			() => (++n === 1 ? 'Aa1' : 'Bb2')
		);
		expect(id).toBe('Bb2');
	});
});

describe('funds auth and ownership', () => {
	it('rejects unauthenticated create, read, update, list, publish, and uploads', async () => {
		const t = harness();
		await expect(t.mutation(api.funds.create, draft)).rejects.toThrow(/Not authenticated/);
		await expect(t.query(api.funds.getPreview, { fundID: 'Ab3' })).rejects.toThrow(/Not authenticated/);
		await expect(t.mutation(api.funds.publish, { fundID: 'Ab3' })).rejects.toThrow(/Not authenticated/);
		await expect(
			t.mutation(api.funds.update, {
				fundID: 'Ab3',
				goal: 50_000,
				title: 'x',
				story: '<p>x</p>',
				coverSkipped: true,
				cover: 'keep'
			})
		).rejects.toThrow(/Not authenticated/);
		await expect(
			t.query(api.funds.listMine, { paginationOpts: { numItems: 10, cursor: null } })
		).rejects.toThrow(/Not authenticated/);
		await expect(t.mutation(api.funds.generateUploadUrl, {})).rejects.toThrow(/Not authenticated/);
	});

	it('lets the owner read and update, and hides the fund from everyone else', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const other = await asUser(t, lee);
		const fundID = await owner.mutation(api.funds.create, draft);
		expect(fundID).toMatch(/^[A-Za-z0-9]{3}$/);

		const preview = await owner.query(api.funds.getPreview, { fundID });
		expect(preview).toMatchObject({ fundID, title: draft.title, goal: 50_000, status: 'draft' });
		expect(preview?.story).toContain('Maya');

		expect(await other.query(api.funds.getPreview, { fundID })).toBeNull();
		expect(await owner.query(api.funds.getPreview, { fundID: 'nope' })).toBeNull();
		expect(await owner.query(api.funds.getPreview, { fundID: 'zzz' })).toBeNull();

		await expect(
			other.mutation(api.funds.update, {
				fundID,
				goal: 50_000,
				title: 'Stolen',
				story: draft.story,
				coverSkipped: true,
				cover: 'keep'
			})
		).rejects.toThrow(/Fund not found/);

		expect(
			await owner.mutation(api.funds.update, {
				fundID,
				goal: 50_000,
				title: 'Help Maya fly home',
				story: draft.story,
				coverSkipped: true,
				cover: 'keep'
			})
		).toBe(fundID);
		expect((await owner.query(api.funds.getPreview, { fundID }))?.title).toBe('Help Maya fly home');
	});

	it('lists only the caller’s funds, newest first, with pagination', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const other = await asUser(t, lee);
		const first = await owner.mutation(api.funds.create, { ...draft, idempotencyKey: 'list-a-aaaaaaaa' });
		const second = await owner.mutation(api.funds.create, {
			...draft,
			idempotencyKey: 'list-b-bbbbbbbb',
			title: 'Second'
		});
		await other.mutation(api.funds.create, { ...draft, idempotencyKey: 'list-c-cccccccc', title: 'Lee’s' });

		const page = await owner.query(api.funds.listMine, { paginationOpts: { numItems: 1, cursor: null } });
		expect(page.page).toHaveLength(1);
		expect(page.page[0]?.fundID).toBe(second);
		expect(page.isDone).toBe(false);
		const rest = await owner.query(api.funds.listMine, {
			paginationOpts: { numItems: 10, cursor: page.continueCursor }
		});
		expect(rest.page.map((row) => row.fundID)).toEqual([first]);
		expect(rest.isDone).toBe(true);

		const theirs = await other.query(api.funds.listMine, { paginationOpts: { numItems: 10, cursor: null } });
		expect(theirs.page.map((row) => row.title)).toEqual(['Lee’s']);
	});

	it('retries with the same key apply the latest fields and claim a new cover', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const a = await owner.mutation(api.funds.create, draft);
		const jpeg = await storeTypedBlob(
			t,
			new Blob([new Uint8Array(32)], { type: 'image/jpeg' }),
			'image/jpeg'
		);
		const uploadId = await owner.mutation(api.funds.registerUpload, { storageId: jpeg, kind: 'cover' });
		const b = await owner.mutation(api.funds.create, {
			...draft,
			title: 'Duplicate',
			story: '<p onclick="x()">Hello <script>alert(1)</script><b>there</b></p>',
			coverSkipped: false,
			coverUploadId: uploadId,
			coverName: 'cover.jpg'
		});
		expect(b).toBe(a);
		const preview = await owner.query(api.funds.getPreview, { fundID: a });
		expect(preview?.title).toBe('Duplicate');
		expect(preview?.hasCover).toBe(true);
		expect(preview?.story).toBe('<p>Hello <strong>there</strong></p>');

		expect(
			await owner.mutation(api.funds.create, { ...draft, coverSkipped: true, title: 'No photo' })
		).toBe(a);
		expect(await owner.query(api.funds.getPreview, { fundID: a })).toMatchObject({
			title: 'No photo',
			hasCover: false,
			coverSkipped: true
		});
	});

	it('rejects invalid fields', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		await expect(owner.mutation(api.funds.create, { ...draft, goal: 0 })).rejects.toThrow(/goal/i);
		await expect(owner.mutation(api.funds.create, { ...draft, title: '   ' })).rejects.toThrow(/title/i);
		await expect(owner.mutation(api.funds.create, { ...draft, story: '<p><br></p>' })).rejects.toThrow(/story/i);
		await expect(owner.mutation(api.funds.create, { ...draft, idempotencyKey: 'short' })).rejects.toThrow(/Invalid request/);
	});

	it('registers uploads only for the caller and rejects a foreign storage id', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const other = await asUser(t, lee);
		const storageId = await t.run(async (ctx) => {
			return await ctx.storage.store(new Blob(['hello'], { type: 'text/plain' }));
		});
		await expect(
			owner.mutation(api.funds.registerUpload, { storageId, kind: 'cover' })
		).rejects.toThrow(/isn’t an image/);

		const jpeg = await storeTypedBlob(
			t,
			new Blob([new Uint8Array(32)], { type: 'image/jpeg' }),
			'image/jpeg'
		);
		const uploadId = await owner.mutation(api.funds.registerUpload, { storageId: jpeg, kind: 'cover' });
		await expect(
			other.mutation(api.funds.registerUpload, { storageId: jpeg, kind: 'cover' })
		).rejects.toThrow(/could not be saved/);
		expect(uploadId).toBeTruthy();
	});

	it('discards unattached owned uploads and leaves claimed or foreign ones', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const other = await asUser(t, lee);
		const jpeg = await storeTypedBlob(
			t,
			new Blob([new Uint8Array(32)], { type: 'image/jpeg' }),
			'image/jpeg'
		);
		const uploadId = await owner.mutation(api.funds.registerUpload, { storageId: jpeg, kind: 'cover' });
		await expect(other.mutation(api.funds.discardUpload, { uploadId })).resolves.toBeNull();
		await expect(owner.mutation(api.funds.discardUpload, { uploadId })).resolves.toBeNull();
		await expect(
			owner.mutation(api.funds.create, { ...draft, coverSkipped: false, coverUploadId: uploadId })
		).rejects.toThrow(/could not be saved/);

		const kept = await storeTypedBlob(
			t,
			new Blob([new Uint8Array(8)], { type: 'image/jpeg' }),
			'image/jpeg'
		);
		const claimed = await owner.mutation(api.funds.registerUpload, { storageId: kept, kind: 'cover' });
		const fundID = await owner.mutation(api.funds.create, {
			...draft,
			idempotencyKey: 'keep-1-aaaaaaaa',
			coverSkipped: false,
			coverUploadId: claimed
		});
		await expect(owner.mutation(api.funds.discardUpload, { uploadId: claimed })).resolves.toBeNull();
		expect((await owner.query(api.funds.getPreview, { fundID }))?.hasCover).toBe(true);
	});
});

describe('fund media HTTP', () => {
	it('serves cover bytes only to the owner', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const other = await asUser(t, lee);
		const jpeg = await storeTypedBlob(
			t,
			new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
			'image/jpeg'
		);
		const uploadId = await owner.mutation(api.funds.registerUpload, { storageId: jpeg, kind: 'cover' });
		const fundID = await owner.mutation(api.funds.create, {
			...draft,
			coverSkipped: false,
			coverUploadId: uploadId,
			coverName: 'cover.jpg'
		});

		const denied = await t.fetch(`/media?fundID=${fundID}&kind=cover`);
		expect(denied.status).toBe(404);
		const stolen = await other.fetch(`/media?fundID=${fundID}&kind=cover`);
		expect(stolen.status).toBe(404);
		const ok = await owner.fetch(`/media?fundID=${fundID}&kind=cover`);
		expect(ok.status).toBe(200);
		expect(ok.headers.get('Content-Type')).toMatch(/image\/jpeg/);
		expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('serves live covers anonymously and keeps originals owner-only', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const other = await asUser(t, lee);
		const cover = await storeTypedBlob(
			t,
			new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }),
			'image/jpeg'
		);
		const original = await storeTypedBlob(
			t,
			new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' }),
			'image/jpeg'
		);
		const coverId = await owner.mutation(api.funds.registerUpload, { storageId: cover, kind: 'cover' });
		const originalId = await owner.mutation(api.funds.registerUpload, { storageId: original, kind: 'original' });
		const fundID = await owner.mutation(api.funds.create, {
			...draft,
			idempotencyKey: 'media-live-aaaaaaaa',
			coverSkipped: false,
			coverUploadId: coverId,
			originalUploadId: originalId,
			coverName: 'cover.jpg'
		});

		expect((await t.fetch(`/media?fundID=${fundID}&kind=cover`)).status).toBe(404);
		await owner.mutation(api.funds.publish, { fundID });

		const anonCover = await t.fetch(`/media?fundID=${fundID}&kind=cover`);
		expect(anonCover.status).toBe(200);
		expect(new Uint8Array(await anonCover.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
		expect((await t.fetch(`/media?fundID=${fundID}&kind=original`)).status).toBe(404);
		expect((await other.fetch(`/media?fundID=${fundID}&kind=original`)).status).toBe(404);
		const ownedOriginal = await owner.fetch(`/media?fundID=${fundID}&kind=original`);
		expect(ownedOriginal.status).toBe(200);
		expect(new Uint8Array(await ownedOriginal.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
	});
});

describe('publishing', () => {
	it('lets the owner publish a valid draft and hides drafts from the public query', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const other = await asUser(t, lee);
		const fundID = await owner.mutation(api.funds.create, draft);

		expect(await t.query(api.funds.getPublic, { fundID })).toBeNull();
		expect(await t.query(api.funds.getPublic, { fundID: 'nope' })).toBeNull();
		expect(await t.query(api.funds.getPublic, { fundID: 'zzz' })).toBeNull();

		await expect(other.mutation(api.funds.publish, { fundID })).rejects.toThrow(/Fund not found/);
		await expect(owner.mutation(api.funds.publish, { fundID: 'zzz' })).rejects.toThrow(/Fund not found/);

		const published = await owner.mutation(api.funds.publish, { fundID });
		expect(published).toMatchObject({ fundID, title: draft.title, status: 'live' });
		expect(published.publishedAt).toBeGreaterThan(0);

		const pub = await t.query(api.funds.getPublic, { fundID });
		expect(pub).toMatchObject({
			fundID,
			title: draft.title,
			goal: 50_000,
			status: 'live',
			hasCover: false,
			organiserName: 'Maya Otieno'
		});
		expect(pub?.story).toContain('Maya');
		expect(pub).not.toHaveProperty('ownerId');
		expect(pub).not.toHaveProperty('email');
		expect(pub).not.toHaveProperty('idempotencyKey');
		expect(pub).not.toHaveProperty('coverStorageId');
		expect(pub).not.toHaveProperty('coverOriginalStorageId');
		expect(pub).not.toHaveProperty('coverCrop');
		expect(pub).not.toHaveProperty('coverName');
		expect(pub).not.toHaveProperty('coverSkipped');
		expect(JSON.stringify(pub)).not.toMatch(/maya@example.com/);

		expect((await owner.query(api.funds.getPreview, { fundID }))?.status).toBe('live');
		const listed = await owner.query(api.funds.listMine, { paginationOpts: { numItems: 10, cursor: null } });
		expect(listed.page[0]?.status).toBe('live');
	});

	it('keeps publishedAt on repeat publish and after owner edits or create retries', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const fundID = await owner.mutation(api.funds.create, draft);
		await owner.mutation(api.funds.publish, { fundID });
		await t.run(async (ctx) => {
			const fund = await ctx.db
				.query('funds')
				.withIndex('by_fundID', (q) => q.eq('fundID', fundID))
				.unique();
			if (!fund) throw new Error('missing fund');
			await ctx.db.patch(fund._id, { publishedAt: 42 });
		});

		const again = await owner.mutation(api.funds.publish, { fundID });
		expect(again.publishedAt).toBe(42);
		expect((await t.query(api.funds.getPublic, { fundID }))?.publishedAt).toBe(42);

		await owner.mutation(api.funds.update, {
			fundID,
			goal: 75_000,
			title: 'Help Maya fly home',
			story: draft.story,
			coverSkipped: true,
			cover: 'keep'
		});
		expect(await t.query(api.funds.getPublic, { fundID })).toMatchObject({
			title: 'Help Maya fly home',
			goal: 75_000,
			status: 'live',
			publishedAt: 42
		});

		await owner.mutation(api.funds.create, { ...draft, title: 'Still live' });
		expect(await t.query(api.funds.getPublic, { fundID })).toMatchObject({
			title: 'Still live',
			status: 'live',
			publishedAt: 42
		});
	});
});
