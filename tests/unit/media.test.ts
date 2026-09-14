import { describe, expect, it } from 'vitest';
import { coverMediaUrl } from '../../src/lib/media';

describe('coverMediaUrl', () => {
	it('keeps a stable path until a version is supplied', () => {
		expect(coverMediaUrl('Ab3')).toBe('/media/Ab3');
		expect(coverMediaUrl('Ab3', 'original')).toBe('/media/Ab3?kind=original');
	});

	it('adds a version so a replaced cover is not stuck on the previous bytes', () => {
		expect(coverMediaUrl('Ab3', 'cover', 42)).toBe('/media/Ab3?v=42');
		expect(coverMediaUrl('Ab3', 'original', 42)).toBe('/media/Ab3?kind=original&v=42');
	});
});
