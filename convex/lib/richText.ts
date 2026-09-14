/*
 * The story is stored as a small, sanitized HTML subset: two heading levels, paragraphs,
 * bold, italic, underline, and line breaks. Everything else (attributes included) is dropped
 * so what we render with `dangerouslySetInnerHTML` is always something we produced ourselves.
 */

export const STORY_MAX = 4000;

const BLOCK_TAGS: Record<string, string> = { h1: 'h1', h2: 'h2', p: 'p', div: 'p' };
const INLINE_TAGS: Record<string, string> = { b: 'strong', strong: 'strong', i: 'em', em: 'em', u: 'u' };

const TAG_OR_COMMENT = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

function escapeText(text: string) {
	return text.replace(/</g, '&lt;');
}

export function sanitizeStoryHtml(input: string): string {
	const out: string[] = [];
	const open: string[] = [];
	let last = 0;
	let skipUntil: string | null = null;

	for (const match of input.matchAll(TAG_OR_COMMENT)) {
		const rawName = match[1];
		const name = rawName?.toLowerCase() ?? '';
		const closing = match[0].startsWith('</');

		if (skipUntil) {
			if (closing && name === skipUntil) {
				skipUntil = null;
				last = match.index + match[0].length;
			}
			continue;
		}

		out.push(escapeText(input.slice(last, match.index)));
		last = match.index + match[0].length;

		if (!rawName) continue;
		if (!closing && (name === 'script' || name === 'style')) {
			skipUntil = name;
			continue;
		}

		if (name === 'br') {
			if (!closing) out.push('<br>');
			continue;
		}

		const mapped = BLOCK_TAGS[name] ?? INLINE_TAGS[name];
		if (!mapped) continue;

		if (!closing) {
			open.push(mapped);
			out.push(`<${mapped}>`);
			continue;
		}
		const at = open.lastIndexOf(mapped);
		if (at < 0) continue;
		while (open.length > at) {
			out.push(`</${open.pop()}>`);
		}
	}

	if (!skipUntil) out.push(escapeText(input.slice(last)));
	while (open.length) {
		out.push(`</${open.pop()}>`);
	}
	return out.join('');
}

const NAMED_ENTITIES: Record<string, string> = {
	nbsp: '\u00a0',
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'"
};

function decodeEntities(text: string) {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
		if (body[0] === '#') {
			const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
		}
		return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
	});
}

/* Plain-text view of the story; line breaks and block ends become newlines. */
export function storyText(html: string): string {
	const withBreaks = html
		.replace(/<br\b[^>]*>/gi, '\n')
		.replace(/<\/(?:h1|h2|p|div)>/gi, '\n')
		.replace(/<[^>]+>/g, '');
	return decodeEntities(withBreaks);
}

export function storyLength(html: string): number {
	return storyText(html).replace(/\s+$/, '').length;
}

export function isStoryEmpty(html: string): boolean {
	return storyText(html).trim().length === 0;
}
