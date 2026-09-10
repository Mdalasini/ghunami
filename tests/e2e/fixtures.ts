import { test as base, expect, type Page } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:4177';

export async function isolatePage(page: Page) {
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
			body: JSON.stringify({ token: null })
		});
	});

	await page.routeWebSocket(/.*/, (ws) => {
		ws.close();
	});
}

export const test = base.extend({
	page: async ({ page }, use) => {
		await isolatePage(page);
		await use(page);
	}
});

export { expect };
