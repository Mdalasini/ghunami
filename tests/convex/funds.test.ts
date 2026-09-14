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
	it('rejects unauthenticated create, read, update, list, and uploads', async () => {
		const t = harness();
		await expect(t.mutation(api.funds.create, draft)).rejects.toThrow(/Not authenticated/);
		await expect(t.query(api.funds.getPreview, { fundID: 'Ab3' })).rejects.toThrow(/Not authenticated/);
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

	it('is idempotent per owner key and sanitizes story HTML', async () => {
		const t = harness();
		const owner = await asUser(t, maya);
		const a = await owner.mutation(api.funds.create, {
			...draft,
			story: '<p onclick="x()">Hello <script>alert(1)</script><b>there</b></p>'
		});
		const b = await owner.mutation(api.funds.create, { ...draft, title: 'Duplicate' });
		expect(b).toBe(a);
		const preview = await owner.query(api.funds.getPreview, { fundID: a });
		expect(preview?.title).toBe('Help Maya get home');
		expect(preview?.story).toBe('<p>Hello <strong>there</strong></p>');
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
});
