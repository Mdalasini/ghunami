import { describe, expect, it } from 'vitest';
import { absoluteFundUrl, fundPath, isCanonicalFundPath, slugifyTitle } from '../../src/lib/fundUrl';

describe('fund URL slugs', () => {
	it('trims, lowercases, and strips combining diacritics', () => {
		expect(slugifyTitle('  Café  ')).toBe('cafe');
		expect(slugifyTitle(' naïve RÉSUMÉ ')).toBe('naive-resume');
	});

	it('keeps non-Latin letters and numbers', () => {
		expect(slugifyTitle('東京 2026')).toBe('東京-2026');
		expect(slugifyTitle('Помощь Maya')).toBe('помощь-maya');
	});

	it('turns punctuation and emoji runs into a hyphen, then falls back', () => {
		expect(slugifyTitle('Help Maya — get home!')).toBe('help-maya-get-home');
		expect(slugifyTitle('Hello---World')).toBe('hello-world');
		expect(slugifyTitle('🎉🎉')).toBe('fund');
		expect(slugifyTitle('   ')).toBe('fund');
	});

	it('identifies funds by ID, so duplicate titles stay distinct paths', () => {
		expect(fundPath('Ab3', 'Help Maya get home')).toBe('/f/Ab3/help-maya-get-home');
		expect(fundPath('Xy9', 'Help Maya get home')).toBe('/f/Xy9/help-maya-get-home');
		expect(fundPath('Ab3', 'Help Maya get home')).not.toBe(fundPath('Xy9', 'Help Maya get home'));
	});

	it('encodes Unicode path segments and compares them without looping', () => {
		const path = fundPath('Ab3', '東京');
		expect(path).toBe(`/f/Ab3/${encodeURIComponent('東京')}`);
		expect(isCanonicalFundPath(path, 'Ab3', '東京')).toBe(true);
		expect(isCanonicalFundPath(`${path}.data`, 'Ab3', '東京')).toBe(true);
		expect(isCanonicalFundPath('/f/Ab3/東京', 'Ab3', '東京')).toBe(true);
		expect(isCanonicalFundPath('/f/Ab3/old-title', 'Ab3', '東京')).toBe(false);
		expect(isCanonicalFundPath('/f/Ab3/old-title.data', 'Ab3', '東京')).toBe(false);
		expect(absoluteFundUrl('https://ghunami.test/', 'Ab3', '東京')).toBe(`https://ghunami.test${path}`);
	});
});
