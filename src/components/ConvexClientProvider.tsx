import { ConvexProviderWithAuthKit } from '@convex-dev/workos';
import { AuthKitProvider, useAuth } from '@workos-inc/authkit-react';
import { ConvexProvider, useConvexAuth, useMutation } from 'convex/react';
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../convex/_generated/api';
import { convex } from '../lib/convex';

const workosClientId = import.meta.env.VITE_WORKOS_CLIENT_ID;
const workosRedirectUri =
	import.meta.env.VITE_WORKOS_REDIRECT_URI ?? 'http://localhost:5173/callback';

function returnPath(state: Record<string, unknown> | null | undefined): string {
	const returnTo = state?.returnTo;
	if (typeof returnTo !== 'string') return '/';
	try {
		const url = new URL(returnTo, window.location.origin);
		if (url.origin !== window.location.origin) return '/';
		return `${url.pathname}${url.search}${url.hash}` || '/';
	} catch {
		return '/';
	}
}

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

function AuthedConvex({ children }: { children: ReactNode }) {
	return (
		<ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
			<EnsureUser />
			{children}
		</ConvexProviderWithAuthKit>
	);
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
	const navigate = useNavigate();

	if (!workosClientId) {
		return <ConvexProvider client={convex}>{children}</ConvexProvider>;
	}

	return (
		<AuthKitProvider
			clientId={workosClientId}
			redirectUri={workosRedirectUri}
			onRedirectCallback={({ state }) => {
				void navigate(returnPath(state), { replace: true });
			}}
		>
			<AuthedConvex>{children}</AuthedConvex>
		</AuthKitProvider>
	);
}
