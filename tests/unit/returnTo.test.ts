import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../../src/lib/returnTo';

const origin = 'https://ghunami.invalid';

function resolved(value: string | null | undefined): string {
	return new URL(safeReturnTo(value), origin).href;
}

describe('safeReturnTo', () => {
	it('falls back for missing or empty values', () => {
		expect(safeReturnTo(null)).toBe('/');
		expect(safeReturnTo(undefined)).toBe('/');
		expect(safeReturnTo('')).toBe('/');
	});

	it('rejects relative and off-site destinations', () => {
		expect(safeReturnTo('create')).toBe('/');
		expect(safeReturnTo('https://evil.example/phish')).toBe('/');
		expect(safeReturnTo('http://evil.example')).toBe('/');
		expect(safeReturnTo('//evil.example/phish')).toBe('/');
	});

	it('keeps same-origin paths with query and hash', () => {
		expect(safeReturnTo('/create')).toBe('/create');
		expect(safeReturnTo('/signin?next=1#box')).toBe('/signin?next=1#box');
	});

	it('does not treat backslash or control characters as a safe path', () => {
		expect(safeReturnTo('/\\evil.example')).toBe('/');
		expect(safeReturnTo('/\tevil.example')).toBe('/');
		expect(safeReturnTo('/\u0000evil')).toBe('/');
		expect(resolved('/\\evil.example')).toBe(`${origin}/`);
	});

	it('evaluates protocol-relative lookalikes through URL parsing', () => {
		expect(new URL(safeReturnTo('//evil.example'), origin).origin).toBe(origin);
	});
});
