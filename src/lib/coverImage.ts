export const COVER_ASPECT = 4 / 5;
export const COVER_OUTPUT_WIDTH = 1080;
export const COVER_OUTPUT_HEIGHT = 1350;
export const MAX_COVER_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_COVER_OUTPUT_BYTES = 1 * 1024 * 1024;
export const MIN_CROP_WIDTH = 540;
export const MIN_CROP_HEIGHT = 675;
export const SHARP_CROP_WIDTH = 720;
export const SHARP_CROP_HEIGHT = 900;
export const COVER_QUALITY_FLOOR = 0.68;
export const COVER_QUALITY_STEPS = [0.92, 0.86, 0.8, 0.74, COVER_QUALITY_FLOOR] as const;
export const COVER_ACCEPT =
	'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

export const COVER_MESSAGES = {
	notImage: 'That isn’t an image. Use a JPG, PNG, HEIC, or WebP.',
	tooLarge: 'That photo is over 25 MB. Pick a smaller one.',
	tooSmall:
		'This crop is too small. Choose a different photo, or zoom out to include more of the image.',
	soft: 'This photo may look a little soft at full size.',
	unreadable: 'We couldn’t read that photo. Try a JPG, PNG, or WebP instead.',
	encodeFailed: 'We couldn’t prepare that photo. Try another one.'
} as const;

const ACCEPTED_TYPES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/pjpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'image/heic-sequence',
	'image/heif-sequence'
]);

const ACCEPTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export type PixelCrop = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type CropQuality = 'ok' | 'soft' | 'too_small';

export type CoverFileCheck = { ok: true } | { ok: false; error: string };

export type DecodedCover = {
	bitmap: ImageBitmap;
	previewUrl: string;
	width: number;
	height: number;
};

function extensionOf(name: string): string {
	const dot = name.lastIndexOf('.');
	if (dot < 0 || dot === name.length - 1) return '';
	return name.slice(dot + 1).toLowerCase();
}

export function isAcceptedCoverFile(file: File): boolean {
	const type = file.type.toLowerCase().trim();
	if (type && ACCEPTED_TYPES.has(type)) return true;
	return ACCEPTED_EXTENSIONS.has(extensionOf(file.name));
}

export function looksLikeHeic(file: File): boolean {
	const type = file.type.toLowerCase().trim();
	if (type.startsWith('image/heic') || type.startsWith('image/heif')) return true;
	const ext = extensionOf(file.name);
	return ext === 'heic' || ext === 'heif';
}

export function validateCoverFile(file: File): CoverFileCheck {
	if (file.size > MAX_COVER_UPLOAD_BYTES) {
		return { ok: false, error: COVER_MESSAGES.tooLarge };
	}
	if (!isAcceptedCoverFile(file)) {
		return { ok: false, error: COVER_MESSAGES.notImage };
	}
	return { ok: true };
}

export function assessCropResolution(width: number, height: number): CropQuality {
	if (width < MIN_CROP_WIDTH || height < MIN_CROP_HEIGHT) return 'too_small';
	if (width < SHARP_CROP_WIDTH || height < SHARP_CROP_HEIGHT) return 'soft';
	return 'ok';
}

export function clampPixelCrop(
	crop: PixelCrop,
	imageWidth: number,
	imageHeight: number
): PixelCrop {
	const maxX = Math.max(0, imageWidth);
	const maxY = Math.max(0, imageHeight);
	const x = Math.min(Math.max(0, Math.round(crop.x)), Math.max(0, maxX - 1));
	const y = Math.min(Math.max(0, Math.round(crop.y)), Math.max(0, maxY - 1));
	const width = Math.min(Math.max(1, Math.round(crop.width)), Math.max(1, maxX - x));
	const height = Math.min(Math.max(1, Math.round(crop.height)), Math.max(1, maxY - y));
	return { x, y, width, height };
}

export function percentCropToPixels(
	crop: PixelCrop,
	imageWidth: number,
	imageHeight: number
): PixelCrop {
	return clampPixelCrop(
		{
			x: (crop.x / 100) * imageWidth,
			y: (crop.y / 100) * imageHeight,
			width: (crop.width / 100) * imageWidth,
			height: (crop.height / 100) * imageHeight
		},
		imageWidth,
		imageHeight
	);
}

export async function pickEncodedBlob(
	encode: (type: string, quality: number) => Promise<Blob>,
	type: string,
	qualities: readonly number[] = COVER_QUALITY_STEPS
): Promise<{ blob: Blob; quality: number; type: string }> {
	if (qualities.length === 0) {
		throw new Error(COVER_MESSAGES.encodeFailed);
	}

	let last: { blob: Blob; quality: number } | undefined;
	for (const quality of qualities) {
		const blob = await encode(type, quality);
		last = { blob, quality };
		if (blob.size <= MAX_COVER_OUTPUT_BYTES) {
			return { blob, quality, type };
		}
	}

	if (!last) {
		throw new Error(COVER_MESSAGES.encodeFailed);
	}

	return { blob: last.blob, quality: last.quality, type };
}

export function preferredCoverMimeType(
	supportsType: (type: string) => boolean = canvasSupportsType
): 'image/webp' | 'image/jpeg' {
	return supportsType('image/webp') ? 'image/webp' : 'image/jpeg';
}

export function coverFileName(originalName: string, mimeType: string): string {
	const base = originalName.replace(/\.[^.]+$/, '').trim() || 'cover';
	const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
	return `${base}.${ext}`;
}

export function canvasSupportsType(type: string): boolean {
	if (typeof document === 'undefined') return false;
	const canvas = document.createElement('canvas');
	canvas.width = 1;
	canvas.height = 1;
	try {
		return canvas.toDataURL(type).startsWith(`data:${type}`);
	} catch {
		return false;
	}
}

async function createOrientedBitmap(blob: Blob): Promise<ImageBitmap> {
	try {
		return await createImageBitmap(blob, { imageOrientation: 'from-image' });
	} catch {
		return await createImageBitmap(blob);
	}
}

export type CoverBitmapSource = {
	createBitmap: (blob: Blob) => Promise<ImageBitmap>;
	convertHeic: (file: File) => Promise<ImageBitmap>;
	detectHeic: (file: File) => Promise<boolean>;
};

export async function bitmapFromCoverFile(
	file: File,
	source: CoverBitmapSource
): Promise<ImageBitmap> {
	try {
		return await source.createBitmap(file);
	} catch {
		const tryHeic = looksLikeHeic(file) || (await source.detectHeic(file));
		if (!tryHeic) {
			throw new Error(COVER_MESSAGES.unreadable);
		}
		try {
			return await source.convertHeic(file);
		} catch {
			throw new Error(COVER_MESSAGES.unreadable);
		}
	}
}

async function heicToBitmap(file: File): Promise<ImageBitmap> {
	const { heicTo } = await import('heic-to');
	try {
		return await heicTo({
			blob: file,
			type: 'bitmap',
			options: { imageOrientation: 'from-image' }
		});
	} catch {
		const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
		return await createOrientedBitmap(jpeg);
	}
}

async function detectHeicMagic(file: File): Promise<boolean> {
	try {
		const { isHeic } = await import('heic-to');
		return await isHeic(file);
	} catch {
		return false;
	}
}

function defaultCoverBitmapSource(): CoverBitmapSource {
	return {
		createBitmap: createOrientedBitmap,
		convertHeic: heicToBitmap,
		detectHeic: detectHeicMagic
	};
}

async function fileToBitmap(file: File): Promise<ImageBitmap> {
	return await bitmapFromCoverFile(file, defaultCoverBitmapSource());
}

function require2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext('2d', { alpha: false });
	if (!ctx) {
		throw new Error(COVER_MESSAGES.encodeFailed);
	}
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	return ctx;
}

async function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number
): Promise<Blob> {
	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob((result) => resolve(result), type, quality);
	});
	if (!blob) {
		throw new Error(COVER_MESSAGES.encodeFailed);
	}
	return blob;
}

async function bitmapPreviewUrl(bitmap: ImageBitmap): Promise<string> {
	const maxEdge = 1600;
	const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const ctx = require2dContext(canvas);
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
	return URL.createObjectURL(blob);
}

export async function decodeCoverImage(file: File): Promise<DecodedCover> {
	const bitmap = await fileToBitmap(file);
	try {
		const previewUrl = await bitmapPreviewUrl(bitmap);
		return {
			bitmap,
			previewUrl,
			width: bitmap.width,
			height: bitmap.height
		};
	} catch (error) {
		bitmap.close();
		throw error;
	}
}

export function releaseDecodedCover(decoded: DecodedCover | null | undefined) {
	if (!decoded) return;
	URL.revokeObjectURL(decoded.previewUrl);
	try {
		decoded.bitmap.close();
	} catch {
		// ImageBitmap.close() throws if it was already closed.
	}
}

export function drawCoverCrop(
	bitmap: ImageBitmap,
	crop: PixelCrop,
	canvas: HTMLCanvasElement = document.createElement('canvas')
): HTMLCanvasElement {
	const region = clampPixelCrop(crop, bitmap.width, bitmap.height);
	canvas.width = COVER_OUTPUT_WIDTH;
	canvas.height = COVER_OUTPUT_HEIGHT;
	const ctx = require2dContext(canvas);
	ctx.clearRect(0, 0, COVER_OUTPUT_WIDTH, COVER_OUTPUT_HEIGHT);
	ctx.drawImage(
		bitmap,
		region.x,
		region.y,
		region.width,
		region.height,
		0,
		0,
		COVER_OUTPUT_WIDTH,
		COVER_OUTPUT_HEIGHT
	);
	return canvas;
}

export async function encodeCoverCanvas(
	canvas: HTMLCanvasElement,
	originalName: string
): Promise<File> {
	const type = preferredCoverMimeType();
	const { blob } = await pickEncodedBlob(
		(mime, quality) => canvasToBlob(canvas, mime, quality),
		type
	);
	return new File([blob], coverFileName(originalName, type), { type });
}

export async function processCoverCrop(
	bitmap: ImageBitmap,
	percentCrop: PixelCrop,
	originalName: string
): Promise<{ file: File; cropPixels: PixelCrop; quality: CropQuality }> {
	const cropPixels = percentCropToPixels(percentCrop, bitmap.width, bitmap.height);
	const quality = assessCropResolution(cropPixels.width, cropPixels.height);
	if (quality === 'too_small') {
		throw new Error(COVER_MESSAGES.tooSmall);
	}

	const canvas = drawCoverCrop(bitmap, cropPixels);
	const file = await encodeCoverCanvas(canvas, originalName);
	return { file, cropPixels, quality };
}
