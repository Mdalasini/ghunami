import { describe, expect, it } from 'vitest';
import { parseGoal, parseIdempotencyKey, parseStory, parseTitle } from '../../convex/lib/fundFields';

describe('fund field parsing', () => {
	it('keeps KES goals as positive integers', () => {
		expect(parseGoal(50_000)).toBe(50_000);
		expect(() => parseGoal(0)).toThrow(/goal/i);
		expect(() => parseGoal(10.5)).toThrow(/goal/i);
	});

	it('sanitizes story HTML on the server', () => {
		expect(parseStory('<p onclick="x()">Hi <script>alert(1)</script><b>Maya</b></p>')).toBe(
			'<p>Hi <strong>Maya</strong></p>'
		);
		expect(() => parseStory('<p><br></p>')).toThrow(/story/i);
	});

	it('rejects blank titles and short idempotency keys', () => {
		expect(parseTitle('  Help Maya  ')).toBe('Help Maya');
		expect(() => parseTitle('   ')).toThrow(/title/i);
		expect(() => parseIdempotencyKey('nope')).toThrow(/Invalid request/);
		expect(parseIdempotencyKey('create-1-aaaaaaaa')).toBe('create-1-aaaaaaaa');
	});
});
