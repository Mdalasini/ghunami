import { ConvexProviderWithAuth } from 'convex/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useFetchers, useLocation } from 'react-router';

import { convex } from '../lib/convex';

async function requestToken(force: boolean): Promise<string | null> {
	try {
		const response = await fetch(force ? '/auth/token?force=1' : '/auth/token');
		if (!response.ok) return null;
		const data = (await response.json()) as { token: string | null };
		return data.token ?? null;
	} catch {
		return null;
	}
}

let inflight: Promise<string | null> | null = null;

/**
 * WorkOS rotates refresh tokens, so two overlapping refreshes invalidate each
 * other and sign the user out. Ordinary reads share one request — on page load
 * the mount check and Convex's own fetch happen together. A forced refresh is
 * never deduped: Convex asks for one precisely when it knows the token is stale.
 */
function readToken(force: boolean): Promise<string | null> {
	if (force) {
		return requestToken(true);
	}
	if (!inflight) {
		inflight = requestToken(false).finally(() => {
			inflight = null;
		});
	}
	return inflight;
}

/** Login and sign-out go through fetchers; the cookie changes, the tree does not remount. */
function sessionWriteInFlight(fetchers: ReturnType<typeof useFetchers>): boolean {
	return fetchers.some((fetcher) => {
		if (fetcher.state === 'idle') return false;
		const action = fetcher.formAction ?? '';
		return action.includes('/signin') || action.includes('/auth/signout');
	});
}

/**
 * Convex's auth seam. The session itself lives in an httpOnly cookie the
 * browser cannot read, so the access token is fetched from our own route rather
 * than held in JS. `undefined` means we have not asked yet.
 */
function useServerAuth() {
	const [token, setToken] = useState<string | null | undefined>(undefined);
	const location = useLocation();
	const writing = sessionWriteInFlight(useFetchers());

	useEffect(() => {
		if (writing) return;
		let cancelled = false;
		// Cookie may have just changed — do not reuse a request from the old session.
		inflight = requestToken(false).finally(() => {
			inflight = null;
		});
		void inflight.then((value) => {
			if (!cancelled) setToken(value);
		});
		return () => {
			cancelled = true;
		};
		// location.key: login redirects off /signin and unmounts that fetcher.
		// writing: sign-out posts while already on /, so the URL never changes.
	}, [location.key, writing]);

	const fetchAccessToken = useCallback(
		async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
			const value = await readToken(forceRefreshToken);
			setToken(value);
			return value;
		},
		[]
	);

	return {
		isLoading: token === undefined,
		isAuthenticated: token != null,
		fetchAccessToken
	};
}


export function ConvexClientProvider({ children }: { children: ReactNode }) {
	return (
		<ConvexProviderWithAuth client={convex} useAuth={useServerAuth}>

			{children}
		</ConvexProviderWithAuth>
	);
}
