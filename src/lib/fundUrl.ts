/** Runtime slug from the current title. Not stored; fundID is the identity. */

export function slugifyTitle(title: string): string {
	const slug = title
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
	return slug || 'fund';
}

function encodeSegment(value: string): string {
	return encodeURIComponent(value);
}

function decodePathname(pathname: string): string {
	return pathname
		.split('/')
		.map((segment) => {
			try {
				return decodeURIComponent(segment);
			} catch {
				return segment;
			}
		})
		.join('/');
}

export function fundPath(fundID: string, title: string): string {
	return `/f/${encodeSegment(fundID)}/${encodeSegment(slugifyTitle(title))}`;
}

export function isCanonicalFundPath(pathname: string, fundID: string, title: string): boolean {
	return decodePathname(pathname) === decodePathname(fundPath(fundID, title));
}

export function absoluteFundUrl(origin: string, fundID: string, title: string): string {
	return `${origin.replace(/\/$/, '')}${fundPath(fundID, title)}`;
}
