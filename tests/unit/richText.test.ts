import { describe, expect, it } from 'vitest';
import { isStoryEmpty, sanitizeStoryHtml, storyLength, storyText } from '../../src/lib/richText';

describe('sanitizeStoryHtml', () => {
	it('keeps the allowed subset and normalises tag names', () => {
		expect(sanitizeStoryHtml('<h1>Hi</h1><p>Some <b>bold</b>, <i>italic</i> and <u>under</u></p>')).toBe(
			'<h1>Hi</h1><p>Some <strong>bold</strong>, <em>italic</em> and <u>under</u></p>'
		);
	});

	it('turns editor divs into paragraphs and keeps line breaks', () => {
		expect(sanitizeStoryHtml('<div>One<br>Two</div><div><br></div>')).toBe('<p>One<br>Two</p><p><br></p>');
	});

	it('drops attributes, scripts, styles and unknown tags but keeps their text', () => {
		expect(
			sanitizeStoryHtml(
				'<p style="color:red" onclick="x()">Hello <span class="a">there</span> <a href="javascript:alert(1)">link</a></p><script>alert(1)</script><!-- c -->'
			)
		).toBe('<p>Hello there link</p>');
		expect(sanitizeStoryHtml('<style>p{color:red}</style><p>ok</p><script>never closed')).toBe('<p>ok</p>');
	});

	it('closes unbalanced tags and ignores stray closers', () => {
		expect(sanitizeStoryHtml('<h2>Open <strong>bold')).toBe('<h2>Open <strong>bold</strong></h2>');
		expect(sanitizeStoryHtml('text</strong></p>')).toBe('text');
		expect(sanitizeStoryHtml('<p><em>a</p>b</em>')).toBe('<p><em>a</em></p>b');
	});

	it('escapes raw angle brackets in text', () => {
		expect(sanitizeStoryHtml('1 < 2 and <3')).toBe('1 &lt; 2 and &lt;3');
	});
});

describe('storyText / storyLength / isStoryEmpty', () => {
	it('flattens blocks and breaks to newlines and decodes entities', () => {
		expect(storyText('<h1>Title</h1><p>a&nbsp;&amp;&lt;b<br>c</p>')).toBe('Title\na\u00a0&<b\nc\n');
	});

	it('counts visible characters, ignoring trailing breaks', () => {
		expect(storyLength('<p>Hello</p><p><br></p>')).toBe(5);
		expect(storyLength('Hi <strong>you</strong>')).toBe(6);
	});

	it('treats markup-only content as empty', () => {
		expect(isStoryEmpty('<p><br></p>')).toBe(true);
		expect(isStoryEmpty('&nbsp;')).toBe(true);
		expect(isStoryEmpty('<h1>x</h1>')).toBe(false);
	});
});
