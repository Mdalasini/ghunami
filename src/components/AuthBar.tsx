import { useEffect, useRef, useState } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { Link, useFetcher, useLocation } from 'react-router';
import { api } from '../../convex/_generated/api';
import { safeReturnTo } from '../lib/returnTo';

const control =
	'font-ui rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-sun';

function canHover() {
	return window.matchMedia('(hover: hover)').matches;
}

export function AuthBar() {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
	const signOut = useFetcher();
	const location = useLocation();
	const root = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('pointerdown', close);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', close);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	if (isLoading) {
		return (
			<span className={`${control} invisible`} aria-hidden="true">
				Log in
			</span>
		);
	}

	if (!isAuthenticated) {
		const returnTo = safeReturnTo(`${location.pathname}${location.search}`);
		return (
			<Link className={control} to={`/signin?returnTo=${encodeURIComponent(returnTo)}`}>
				Log in
			</Link>
		);
	}

	const label = me?.name || me?.email || 'Signed in';

	return (
		<div
			ref={root}
			className="relative"
			onMouseEnter={() => {
				if (canHover()) setOpen(true);
			}}
			onMouseLeave={() => {
				if (canHover()) setOpen(false);
			}}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
			}}
		>
			<button
				type="button"
				className="font-ui max-w-40 truncate rounded-full px-3 py-2 text-sm font-medium"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={(event) => {
					if (event.detail !== 0 && canHover()) return;
					setOpen((value) => !value);
				}}
			>
				{label}
			</button>
			{open && (
				<div className="absolute right-0 top-full z-10 pt-2">
					<div
						role="menu"
						className="min-w-full rounded-3xl border-2 border-line bg-card p-1.5 shadow-[0_4px_0_0_var(--color-line)]"
					>
						<Link
							to="/funds"
							role="menuitem"
							className="font-ui block w-full whitespace-nowrap rounded-full px-5 py-2.5 text-xs font-extrabold tracking-wider text-mute uppercase hover:bg-paper hover:text-ink"
						>
							My funds
						</Link>
						<signOut.Form method="post" action="/auth/signout">
							<button
								type="submit"
								role="menuitem"
								className="font-ui w-full cursor-pointer whitespace-nowrap rounded-full px-5 py-2.5 text-xs font-extrabold tracking-wider text-mute uppercase hover:bg-paper hover:text-ink"
							>
								Sign out
							</button>
						</signOut.Form>
					</div>
				</div>
			)}
		</div>
	);
}
