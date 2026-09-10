import { data, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { AuthShell } from '../components/AuthShell';
import { convexServer } from '../lib/convex.server';
import { loadServerEnv } from '../lib/env.server';
import { clearedOAuthStateCookie, validateOAuthState } from '../lib/oauthState.server';
import { sessionCookie } from '../lib/session.server';

export function meta() {
	return [{ title: 'Signing in · Ghunami' }];
}

/** Lands here after Google. Exchanges the code and seals the session. */
export async function loader({ request }: LoaderFunctionArgs) {
	loadServerEnv();
	const url = new URL(request.url);
	const headers = new Headers({ 'Cache-Control': 'no-store' });
	const state = await validateOAuthState(request);
	if (!state) {
		return data({ error: 'Sign-in expired or could not be verified. Please try again.' }, {
			status: 400,
			headers
		});
	}

	// A stale callback must not consume a newer login attempt's browser cookie.
	headers.append('Set-Cookie', await clearedOAuthStateCookie());
	const code = url.searchParams.get('code');
	if (url.searchParams.has('error') || !code) {
		return data({ error: 'Sign-in was cancelled.' }, { headers });
	}

	try {
		const result = await convexServer().action(api.authFlow.exchangeCode, { code });
		if (!result.session) {
			return data({ error: result.error ?? 'Sign-in failed. Try again.' }, { headers });
		}
		headers.append('Set-Cookie', sessionCookie(result.session));
		return redirect(state.returnTo, { headers });
	} catch {
		return data({ error: 'Sign-in failed. Try again.' }, { status: 502, headers });
	}
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
