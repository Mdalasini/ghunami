import path from 'node:path';
import { expect, test } from './fixtures';

const cover = path.join(import.meta.dirname, 'fixtures', 'cover.png');

test('completes the local draft and can edit a previous answer', async ({ page }) => {
	await page.goto('/create');
	await expect(page.getByRole('heading', { name: 'How much do you want to raise?' })).toBeVisible();

	await page.getByRole('button', { name: /100,000/ }).click();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Add a cover photo' })).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles(cover);
	await expect(page.getByRole('img', { name: 'Your cover' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya get home');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Tell people what happened' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Story' }).fill('Raising travel money so Maya can get home safely.');
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
	const review = page.getByRole('region', { name: 'Your draft' });
	await expect(review.getByText('Help Maya get home')).toBeVisible();
	await expect(review.getByText('Raising travel money so Maya can get home safely.')).toBeVisible();
	await expect(review.getByText(/100,000/)).toBeVisible();

	await review.getByRole('button', { name: 'Edit' }).first().click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya fly home');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'Tell people what happened' })).toBeVisible();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Your draft' }).getByText('Help Maya fly home')).toBeVisible();
});

test('rejects an empty goal and an unsupported or oversized cover', async ({ page }) => {
	await page.goto('/create');
	await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Continue' }).click();

	await page.locator('input[type="file"]').setInputFiles({
		name: 'notes.txt',
		mimeType: 'text/plain',
		buffer: Buffer.from('not an image')
	});
	await expect(page.getByRole('alert')).toHaveText(/isn’t an image/i);

	await page.locator('input[type="file"]').setInputFiles({
		name: 'huge.png',
		mimeType: 'image/png',
		buffer: Buffer.alloc(8 * 1024 * 1024 + 1)
	});
	await expect(page.getByRole('alert')).toHaveText(/over 8 MB/i);
});
