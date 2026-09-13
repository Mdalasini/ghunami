import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { api, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { modules } from './modules';

function harness() {
	return convexTest(schema, modules);
}

const maya = {
	issuer: 'https://example.test',
	workosUserId: 'maya',
	email: '  Maya@Example.COM ',
	firstName: 'Maya',
	lastName: 'Otieno'
};

describe('users', () => {
	it('me returns null when unauthenticated or the user is missing', async () => {
		const t = harness();
		expect(await t.query(api.users.me, {})).toBeNull();
		const ghost = t.withIdentity({ subject: 'missing', issuer: maya.issuer });
		expect(await ghost.query(api.users.me, {})).toBeNull();
	});

	it('me returns exactly the caller’s public fields, even for legacy rows', async () => {
		const t = harness();
		const id = await t.mutation(internal.users.upsertFromWorkOS, maya);
		await t.run(async (ctx) => ctx.db.patch(id, { role: 'admin', pictureUrl: 'https://example.test/avatar' }));
		await t.mutation(internal.users.upsertFromWorkOS, {
			...maya, workosUserId: 'lee', email: 'lee@example.com', firstName: 'Lee'
		});
		const caller = t.withIdentity({ subject: 'maya', issuer: maya.issuer });
		expect(await caller.query(api.users.me, {})).toEqual({
			_id: id, name: 'Maya Otieno', email: 'maya@example.com'
		});
	});

	it('upserts verified identities in place without writing legacy fields', async () => {
		const t = harness();
		const id = await t.mutation(internal.users.upsertFromWorkOS, {
			...maya, firstName: null, lastName: null
		});
		const original = await t.run(async (ctx) => ctx.db.get(id));
		expect(original).toEqual({
			_id: id, _creationTime: expect.any(Number),
			tokenIdentifier: 'https://example.test|maya',
			name: 'maya@example.com', email: 'maya@example.com'
		});
		expect(await t.mutation(internal.users.upsertFromWorkOS, maya)).toBe(id);
		expect(await t.run(async (ctx) => ctx.db.get(id))).toEqual({
			...original, name: 'Maya Otieno'
		});
	});

	it('keeps distinct identities separate even when emails match', async () => {
		const t = harness();
		const a = await t.mutation(internal.users.upsertFromWorkOS, maya);
		const b = await t.mutation(internal.users.upsertFromWorkOS, { ...maya, workosUserId: 'other' });
		expect(a).not.toBe(b);
		expect(await t.run(async (ctx) => ctx.db.query('users').collect())).toHaveLength(2);
	});

	it('cleans legacy rows in resumable pages without changing identity or native metadata', async () => {
		const t = harness();
		await t.run(async (ctx) => {
			for (let i = 0; i < 105; i++) {
				await ctx.db.insert('users', {
					tokenIdentifier: `https://example.test|${i}`,
					name: 'Legacy', email: 'legacy@example.com',
					role: i === 0 ? 'admin' : 'user', pictureUrl: 'https://example.test/avatar',
					createdAt: 1, updatedAt: 2
				});
			}
		});
		const before = await t.run(async (ctx) => ctx.db.query('users').collect());
		const first = await t.mutation(internal.migrations.removeLegacyUserFields, { cursor: null });
		expect(first).toMatchObject({ processed: 100, isDone: false });
		const second = await t.mutation(internal.migrations.removeLegacyUserFields, { cursor: first.cursor });
		expect(second).toMatchObject({ processed: 5, isDone: true });
		const expected = before.map(({ role, pictureUrl, createdAt, updatedAt, ...row }) => row);
		expect(await t.run(async (ctx) => ctx.db.query('users').collect())).toEqual(expected);
		await t.mutation(internal.users.upsertFromWorkOS, {
			...maya, workosUserId: '0', firstName: 'Legacy', lastName: null, email: 'legacy@example.com'
		});
		let cursor: string | null = null;
		for (;;) {
			const result: { cursor: string; isDone: boolean; processed: number } =
							await t.mutation(internal.migrations.removeLegacyUserFields, { cursor });
			if (result.isDone) break;
			cursor = result.cursor;
		}
		expect(await t.run(async (ctx) => ctx.db.query('users').collect())).toEqual(expected);
	});
});
