import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { AuthShell } from '../components/AuthShell';
import { convexServer } from '../lib/convex.server';
import { loadServerEnv } from '../lib/env.server';
import { safeReturnTo } from '../lib/returnTo';
import { sessionCookie } from '../lib/session.server';

export function meta() {
	return [{ title: 'Signing in · Ghunami' }];
}

function returnFromState(state: string | null): string {
	if (!state) return '/';
	try {
		return safeReturnTo(JSON.parse(state).returnTo);
	} catch {
		return '/';
	}
}

/** Lands here after Google. Exchanges the code and seals the session. */
export async function loader({ request }: LoaderFunctionArgs) {
	loadServerEnv();
	const url = new URL(request.url);
	const code = url.searchParams.get('code');

	if (!code) {
		return { error: url.searchParams.get('error_description') ?? 'Sign-in was cancelled.' };
	}

	const result = await convexServer().action(api.authFlow.exchangeCode, { code });

	if (!result.session) {
		return { error: result.error ?? 'Sign-in failed. Try again.' };
	}

	return redirect(returnFromState(url.searchParams.get('state')), {
		headers: { 'Set-Cookie': sessionCookie(result.session) }
	});
}

export default function Callback() {
	const { error } = useLoaderData<typeof loader>();

	return (
		<AuthShell title="That didn’t go through" sub={error}>
			<a href="/signin" className="btn-press w-full bg-accent text-card hover:bg-accent-deep">
				Try again
			</a>
		</AuthShell>
	);
}
