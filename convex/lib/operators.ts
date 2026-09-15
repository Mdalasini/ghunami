import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { requireUser } from './auth';

export function operatorTokenAllowlist(
	env: Record<string, string | undefined> = process.env
): string[] {
	return (env.GHUNAMI_OPERATOR_TOKEN_IDENTIFIERS ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}

export function isOperatorToken(
	tokenIdentifier: string,
	env: Record<string, string | undefined> = process.env
): boolean {
	const allowlist = operatorTokenAllowlist(env);
	return allowlist.length > 0 && allowlist.includes(tokenIdentifier);
}

export async function requireOperator(ctx: QueryCtx | MutationCtx): Promise<{
	user: Doc<'users'>;
	tokenIdentifier: string;
}> {
	const user = await requireUser(ctx);
	const identity = await ctx.auth.getUserIdentity();
	if (!identity || !isOperatorToken(identity.tokenIdentifier)) {
		throw new Error('Not authorized.');
	}
	return { user, tokenIdentifier: identity.tokenIdentifier };
}
