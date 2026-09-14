import { describe, expect, it, vi } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import type { CreateDraft } from '../../src/lib/draft';
import { draftFromPreview, persistDraft } from '../../src/lib/persistFund';

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

	it('copies preview fields and loads a saved original when present', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string | URL | Request) => {
				expect(String(url)).toBe('/media/Ab3?kind=original');
				return new Response(new Blob([new Uint8Array(4)], { type: 'image/jpeg' }));
			})
		);
		try {
			const next = await draftFromPreview(
				{
					fundID: 'Ab3',
					goal: 50_000,
					title: 'Help Maya get home',
					story: '<p>Raising travel money.</p>',
					coverSkipped: false,
					hasCover: true,
					hasOriginal: true,
					coverCrop: { x: 0, y: 0, width: 80, height: 80 },
					coverName: 'cover.jpg'
				},
				{ original: true }
			);
			expect(next).toMatchObject({
				fundID: 'Ab3',
				goal: 50_000,
				title: 'Help Maya get home',
				coverUrl: '/media/Ab3',
				coverName: 'cover.jpg',
				coverEdit: { crop: { x: 0, y: 0, width: 80, height: 80 } }
			});
			expect(next.coverEdit?.original.name).toBe('cover.jpg');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('skips fetching an original when the preview has none', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		try {
			const next = await draftFromPreview({
				fundID: 'Ab3',
				goal: 50_000,
				title: 'Help Maya get home',
				story: '<p>Raising travel money.</p>',
				coverSkipped: true,
				hasCover: false,
				hasOriginal: false
			});
			expect(fetchMock).not.toHaveBeenCalled();
			expect(next).toMatchObject({ coverUrl: '', coverEdit: undefined, coverSkipped: true });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('does not fetch an original unless asked', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		try {
			const next = await draftFromPreview({
				fundID: 'Ab3',
				goal: 50_000,
				title: 'Help Maya get home',
				story: '<p>Raising travel money.</p>',
				coverSkipped: false,
				hasCover: true,
				hasOriginal: true,
				coverCrop: { x: 0, y: 0, width: 80, height: 80 },
				coverName: 'cover.jpg'
			});
			expect(fetchMock).not.toHaveBeenCalled();
			expect(next.coverEdit).toBeUndefined();
			expect(next.coverUrl).toBe('/media/Ab3');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
