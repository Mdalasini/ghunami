import { redirect, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { convexServer } from '../lib/convex.server';
import { loadServerEnv } from '../lib/env.server';
import { safeReturnTo } from '../lib/returnTo';

/**
 * The one hop off-site we keep. It goes to Google, not to a WorkOS-branded
 * page, so the flow still reads as ours.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	loadServerEnv();
	const url = new URL(request.url);
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	const redirectUri = new URL('/callback', url.origin).toString();

	const authUrl = await convexServer().action(api.authFlow.googleUrl, {
		redirectUri,
		state: JSON.stringify({ returnTo })
	});

	return redirect(authUrl);
}
