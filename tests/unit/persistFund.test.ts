import { describe, expect, it, vi } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import type { CreateDraft } from '../../src/lib/draft';
import { persistDraft } from '../../src/lib/persistFund';

const draft = {
	fundID: '',
	idempotencyKey: 'create-1-aaaaaaaa',
	goal: 50_000,
	coverUrl: '',
	coverName: '',
	coverSkipped: true,
	title: 'Help Maya get home',
	story: '<p>Raising travel money.</p>'
} satisfies CreateDraft;

describe('persistDraft', () => {
	it('discards newly registered uploads when create fails', async () => {
		const discardUpload = vi.fn(async () => null);
		const coverUploadId = 'jd7fj3k1m0n2p4q5r6s7t8u9w' as Id<'uploads'>;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL | Request) => {
				if (String(url) === 'blob:cover') {
					return new Response(new Blob([new Uint8Array(4)], { type: 'image/jpeg' }));
				}
				return Response.json({ storageId: 'kg7fj3k1m0n2p4q5r6s7t8u9x' });
			})
		);

		try {
			await expect(
				persistDraft({
					draft: { ...draft, coverUrl: 'blob:cover', coverName: 'cover.jpg', coverSkipped: false },
					generateUploadUrl: async () => 'http://127.0.0.1/upload',
					registerUpload: async () => coverUploadId,
					discardUpload,
					create: async () => {
						throw new Error('Enter a title.');
					},
					update: async () => 'Ab3'
				})
			).rejects.toThrow(/title/);
			expect(discardUpload).toHaveBeenCalledWith({ uploadId: coverUploadId });
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
