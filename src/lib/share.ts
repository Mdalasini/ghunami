export type ShareResult = 'shared' | 'copied' | 'cancelled';

export async function shareOrCopyUrl(url: string): Promise<ShareResult> {
	if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
		try {
			await navigator.share({ url });
			return 'shared';
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
		}
	}

	if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
		throw new Error('Couldn’t copy the link. Copy it from the address bar.');
	}
	await navigator.clipboard.writeText(url);
	return 'copied';
}
