import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { heicTo, isHeic } from 'heic-to';
import {
	assessCropResolution,
	coverZoomLimit,
	maxCoverZoom,
	percentToZoom,
	zoomOneCrop,
	zoomToPercent,
	COVER_ASPECT,
	bitmapFromCoverFile,
	clampPixelCrop,
	COVER_MESSAGES,
	COVER_QUALITY_FLOOR,
	coverFileName,
	isAcceptedCoverFile,
	looksLikeHeic,
	MAX_COVER_OUTPUT_BYTES,
	MAX_COVER_UPLOAD_BYTES,
	percentCropToPixels,
	pickEncodedBlob,
	encodeCoverCanvas,
	processCoverCrop,
	decodeCoverImage,
	releaseDecodedCover,
	COVER_QUALITY_STEPS,
	validateCoverFile
} from '../../src/lib/coverImage';

vi.mock('heic-to', () => ({ heicTo: vi.fn(), isHeic: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetAllMocks();
});

function file(name: string, type: string, size = 32): File {
	return new File([new Uint8Array(size)], name, { type });
}

describe('cover image validation', () => {
	it('accepts common still-image types and extensions, including HEIC', () => {
		expect(isAcceptedCoverFile(file('a.jpg', 'image/jpeg'))).toBe(true);
		expect(isAcceptedCoverFile(file('a.jpeg', 'image/jpeg'))).toBe(true);
		expect(isAcceptedCoverFile(file('a.png', 'image/png'))).toBe(true);
		expect(isAcceptedCoverFile(file('a.webp', 'image/webp'))).toBe(true);
		expect(isAcceptedCoverFile(file('a.heic', 'image/heic'))).toBe(true);
		expect(isAcceptedCoverFile(file('a.HEIF', 'image/heif'))).toBe(true);
		expect(isAcceptedCoverFile(file('IMG_0001.HEIC', ''))).toBe(true);
		expect(isAcceptedCoverFile(file('photo.jpg', ''))).toBe(true);
	});

	it('rejects unsupported types even when the MIME looks like an image', () => {
		expect(isAcceptedCoverFile(file('a.gif', 'image/gif'))).toBe(false);
		expect(isAcceptedCoverFile(file('a.svg', 'image/svg+xml'))).toBe(false);
		expect(isAcceptedCoverFile(file('notes.txt', 'text/plain'))).toBe(false);
		expect(isAcceptedCoverFile(file('file', ''))).toBe(false);
	});

	it('rejects files over 25 MB before any processing would run', () => {
		const oversized = file('huge.jpg', 'image/jpeg', MAX_COVER_UPLOAD_BYTES + 1);
		expect(validateCoverFile(oversized)).toEqual({
			ok: false,
			error: COVER_MESSAGES.tooLarge
		});
	});

	it('checks the size ceiling before the type, matching the upload gate', () => {
		const oversizedPdf = file('huge.pdf', 'application/pdf', MAX_COVER_UPLOAD_BYTES + 1);
		expect(validateCoverFile(oversizedPdf)).toEqual({
			ok: false,
			error: COVER_MESSAGES.tooLarge
		});
	});

	it('returns a clear error for unsupported files under the size cap', () => {
		expect(validateCoverFile(file('notes.txt', 'text/plain'))).toEqual({
			ok: false,
			error: COVER_MESSAGES.notImage
		});
	});

	it('detects HEIC from type or extension', () => {
		expect(looksLikeHeic(file('a.heic', ''))).toBe(true);
		expect(looksLikeHeic(file('a.bin', 'image/heif'))).toBe(true);
		expect(looksLikeHeic(file('a.jpg', 'image/jpeg'))).toBe(false);
	});
});

describe('crop resolution', () => {
	it.each([[720, 900], [1080, 1350], [4000, 2000], [800, 2200], [12000, 16000]])(
		'keeps the maximum zoom sharp for a %i×%i original',
		(width, height) => {
			const zoom = maxCoverZoom(width, height);
			const cropWidth = Math.min(width, height * COVER_ASPECT) / zoom;
			expect(zoom).toBeGreaterThanOrEqual(1);
			expect(zoom).toBeLessThanOrEqual(4);
			expect(assessCropResolution(Math.round(cropWidth), Math.round(cropWidth / COVER_ASPECT))).toBe('ok');
		}
	);

	it.each([[600, 750], [200, 250], [4000, 674], [719, 900]])(
		'disables zoom for a low-resolution %i×%i original',
		(width, height) => expect(maxCoverZoom(width, height)).toBe(1)
	);

	it('gives no zoom headroom when the widest crop is only just sharp', () => {
		expect(maxCoverZoom(720, 900)).toBe(1);
		expect(maxCoverZoom(721, 901)).toBe(1);
	});

	it('keeps the crop sharp at the limit even after rounding shaves a pixel off each edge', () => {
		const originals: Array<[number, number]> = [[1000, 1250], [1080, 1350], [3024, 4032], [4032, 3024], [1200, 1200]];
		for (const [width, height] of originals) {
			const zoom = maxCoverZoom(width, height);
			const cropWidth = Math.min(width, height * COVER_ASPECT) / zoom;
			const cropHeight = cropWidth / COVER_ASPECT;
			expect(assessCropResolution(Math.round(cropWidth) - 1, Math.round(cropHeight) - 1)).toBe('ok');
		}
	});

	it('derives the limit from the crop the cropper actually shows at zoom 1', () => {
		// A 4000×3000 original shown as a 677.33×508 preview in a 406×508 crop window: the crop is 2400×3000 px.
		const base = zoomOneCrop({ width: 406, height: 508 }, { width: 677.33, height: 508 }, { width: 4000, height: 3000 });
		expect(base.width).toBeCloseTo(2398, 0);
		expect(base.height).toBe(3000);
		expect(coverZoomLimit(base.width, base.height)).toBe(3.32);
		expect(coverZoomLimit(720, 900)).toBe(1);
		expect(coverZoomLimit(600, 750)).toBe(1);
		expect(coverZoomLimit(8000, 10000)).toBe(4);
	});

	it('returns an empty crop when the cropper has not measured anything yet', () => {
		expect(zoomOneCrop({ width: 0, height: 0 }, { width: 0, height: 0 }, { width: 4000, height: 3000 })).toEqual({
			width: 0,
			height: 0
		});
	});

	it('maps the whole slider onto the allowed zoom range', () => {
		expect(zoomToPercent(1, 1.11)).toBe(0);
		expect(zoomToPercent(1.11, 1.11)).toBe(100);
		expect(zoomToPercent(1.055, 1.11)).toBeCloseTo(50);
		expect(percentToZoom(0, 3.33)).toBe(1);
		expect(percentToZoom(100, 3.33)).toBeCloseTo(3.33);
		expect(percentToZoom(50, 3)).toBe(2);
		expect(percentToZoom(150, 3)).toBe(3);
		expect(zoomToPercent(2, 1)).toBe(0);
		expect(percentToZoom(50, 1)).toBe(1);
	});
	it('treats 720×900 and above as sharp', () => {
		expect(assessCropResolution(720, 900)).toBe('ok');
		expect(assessCropResolution(1080, 1350)).toBe('ok');
		expect(assessCropResolution(2000, 2500)).toBe('ok');
	});

	it('warns between 540×675 and just under 720×900', () => {
		expect(assessCropResolution(540, 675)).toBe('soft');
		expect(assessCropResolution(719, 899)).toBe('soft');
		expect(assessCropResolution(720, 899)).toBe('soft');
		expect(assessCropResolution(719, 900)).toBe('soft');
	});

	it('blocks when either cropped edge is under 540×675', () => {
		expect(assessCropResolution(539, 674)).toBe('too_small');
		expect(assessCropResolution(539, 900)).toBe('too_small');
		expect(assessCropResolution(720, 674)).toBe('too_small');
		expect(assessCropResolution(1, 1)).toBe('too_small');
	});

	it('maps a percent crop onto original pixels, not the preview size', () => {
		const pixels = percentCropToPixels(
			{ x: 10, y: 20, width: 50, height: 40 },
			2000,
			2500
		);
		expect(pixels).toEqual({ x: 200, y: 500, width: 1000, height: 1000 });
	});

	it('clamps a crop that spills past the image bounds', () => {
		expect(clampPixelCrop({ x: -8, y: -2, width: 5000, height: 5000 }, 100, 80)).toEqual({
			x: 0,
			y: 0,
			width: 100,
			height: 80
		});
	});
});

describe('cover encoding helpers', () => {
	it('steps quality down until the blob is under 1 MB, without going below the floor', async () => {
		const encode = vi.fn(async (_type: string, quality: number) => {
			const size =
				quality >= 0.9 ? MAX_COVER_OUTPUT_BYTES + 400_000 : MAX_COVER_OUTPUT_BYTES - 50_000;
			return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
		});

		const picked = await pickEncodedBlob(encode, 'image/jpeg');
		expect(encode.mock.calls).toEqual([['image/jpeg', 0.92], ['image/jpeg', 0.86]]);
		expect(picked.size).toBeLessThanOrEqual(MAX_COVER_OUTPUT_BYTES);
	});

	it('keeps the quality floor when every step is still over 1 MB', async () => {
		const encode = vi.fn(async () =>
			new Blob([new Uint8Array(MAX_COVER_OUTPUT_BYTES + 1)], { type: 'image/webp' }));

		const picked = await pickEncodedBlob(encode, 'image/webp');
		expect(encode).toHaveBeenCalledTimes(COVER_QUALITY_STEPS.length);
		expect(encode).toHaveBeenLastCalledWith('image/webp', COVER_QUALITY_FLOOR);
		expect(picked.size).toBeGreaterThan(MAX_COVER_OUTPUT_BYTES);
	});


	it('renames the output to match the encoded type', () => {
		expect(coverFileName('Holiday.HEIC', 'image/jpeg')).toBe('Holiday.jpg');
		expect(coverFileName('Holiday.HEIC', 'image/webp')).toBe('Holiday.webp');
		expect(coverFileName('cover', 'image/jpeg')).toBe('cover.jpg');
	});
});

describe('cover canvas processing', () => {
	const context = { clearRect: vi.fn(), drawImage: vi.fn() };
	const toBlob = vi.fn();
	const canvas = { width: 0, height: 0, getContext: vi.fn(), toBlob };
	const bitmap = { width: 2000, height: 2500, close: vi.fn() } as unknown as ImageBitmap;

	beforeEach(() => {
		canvas.getContext.mockReturnValue(context);
		toBlob.mockImplementation((done: BlobCallback, type: string) => done(new Blob(['encoded'], { type })));
		vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(canvas) });
	});

	it('encodes WebP directly without a support probe', async () => {
		const result = await encodeCoverCanvas(canvas as unknown as HTMLCanvasElement, 'photo.heic');
		expect(result).toBeInstanceOf(File);
		expect(result.name).toBe('photo.webp');
		expect(result.type).toBe('image/webp');
		expect(toBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 'image/webp', 0.92);
		expect(document.createElement).not.toHaveBeenCalled();
	});

	it('re-encodes as JPEG when WebP silently produces PNG, stepping JPEG quality down', async () => {
		toBlob.mockImplementation((done: BlobCallback, type: string, quality: number) => {
			const size = type === 'image/jpeg' && quality > 0.86 ? MAX_COVER_OUTPUT_BYTES + 1 : 16;
			done(new Blob([new Uint8Array(size)], { type: type === 'image/webp' ? 'image/png' : type }));
		});
		const result = await encodeCoverCanvas(canvas as unknown as HTMLCanvasElement, 'photo.png');
		expect(result.name).toBe('photo.jpg');
		expect(result.type).toBe('image/jpeg');
		expect(result.size).toBe(16);
		expect(toBlob.mock.calls.map(([, type, quality]) => [type, quality])).toEqual([
			['image/webp', 0.92], ['image/jpeg', 0.92], ['image/jpeg', 0.86]
		]);
	});

	it('rejects a null encoded blob', async () => {
		toBlob.mockImplementation((done: BlobCallback) => done(null));
		await expect(encodeCoverCanvas(canvas as unknown as HTMLCanvasElement, 'photo.jpg')).rejects.toThrow(COVER_MESSAGES.encodeFailed);
	});

	it('returns the file directly and draws original pixels at the fixed output size', async () => {
		const result = await processCoverCrop(bitmap, { x: 10, y: 20, width: 50, height: 50 }, 'photo.jpg');
		expect(result).toBeInstanceOf(File);
		expect(canvas.width).toBe(1080);
		expect(canvas.height).toBe(1350);
		expect(context.drawImage).toHaveBeenCalledWith(bitmap, 200, 500, 1000, 1250, 0, 0, 1080, 1350);
	});

	it('blocks an undersized clamped crop before allocating a canvas', async () => {
		await expect(processCoverCrop(bitmap, { x: 90, y: 90, width: 50, height: 50 }, 'photo.jpg')).rejects.toThrow(COVER_MESSAGES.tooSmall);
		expect(document.createElement).not.toHaveBeenCalled();
	});

	it('still accepts a soft crop at the minimum resolution', async () => {
		await expect(processCoverCrop(bitmap, { x: 0, y: 0, width: 27, height: 27 }, 'photo.jpg')).resolves.toBeInstanceOf(File);
	});

	it('rejects a missing canvas context', async () => {
		canvas.getContext.mockReturnValue(null);
		await expect(processCoverCrop(bitmap, { x: 0, y: 0, width: 100, height: 100 }, 'photo.jpg')).rejects.toThrow(COVER_MESSAGES.encodeFailed);
	});

	it('closes the decoded bitmap if preview encoding fails', async () => {
		vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
		toBlob.mockImplementation((done: BlobCallback) => done(null));
		await expect(decodeCoverImage(file('photo.jpg', 'image/jpeg'))).rejects.toThrow(COVER_MESSAGES.encodeFailed);
		expect(bitmap.close).toHaveBeenCalledOnce();
	});

	it('revokes the preview URL and tolerates an already closed bitmap', () => {
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.mocked(bitmap.close).mockImplementation(() => { throw new Error('already closed'); });
		expect(() => releaseDecodedCover({ bitmap, previewUrl: 'blob:preview', width: 2000, height: 2500 })).not.toThrow();
		expect(revoke).toHaveBeenCalledWith('blob:preview');
	});
});

describe('HEIC decode fallback', () => {
	const bitmap = { width: 8, height: 10 } as ImageBitmap;
	const createBitmap = vi.fn();

	beforeEach(() => {
		vi.stubGlobal('createImageBitmap', createBitmap);
		createBitmap.mockRejectedValue(new Error('native decode failed'));
		vi.mocked<(options: { blob: Blob; type: 'bitmap' }) => Promise<ImageBitmap>>(heicTo).mockResolvedValue(bitmap);
		vi.mocked(isHeic).mockResolvedValue(false);
	});

	it('prefers native oriented decoding without HEIC detection or conversion', async () => {
		createBitmap.mockResolvedValue(bitmap);
		const input = file('photo.heic', 'image/heic');
		expect(await bitmapFromCoverFile(input)).toBe(bitmap);
		expect(createBitmap).toHaveBeenCalledWith(input, { imageOrientation: 'from-image' });
		expect(isHeic).not.toHaveBeenCalled();
		expect(heicTo).not.toHaveBeenCalled();
	});

	it('retries native decoding without orientation options', async () => {
		createBitmap.mockReset().mockRejectedValueOnce(new Error('unsupported options')).mockResolvedValueOnce(bitmap);
		const input = file('photo.jpg', 'image/jpeg');
		expect(await bitmapFromCoverFile(input)).toBe(bitmap);
		expect(createBitmap.mock.calls).toEqual([[input, { imageOrientation: 'from-image' }], [input]]);
		expect(heicTo).not.toHaveBeenCalled();
	});

	it('converts HEIC when both native decode attempts fail', async () => {
		const input = file('IMG_0001.HEIC', 'image/heic');
		expect(await bitmapFromCoverFile(input)).toBe(bitmap);
		expect(createBitmap).toHaveBeenCalledTimes(2);
		expect(heicTo).toHaveBeenCalledExactlyOnceWith({
			blob: input, type: 'bitmap', options: { imageOrientation: 'from-image' }
		});
		expect(isHeic).not.toHaveBeenCalled();
	});

	it('uses magic-byte detection when type and extension are missing', async () => {
		vi.mocked(isHeic).mockResolvedValue(true);
		const input = file('IMG_0001', '');
		expect(await bitmapFromCoverFile(input)).toBe(bitmap);
		expect(isHeic).toHaveBeenCalledWith(input);
		expect(heicTo).toHaveBeenCalledTimes(1);
	});

	it('falls back to an oriented JPEG when HEIC bitmap conversion fails', async () => {
		const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
		vi.mocked(heicTo).mockRejectedValueOnce(new Error('bitmap conversion failed')).mockResolvedValueOnce(jpeg);
		createBitmap.mockRejectedValueOnce(new Error('native failed')).mockRejectedValueOnce(new Error('native failed')).mockResolvedValueOnce(bitmap);
		const input = file('photo.heic', 'image/heic');
		expect(await bitmapFromCoverFile(input)).toBe(bitmap);
		expect(heicTo).toHaveBeenLastCalledWith({ blob: input, type: 'image/jpeg', quality: 0.92 });
		expect(createBitmap).toHaveBeenLastCalledWith(jpeg, { imageOrientation: 'from-image' });
	});

	it('does not convert a failed JPEG unless it is detected as HEIC', async () => {
		await expect(bitmapFromCoverFile(file('broken.jpg', 'image/jpeg'))).rejects.toThrow(COVER_MESSAGES.unreadable);
		expect(heicTo).not.toHaveBeenCalled();
	});

	it('handles failed HEIC detection as an unreadable image', async () => {
		vi.mocked(isHeic).mockRejectedValue(new Error('detection failed'));
		await expect(bitmapFromCoverFile(file('broken.jpg', 'image/jpeg'))).rejects.toThrow(COVER_MESSAGES.unreadable);
		expect(heicTo).not.toHaveBeenCalled();
	});

	it('surfaces a readable error when HEIC conversion also fails', async () => {
		vi.mocked(heicTo).mockRejectedValue(new Error('wasm failed'));
		await expect(bitmapFromCoverFile(file('bad.heic', 'image/heic'))).rejects.toThrow(COVER_MESSAGES.unreadable);
		expect(heicTo).toHaveBeenCalledTimes(2);
	});
});
