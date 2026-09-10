/**
 * Only same-origin, path-shaped destinations survive, so `?returnTo=` can never
 * be used to bounce a freshly signed-in user off to someone else's site.
 */
export function safeReturnTo(value: string | null | undefined): string {
	if (typeof value !== 'string' || value.length === 0) {
		return '/';
	}
	if (!value.startsWith('/') || value.startsWith('//') || /[\u0000-\u001f\\]/.test(value)) {
		return '/';
	}

	try {
		const url = new URL(value, 'https://ghunami.invalid');
		if (url.origin !== 'https://ghunami.invalid' || url.username || url.password) {
			return '/';
		}
		const dest = `${url.pathname}${url.search}${url.hash}`;
		if (!dest.startsWith('/') || dest.startsWith('//')) {
			return '/';
		}
		return dest;
	} catch {
		return '/';
	}
}
