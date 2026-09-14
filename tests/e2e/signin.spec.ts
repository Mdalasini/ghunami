import { expect, test } from './fixtures';

test('email-first sign in validates locally and preserves the form through mode changes', async ({ page }) => {
	const posts: string[] = [];
	page.on('request', (request) => { if (request.method() === 'POST') posts.push(request.url()); });
	await page.goto('/signin?returnTo=/create');
	await expect(page.getByRole('heading', { name: 'Sign in to ghunami' })).toBeVisible();
	const email = page.getByRole('textbox', { name: 'Email', exact: true });
	await email.fill('not-an-email');
	await expect(page.getByRole('button', { name: 'Continue with email', exact: true })).toBeDisabled();
	await email.fill('maya@example.com');
	await email.evaluate((node) => node.setAttribute('data-persisted', 'yes'));
	await page.getByRole('button', { name: 'Sign up', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign up', exact: true })).toBeVisible();
	await expect(email).toHaveValue('maya@example.com');
	await expect(email).toHaveAttribute('data-persisted', 'yes');
	await page.getByRole('textbox', { name: 'First name' }).fill('Maya');
	await page.getByRole('textbox', { name: 'Surname' }).fill('Otieno');
	await page.getByRole('button', { name: 'Continue', exact: true }).click();
	const password = page.getByLabel('Password', { exact: true });
	await expect(password).toBeFocused();
	await expect(password).toHaveAttribute('autocomplete', 'new-password');
	await expect(email).toHaveAttribute('readonly', '');
	await expect(email).toHaveAttribute('data-persisted', 'yes');
	await password.fill('test-password');
	await page.getByRole('button', { name: 'Show password' }).click();
	await expect(password).toHaveAttribute('type', 'text');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(email).toHaveValue('maya@example.com');
	await expect(page.getByRole('textbox', { name: 'First name' })).not.toBeVisible();
	await page.getByRole('button', { name: 'Continue with email', exact: true }).click();
	await expect(password).toHaveValue('');
	await expect(password).toHaveAttribute('type', 'password');
	await expect(password).toHaveAttribute('autocomplete', 'current-password');
	await page.getByRole('button', { name: 'Change email' }).click();
	await expect(email).toBeFocused();
	await expect(email).toHaveValue('maya@example.com');
	await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/auth/google?returnTo=%2Fcreate');
	expect(posts).toEqual([]);
});

test('password recovery and method changes stay in the shared form', async ({ page }) => {
	await page.goto('/signin');
	await page.getByRole('textbox', { name: 'Email', exact: true }).fill('maya@example.com');
	await page.getByRole('button', { name: 'Continue with email' }).click();
	await page.getByRole('button', { name: 'Reset password', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('maya@example.com');
	await expect(page.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
	await page.getByRole('button', { name: 'Back to sign in' }).click();
	await page.getByRole('button', { name: 'Continue with email' }).click();
	await page.getByRole('button', { name: 'Change method' }).click();
	await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
});

test('reset links show a new-password field and reduced motion disables transitions', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/signin?token=test-reset-token');
	await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
	await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
	await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toBeDisabled();
	const section = page.locator('form > div').first();
	await expect(section).toHaveCSS('transition-property', 'none');
});
