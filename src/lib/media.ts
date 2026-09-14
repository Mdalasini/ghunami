export function coverMediaUrl(fundID: string, kind: 'cover' | 'original' = 'cover', version?: number) {
	const params = new URLSearchParams();
	if (kind === 'original') params.set('kind', 'original');
	if (version !== undefined) params.set('v', String(version));
	const query = params.toString();
	return query ? `/media/${fundID}?${query}` : `/media/${fundID}`;
}

export function convexSiteUrl(): string {
	const explicit = import.meta.env.VITE_CONVEX_SITE_URL;
	if (typeof explicit === 'string' && explicit) return explicit.replace(/\/$/, '');
	return import.meta.env.VITE_CONVEX_URL.replace(/\.convex\.cloud\b/, '.convex.site');
}
