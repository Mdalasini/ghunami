import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { api, internal } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { getCurrentUser, requireAdmin } from '../../convex/lib/auth';
import { modules } from './modules';

function harness() {
	return convexTest(schema, modules);
}

describe('users', () => {
	it('me returns null when unauthenticated or the user is missing', async () => {
		const t = harness();
		expect(await t.query(api.users.me, {})).toBeNull();

		const asGhost = t.withIdentity({ subject: 'missing', issuer: 'https://example.test' });
		expect(await asGhost.query(api.users.me, {})).toBeNull();
	});

	it('me returns only the caller’s public fields', async () => {
		const t = harness();
		const asMaya = t.withIdentity({
			subject: 'maya',
			issuer: 'https://example.test',
			name: 'Maya',
			email: 'maya@example.com'
		});
		const asLee = t.withIdentity({
			subject: 'lee',
			issuer: 'https://example.test',
			name: 'Lee',
			email: 'lee@example.com'
		});

		await asMaya.mutation(api.users.storeUser, {});
		await asLee.mutation(api.users.storeUser, {});

		const me = await asMaya.query(api.users.me, {});
		expect(me).toMatchObject({
			name: 'Maya',
			email: 'maya@example.com',
			role: 'user'
		});
		expect(me).not.toMatchObject({ email: 'lee@example.com' });
		expect(me).not.toHaveProperty('tokenIdentifier');
	});

	it('storeUser rejects unauthenticated callers', async () => {
		const t = harness();
		await expect(t.mutation(api.users.storeUser, {})).rejects.toThrow('Not authenticated');
	});

	it('creates a user with role user and normalized email, then reuses the row', async () => {
		const t = harness();
		const asMaya = t.withIdentity({
			subject: 'maya',
			issuer: 'https://example.test',
			name: 'Maya',
			email: '  Maya@Example.COM '
		});

		const first = await asMaya.mutation(api.users.storeUser, {});
		const second = await asMaya.mutation(api.users.storeUser, {});
		expect(second).toBe(first);

		const row = await t.run(async (ctx) => ctx.db.get(first));
		expect(row).toMatchObject({
			email: 'maya@example.com',
			role: 'user',
			name: 'Maya'
		});
	});

	it('does not overwrite verified name and email with blank access-token claims', async () => {
		const t = harness();
		const id = await t.mutation(internal.users.upsertFromWorkOS, {
			issuer: 'https://api.workos.com/user_management/test',
			workosUserId: 'user_1',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: 'Otieno'
		});

		const asMaya = t.withIdentity({
			tokenIdentifier: 'https://api.workos.com/user_management/test|user_1',
			subject: 'user_1',
			issuer: 'https://api.workos.com/user_management/test'
		});
		await asMaya.mutation(api.users.storeUser, {});

		const row = await t.run(async (ctx) => ctx.db.get(id));
		expect(row).toMatchObject({
			name: 'Maya Otieno',
			email: 'maya@example.com'
		});
	});

	it('does not demote an existing admin or insert a second record', async () => {
		const t = harness();
		const tokenIdentifier = 'https://example.test|admin-1';
		const existingId = await t.run(async (ctx) =>
			ctx.db.insert('users', {
				tokenIdentifier,
				name: 'Ada',
				email: 'ada@example.com',
				role: 'admin',
				createdAt: 1
			})
		);

		const asAdmin = t.withIdentity({
			tokenIdentifier,
			subject: 'admin-1',
			issuer: 'https://example.test',
			name: 'Ada',
			email: 'ada@example.com'
		});
		const returned = await asAdmin.mutation(api.users.storeUser, {});
		expect(returned).toBe(existingId);

		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({ role: 'admin', email: 'ada@example.com' });
	});

	it('upsertFromWorkOS maps issuer/subject, normalizes email, and updates in place', async () => {
		const t = harness();
		const first = await t.mutation(internal.users.upsertFromWorkOS, {
			issuer: 'https://api.workos.com/user_management/test',
			workosUserId: 'user_1',
			email: '  Maya@Example.COM ',
			firstName: null,
			lastName: null
		});
		const row = await t.run(async (ctx) => ctx.db.get(first));
		expect(row).toMatchObject({
			tokenIdentifier: 'https://api.workos.com/user_management/test|user_1',
			email: 'maya@example.com',
			name: 'maya@example.com'
		});

		const second = await t.mutation(internal.users.upsertFromWorkOS, {
			issuer: 'https://api.workos.com/user_management/test',
			workosUserId: 'user_1',
			email: 'maya@example.com',
			firstName: 'Maya',
			lastName: 'Otieno'
		});
		expect(second).toBe(first);
		const updated = await t.run(async (ctx) => ctx.db.get(first));
		expect(updated).toMatchObject({ name: 'Maya Otieno', email: 'maya@example.com' });
	});

	it('keeps distinct identities separate even when emails match', async () => {
		const t = harness();
		const a = await t.mutation(internal.users.upsertFromWorkOS, {
			issuer: 'https://api.workos.com/user_management/test',
			workosUserId: 'user_a',
			email: 'shared@example.com',
			firstName: 'A',
			lastName: null
		});
		const b = await t.mutation(internal.users.upsertFromWorkOS, {
			issuer: 'https://api.workos.com/user_management/test',
			workosUserId: 'user_b',
			email: 'shared@example.com',
			firstName: 'B',
			lastName: null
		});
		expect(a).not.toBe(b);
		const users = await t.run(async (ctx) => ctx.db.query('users').collect());
		expect(users).toHaveLength(2);
	});

	it('requireAdmin and getCurrentUser enforce identity and role', async () => {
		const t = harness();
		await expect(t.query(async (ctx) => getCurrentUser(ctx))).rejects.toThrow('Not authenticated');

		const asUser = t.withIdentity({
			subject: 'user',
			issuer: 'https://example.test',
			email: 'user@example.com',
			name: 'User'
		});
		await asUser.mutation(api.users.storeUser, {});
		await expect(asUser.query(async (ctx) => requireAdmin(ctx))).rejects.toThrow(
			'Admin access required'
		);

		const tokenIdentifier = 'https://example.test|admin-2';
		await t.run(async (ctx) =>
			ctx.db.insert('users', {
				tokenIdentifier,
				name: 'Boss',
				email: 'boss@example.com',
				role: 'admin',
				createdAt: 1
			})
		);
		const asAdmin = t.withIdentity({
			tokenIdentifier,
			subject: 'admin-2',
			issuer: 'https://example.test'
		});
		const admin = await asAdmin.query(async (ctx) => requireAdmin(ctx));
		expect(admin.role).toBe('admin');
	});
});
