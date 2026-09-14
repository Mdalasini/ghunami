import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareOrCopyUrl } from '../../src/lib/share';

describe('shareOrCopyUrl', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('uses the Web Share API and treats abort as cancellation', async () => {
		const share = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
		await expect(shareOrCopyUrl('https://ghunami.test/f/Ab3/help-maya-get-home')).resolves.toBe('shared');
		expect(share).toHaveBeenCalledWith({ url: 'https://ghunami.test/f/Ab3/help-maya-get-home' });

		share.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'AbortError' }));
		await expect(shareOrCopyUrl('https://ghunami.test/f/Ab3/help-maya-get-home')).resolves.toBe('cancelled');
		expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
	});

	it('copies when share is missing', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		await expect(shareOrCopyUrl('https://ghunami.test/f/Ab3/fund')).resolves.toBe('copied');
		expect(writeText).toHaveBeenCalledWith('https://ghunami.test/f/Ab3/fund');
	});
});
