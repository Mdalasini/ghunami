import { test as base, expect, type Page } from '@playwright/test';
import { sessionCookie, type Session } from '../../src/lib/session.server';

const appOrigin = 'http://127.0.0.1:4177';

const e2eSession: Session = {
	accessToken: 'e2e-access-token',
	refreshToken: 'e2e-refresh-token',
	email: 'maya@example.com',
	firstName: 'Maya',
	lastName: 'Otieno'
};

function cookieValue(header: string) {
	const part = header.split(';')[0] ?? '';
	return part.slice('gh_session='.length);
}

export async function isolatePage(page: Page, auth: { token: string | null; session?: boolean } = { token: null }) {
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === appOrigin) {
			await route.continue();
			return;
		}
		if (url.protocol === 'data:' || url.protocol === 'blob:') {
			await route.continue();
			return;
		}
		await route.abort();
	});

	await page.route('**/auth/token*', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ token: auth.token })
		});
	});

	await page.routeWebSocket(/.*/, (ws) => {
		ws.close();
	});

	if (auth.session) {
		await page.context().addCookies([
			{
				name: 'gh_session',
				value: cookieValue(sessionCookie(e2eSession)),
				url: appOrigin,
				httpOnly: true,
				sameSite: 'Lax'
			}
		]);
	}
}

export const test = base.extend({
	page: async ({ page }, use) => {
		await isolatePage(page);
		await use(page);
	}
});

export const signedInTest = base.extend({
	page: async ({ page }, use) => {
		await isolatePage(page, { token: 'e2e-access-token', session: true });
		await use(page);
	}
});

export { expect };
