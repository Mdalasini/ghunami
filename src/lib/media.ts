export function coverMediaUrl(fundID: string, kind: 'cover' | 'original' = 'cover') {
	return kind === 'original' ? `/media/${fundID}?kind=original` : `/media/${fundID}`;
}

export function convexSiteUrl(): string {
	const explicit = import.meta.env.VITE_CONVEX_SITE_URL;
	if (typeof explicit === 'string' && explicit) return explicit.replace(/\/$/, '');
	return import.meta.env.VITE_CONVEX_URL.replace(/\.convex\.cloud\b/, '.convex.site');
}
