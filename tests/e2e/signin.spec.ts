import { expect, test } from './fixtures';

test('sign-in UI rejects invalid email without sending a message', async ({ page }) => {
	const posts: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'POST') {
			posts.push(request.url());
		}
	});

	await page.goto('/signin');
	await expect(page.getByRole('heading', { name: 'Log in to ghunami' })).toBeVisible();

	const email = page.getByRole('textbox', { name: 'Email' });
	await email.fill('not-an-email');
	await expect(page.getByRole('button', { name: 'Log in' })).toBeDisabled();
	expect(posts).toEqual([]);
});
