import { STORY_MAX, isStoryEmpty, sanitizeStoryHtml, storyLength } from './richText';

export const TITLE_MAX = 80;
export const GOAL_MAX = 1_000_000_000_000;
export const MAX_COVER_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_COVER_OUTPUT_BYTES = 1 * 1024 * 1024;
export const IDEMPOTENCY_KEY_PATTERN = /^[\w-]{8,64}$/;

const COVER_TYPES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/pjpeg',
	'image/png',
	'image/webp'
]);

const ORIGINAL_TYPES = new Set([
	...COVER_TYPES,
	'image/heic',
	'image/heif',
	'image/heic-sequence',
	'image/heif-sequence'
]);

export function parseGoal(goal: number): number {
	if (!Number.isInteger(goal) || goal < 1 || goal > GOAL_MAX) {
		throw new Error('Enter a goal in Kenyan shillings.');
	}
	return goal;
}

export function parseTitle(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) throw new Error('Enter a title.');
	if (trimmed.length > TITLE_MAX) throw new Error('Title is too long.');
	return trimmed;
}

export function parseStory(story: string): string {
	const sanitized = sanitizeStoryHtml(story);
	if (isStoryEmpty(sanitized)) throw new Error('Enter a story.');
	if (storyLength(sanitized) > STORY_MAX) throw new Error('Story is too long.');
	return sanitized;
}

export function parseIdempotencyKey(key: string): string {
	if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
		throw new Error('Invalid request. Try again.');
	}
	return key;
}

export function assertUploadMeta(
	kind: 'cover' | 'original',
	meta: { contentType?: string; size: number } | null
): void {
	if (!meta) throw new Error('That photo could not be saved. Try another one.');
	const type = (meta.contentType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
	const allowed = kind === 'cover' ? COVER_TYPES : ORIGINAL_TYPES;
	const max = kind === 'cover' ? MAX_COVER_OUTPUT_BYTES : MAX_COVER_UPLOAD_BYTES;
	if (!allowed.has(type)) {
		throw new Error('That isn’t an image. Use a JPG, PNG, HEIC, or WebP.');
	}
	if (meta.size > max) {
		throw new Error(kind === 'cover' ? 'That photo is too large.' : 'That photo is over 25 MB. Pick a smaller one.');
	}
}
