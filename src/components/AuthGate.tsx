import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { HorizonDisc } from './HorizonMark';
import { useSessionAuth } from './ConvexClientProvider';
import { safeReturnTo } from '../lib/returnTo';

export function AuthGate({ children }: { children: ReactNode }) {
	const { isLoading, isAuthenticated } = useSessionAuth();
	const navigate = useNavigate();
	const location = useLocation();

	useEffect(() => {
		if (isLoading || isAuthenticated) return;
		const returnTo = safeReturnTo(`${location.pathname}${location.search}`);
		void navigate(`/signin?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
	}, [isLoading, isAuthenticated, location.pathname, location.search, navigate]);

	if (isLoading || !isAuthenticated) {
		return (
			<div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper">
				<HorizonDisc className="h-14 w-14 [&_svg]:h-6" />
				<p className="text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
			</div>
		);
	}

	return children;
}
