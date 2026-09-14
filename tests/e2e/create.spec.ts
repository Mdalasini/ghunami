import { type Page } from '@playwright/test';
import { expect, signedInTest as test } from './fixtures';
import { solidPng } from './png';

const sharpCover = {
	name: 'cover.png',
	mimeType: 'image/png',
	buffer: solidPng(1000, 800)
};

const softCover = {
	name: 'soft.png',
	mimeType: 'image/png',
	buffer: solidPng(750, 600)
};

const tinyCover = {
	name: 'tiny.png',
	mimeType: 'image/png',
	buffer: solidPng(250, 200)
};

async function answerGoal(page: Page, amount = /^Ksh\s*50,000$/) {
	await page.goto('/create');
	await expect(page.getByRole('heading', { name: 'Fundraising goal' })).toBeVisible();
	await page.getByRole('button', { name: amount }).click();
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Cover image' })).toBeVisible();
}

test('completes each question and keeps answers when moving around', async ({ page }) => {
	await answerGoal(page, /100,000/);
	await expect(page.getByText('Step 2 of 4')).toBeVisible();

	await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Choose a photo' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled();
	await page.keyboard.press('Enter');

	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
	const title = page.getByRole('textbox', { name: 'Title' });
	await expect(title).toBeFocused();
	await title.fill('Help Maya get home');
	await title.press('Enter');

	await expect(page.getByRole('heading', { name: 'Fundraiser story' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Story' }).fill('Raising travel money so Maya can get home safely.');
	await expect(page.getByRole('button', { name: 'Preview fund' })).toBeEnabled();

	await page.getByRole('button', { name: 'Previous question' }).click();
	await expect(title).toHaveValue('Help Maya get home');
	await title.fill('Help Maya fly home');
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser story' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Story' })).toContainText('Raising travel money so Maya can get home safely.');
});

test('moves between questions with the arrows and keeps answers', async ({ page }) => {
	await page.goto('/create');
	await expect(page.getByText('Step 1 of 4')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Goal in Kenyan shillings' })).toBeFocused();
	await expect(page.getByRole('button', { name: 'Previous question' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Next question' })).toBeDisabled();

	await page.getByRole('textbox', { name: 'Goal in Kenyan shillings' }).fill('75000');
	await expect(page.getByRole('button', { name: 'Next question' })).toBeEnabled();
	await page.getByRole('button', { name: 'Next question' }).click();
	await expect(page.getByRole('heading', { name: 'Cover image' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next question' })).toBeDisabled();

	await page.getByRole('button', { name: 'Previous question' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraising goal' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Goal in Kenyan shillings' })).toHaveValue('75,000');
});

test('can skip the cover, remove a chosen photo, and return to it later', async ({ page }) => {
	await answerGoal(page);

	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Skip for now' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Remove photo' }).click();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Choose a photo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled();

	await page.getByRole('button', { name: 'Skip for now' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
	await page.getByRole('button', { name: 'Previous question' }).click();
	await expect(page.getByRole('heading', { name: 'Cover image' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next question' })).toBeEnabled();

	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
	await page.getByRole('button', { name: 'Previous question' }).click();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await page.getByRole('button', { name: 'Remove photo' }).click();
	await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
});

test('keeps simple story formatting', async ({ page }) => {
	await answerGoal(page);
	await page.getByRole('button', { name: 'Skip for now' }).click();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya get home');
	await page.getByRole('button', { name: 'OK' }).click();

	const story = page.getByRole('textbox', { name: 'Story' });
	await story.click();
	await page.getByRole('button', { name: 'Heading 1' }).click();
	await page.keyboard.type('Maya');
	await expect(page.getByRole('button', { name: 'Heading 1' })).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Shift+Enter');
	await page.getByRole('button', { name: 'Normal text' }).click();
	await page.keyboard.type('needs ');
	await page.getByRole('button', { name: 'Bold' }).click();
	await page.keyboard.type('help');
	await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText(/^\d+ \/ 4000$/)).toHaveText('15 / 4000');
	await expect(story.locator('h1')).toHaveText('Maya');
	await expect(story.locator('strong')).toHaveText('help');
});

test('rejects an empty goal and an unsupported or oversized cover', async ({ page }) => {
	await page.goto('/create');
	await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled();
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'OK' }).click();

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

test('blocks a cover crop below 675×540 and warns when the crop is a little soft', async ({ page }) => {
	await answerGoal(page);

	await page.locator('input[type="file"]').setInputFiles(tinyCover);
	await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveText(/too small/i);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled();

	await page.locator('input[type="file"]').setInputFiles(softCover);
	await expect(page.getByRole('status')).toHaveText(/a little soft/i);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled();
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
});

test('shows only the saved frame and clamps zoom before quality degrades', async ({ page }) => {
	await answerGoal(page);
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	const slider = page.getByRole('slider', { name: 'Zoom photo' });
	await expect(slider).toBeEnabled();
	await expect(slider).toHaveAttribute('max', '100');
	await expect(slider).toHaveValue('0');
	await slider.focus();
	await slider.press('End');
	await expect(slider).toHaveValue('100');
	const maxZoom = await slider.getAttribute('aria-valuetext');
	expect(Number.parseFloat(maxZoom!)).toBeGreaterThan(1);
	const viewport = page.locator('.cover-crop-container');
	const frame = page.locator('.cover-crop-area');
	const bounds = await viewport.boundingBox();
	const cropBounds = await frame.boundingBox();
	expect(bounds).not.toBeNull();
	expect(cropBounds).not.toBeNull();
	expect(Math.abs(bounds!.width - cropBounds!.width)).toBeLessThanOrEqual(1);
	expect(Math.abs(bounds!.height - cropBounds!.height)).toBeLessThanOrEqual(1);
	await viewport.hover();
	await page.mouse.wheel(0, -2000);
	await expect(slider).toHaveValue('100');
	await expect(page.getByRole('alert')).toHaveCount(0);
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
	await page.getByRole('button', { name: 'Previous question' }).click();
	await expect(slider).toHaveValue('100');
	await expect(slider).toHaveAttribute('aria-valuetext', maxZoom!);
});
