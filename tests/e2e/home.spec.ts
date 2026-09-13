import { expect, test } from './fixtures';

test('home hydrates signed out and opens the fundraiser flow', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => {
		errors.push(error.message);
	});

	await page.goto('/');
	await expect(page.getByRole('heading', { name: /stand alone/i })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

	await page.getByRole('link', { name: 'Start a fundraiser' }).first().click();
	await expect(page).toHaveURL(/\/create$/);
	await expect(page.getByRole('heading', { name: 'How much do you want to raise?' })).toBeVisible();

	for (const index of [0, 1]) {
		await page.getByRole('button', { name: /100,000/ }).click();
		await expect(page.getByRole('textbox', { name: 'Goal in Kenyan shillings' })).toHaveValue('100,000');
		await page.getByRole('link', { name: 'Cancel and go home' }).click();
		await page.getByRole('link', { name: 'Start a fundraiser' }).nth(index).click();
		await expect(page).toHaveURL(/\/create$/);
		await expect(page.getByRole('textbox', { name: 'Goal in Kenyan shillings' })).toHaveValue('');
	}

	const unexpected = errors.filter((message) => !/websocket|convex|failed to fetch/i.test(message));
	expect(unexpected).toEqual([]);
});
