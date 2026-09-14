import { expect, test } from './fixtures';

test('home hydrates signed out and sends fundraiser creation through sign-in', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => {
		errors.push(error.message);
	});

	await page.goto('/');
	await expect(page.getByRole('heading', { name: /stand alone/i })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

	await page.getByRole('link', { name: 'Start a fundraiser' }).click();
	await expect(page).toHaveURL(/\/signin\?returnTo=%2Fcreate$/);
	await expect(page.getByRole('heading', { name: 'Sign in to ghunami' })).toBeVisible();

	const unexpected = errors.filter((message) => !/websocket|convex|failed to fetch/i.test(message));
	expect(unexpected).toEqual([]);
});

test('private fund routes keep returnTo for direct visits', async ({ page }) => {
	await page.goto('/funds');
	await expect(page).toHaveURL(/\/signin\?returnTo=%2Ffunds$/);

	await page.goto('/preview/Ab3');
	await expect(page).toHaveURL(/\/signin\?returnTo=%2Fpreview%2FAb3$/);

	await page.goto('/create/preview');
	await expect(page).toHaveURL(/\/signin\?returnTo=%2Fcreate$/);
});
