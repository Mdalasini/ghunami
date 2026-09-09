import { ConvexProviderWithAuth, useConvexAuth, useMutation } from 'convex/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../../convex/_generated/api';
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

/**
 * Convex's auth seam. The session itself lives in an httpOnly cookie the
 * browser cannot read, so the access token is fetched from our own route rather
 * than held in JS. `undefined` means we have not asked yet.
 */
function useServerAuth() {
	const [token, setToken] = useState<string | null | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		void readToken(false).then((value) => {
			if (!cancelled) setToken(value);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const fetchAccessToken = useCallback(
		({ forceRefreshToken }: { forceRefreshToken: boolean }) => readToken(forceRefreshToken),
		[]
	);

	return {
		isLoading: token === undefined,
		isAuthenticated: token != null,
		fetchAccessToken
	};
}

/** Mirrors the WorkOS identity into the `users` table on first sight. */
function EnsureUser() {
	const { isAuthenticated } = useConvexAuth();
	const storeUser = useMutation(api.users.storeUser);

	useEffect(() => {
		if (isAuthenticated) {
			void storeUser();
		}
	}, [isAuthenticated, storeUser]);

	return null;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
	return (
		<ConvexProviderWithAuth client={convex} useAuth={useServerAuth}>
			<EnsureUser />
			{children}
		</ConvexProviderWithAuth>
	);
}
