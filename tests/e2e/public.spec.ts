import { expect, test } from './fixtures';

test('public fund URLs do not require a session', async ({ page }) => {
	await page.goto('/f/no');
	await expect(page).not.toHaveURL(/signin/);
	await expect(page.getByRole('heading', { name: 'Fund not found' })).toBeVisible();
});

test('operator reversals require sign in', async ({ page }) => {
	await page.goto('/ops/reversals');
	await expect(page).toHaveURL(/signin/);
});
