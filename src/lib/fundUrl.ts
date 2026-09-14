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
	return `/f/${encodeURIComponent(fundID)}/${encodeURIComponent(slugifyTitle(title))}`;
}

export function isCanonicalFundPath(pathname: string, fundID: string, title: string): boolean {
	const documentPath = pathname.replace(/\.data$/, '');
	return decodePathname(documentPath) === decodePathname(fundPath(fundID, title));
}
