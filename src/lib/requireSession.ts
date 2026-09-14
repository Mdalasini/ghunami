import { redirect } from 'react-router';
import { loadServerEnv } from './env.server';
import { safeReturnTo } from './returnTo';
import { readSession } from './session.server';

export function requireSession(request: Request): void {
	loadServerEnv();
	if (readSession(request)) return;
	const url = new URL(request.url);
	const returnTo = safeReturnTo(`${url.pathname}${url.search}`);
	throw redirect(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
}
