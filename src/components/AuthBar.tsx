import { useConvexAuth, useQuery } from 'convex/react';
import { Link, useFetcher, useLocation } from 'react-router';
import { api } from '../../convex/_generated/api';

const control =
	'font-ui rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-sun';

export function AuthBar() {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
	const signOut = useFetcher();
	const location = useLocation();

	if (isLoading) {
		return (
			<span className={`${control} invisible`} aria-hidden="true">
				Log in
			</span>
		);
	}

	if (!isAuthenticated) {
		const returnTo = `${location.pathname}${location.search}`;
		return (
			<Link className={control} to={`/signin?returnTo=${encodeURIComponent(returnTo)}`}>
				Log in
			</Link>
		);
	}

	const label = me?.name || me?.email || 'Signed in';

	return (
		<div className="flex items-center gap-3">
			<span className="max-w-40 truncate text-sm font-medium text-mute">{label}</span>
			<signOut.Form method="post" action="/auth/signout">
				<button type="submit" className={control}>
					Sign out
				</button>
			</signOut.Form>
		</div>
	);
}
