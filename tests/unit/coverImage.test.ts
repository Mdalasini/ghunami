import { describe, expect, it } from 'vitest';
import {
	assessCropResolution,
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
	preferredCoverMimeType,
	validateCoverFile
} from '../../src/lib/coverImage';

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
		const encode = async (_type: string, quality: number) => {
			const size =
				quality >= 0.9 ? MAX_COVER_OUTPUT_BYTES + 400_000 : MAX_COVER_OUTPUT_BYTES - 50_000;
			return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
		};

		const picked = await pickEncodedBlob(encode, 'image/jpeg');
		expect(picked.quality).toBe(0.86);
		expect(picked.blob.size).toBeLessThanOrEqual(MAX_COVER_OUTPUT_BYTES);
	});

	it('keeps the quality floor when every step is still over 1 MB', async () => {
		const encode = async () =>
			new Blob([new Uint8Array(MAX_COVER_OUTPUT_BYTES + 1)], { type: 'image/webp' });

		const picked = await pickEncodedBlob(encode, 'image/webp');
		expect(picked.quality).toBe(COVER_QUALITY_FLOOR);
		expect(picked.blob.size).toBeGreaterThan(MAX_COVER_OUTPUT_BYTES);
	});

	it('prefers WebP when the canvas encoder reports support', () => {
		expect(preferredCoverMimeType(() => true)).toBe('image/webp');
		expect(preferredCoverMimeType(() => false)).toBe('image/jpeg');
	});

	it('renames the output to match the encoded type', () => {
		expect(coverFileName('Holiday.HEIC', 'image/jpeg')).toBe('Holiday.jpg');
		expect(coverFileName('Holiday.HEIC', 'image/webp')).toBe('Holiday.webp');
		expect(coverFileName('cover', 'image/jpeg')).toBe('cover.jpg');
	});
});
