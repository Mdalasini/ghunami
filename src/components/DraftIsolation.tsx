import { useEffect, useRef } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { resetDraft } from '../lib/draft';

/** Drop in-memory draft data when the signed-in person changes or signs out. */
export function DraftIsolation() {
	const { isLoading, isAuthenticated } = useConvexAuth();
	const me = useQuery(api.users.me, isAuthenticated ? {} : 'skip');
	const lastUser = useRef<string | null>(null);

	useEffect(() => {
		if (isLoading) return;
		if (!isAuthenticated) {
			if (lastUser.current !== null) resetDraft();
			lastUser.current = null;
			return;
		}
		if (me === undefined) return;
		const id = me?._id ?? null;
		if (lastUser.current && id && lastUser.current !== id) resetDraft();
		if (lastUser.current && id === null) resetDraft();
		lastUser.current = id;
	}, [isLoading, isAuthenticated, me]);

	return null;
}
