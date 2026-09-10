import { describe, expect, it } from 'vitest';
import { isResponse } from '../helpers/route';
import { action, loader } from '../../src/routes/auth.signout';

describe('auth.signout', () => {
	it('clears the cookie and redirects home on POST', async () => {
		const result = await action();
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe('/');
		expect(result.headers.get('Set-Cookie')).toMatch(/gh_session=/);
		expect(result.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
	});

	it('GET redirects home without requiring a session', async () => {
		const result = await loader();
		expect(isResponse(result)).toBe(true);
		if (!isResponse(result)) return;
		expect(result.headers.get('Location')).toBe('/');
	});
});
