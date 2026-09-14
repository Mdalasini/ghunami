import { expect, test } from './fixtures';

test('public fund URLs do not require a session', async ({ page }) => {
	await page.goto('/f/no');
	await expect(page).not.toHaveURL(/signin/);
	await expect(page.getByRole('heading', { name: 'Fund not found' })).toBeVisible();
});

test('a Convex outage is not reported as a missing fund', async ({ page }) => {
	await page.goto('/f/Ab3');
	await expect(page).not.toHaveURL(/signin/);
	await expect(page.getByRole('heading', { name: 'Fund not found' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: /something went wrong|error/i })).toBeVisible();
});
