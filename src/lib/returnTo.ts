/**
 * Only same-origin, path-shaped destinations survive, so `?returnTo=` can never
 * be used to bounce a freshly signed-in user off to someone else's site.
 */
export function safeReturnTo(value: string | null | undefined): string {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
		return '/';
	}
	return value;
}
