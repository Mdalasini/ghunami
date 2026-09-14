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

	it('me returns exactly the caller’s public fields', async () => {
		const t = harness();
		const id = await t.mutation(internal.users.upsertFromWorkOS, maya);
		await t.mutation(internal.users.upsertFromWorkOS, {
			...maya, workosUserId: 'lee', email: 'lee@example.com', firstName: 'Lee'
		});
		const caller = t.withIdentity({ subject: 'maya', issuer: maya.issuer });
		expect(await caller.query(api.users.me, {})).toEqual({
			_id: id, name: 'Maya Otieno', email: 'maya@example.com'
		});
	});

	it('upserts verified identities in place', async () => {
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
});
