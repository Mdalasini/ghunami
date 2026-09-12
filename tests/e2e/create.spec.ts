import { expect, test } from './fixtures';
import { solidPng } from './png';

const sharpCover = {
	name: 'cover.png',
	mimeType: 'image/png',
	buffer: solidPng(800, 1000)
};

const softCover = {
	name: 'soft.png',
	mimeType: 'image/png',
	buffer: solidPng(600, 750)
};

const tinyCover = {
	name: 'tiny.png',
	mimeType: 'image/png',
	buffer: solidPng(200, 250)
};

test('completes the local draft and can edit a previous answer', async ({ page }) => {
	await page.goto('/create');
	await expect(page.getByRole('heading', { name: 'How much do you want to raise?' })).toBeVisible();

	await page.getByRole('button', { name: /100,000/ }).click();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'Add a cover photo' })).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
	await page.getByRole('button', { name: 'Continue' }).click();

	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	const sentCover = page.getByRole('img', { name: 'Your cover' });
	await expect(sentCover).toBeVisible();
	await expect
		.poll(async () => sentCover.evaluate((img) => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight]))
		.toEqual([1080, 1350]);
	const encoded = await sentCover.evaluate(async (img) => {
		const image = img as HTMLImageElement;
		const response = await fetch(image.src);
		const blob = await response.blob();
		return { type: blob.type, size: blob.size };
	});
	expect(['image/jpeg', 'image/webp']).toContain(encoded.type);
	expect(encoded.size).toBeGreaterThan(0);
	expect(encoded.size).toBeLessThanOrEqual(1024 * 1024);
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
	await expect(review.getByRole('img', { name: 'Your cover' })).toBeVisible();

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
		buffer: Buffer.alloc(25 * 1024 * 1024 + 1)
	});
	await expect(page.getByRole('alert')).toHaveText(/over 25 MB/i);
});

test('blocks a cover crop below 540×675 and warns when the crop is a little soft', async ({ page }) => {
	await page.goto('/create');
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Continue' }).click();

	await page.locator('input[type="file"]').setInputFiles(tinyCover);
	await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveText(/too small/i);
	await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

	await page.locator('input[type="file"]').setInputFiles(softCover);
	await expect(page.getByRole('status')).toHaveText(/a little soft/i);
	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
});
