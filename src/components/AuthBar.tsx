import { useAuth } from '@workos-inc/authkit-react';
import { useConvexAuth } from 'convex/react';

const control =
	'font-ui rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-sun';

export function AuthBar() {
	if (!import.meta.env.VITE_WORKOS_CLIENT_ID) {
		return null;
	}
	return <AuthControls />;
}

function AuthControls() {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const { user, signIn, signOut } = useAuth();

	if (isLoading) {
		return (
			<span className={`${control} invisible`} aria-hidden="true">
				Sign in
			</span>
		);
	}

	if (!isAuthenticated || !user) {
		return (
			<button type="button" className={control} onClick={() => void signIn()}>
				Sign in
			</button>
		);
	}

	const label = user.firstName || user.email;

	return (
		<div className="flex items-center gap-3">
			<span className="max-w-40 truncate text-sm font-medium text-mute">{label}</span>
			<button type="button" className={control} onClick={() => void signOut()}>
				Sign out
			</button>
		</div>
	);
}
