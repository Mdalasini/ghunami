import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { pngFromPixels, solidPng } from './png';

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

async function expectFinalPreview(page: Page) {
	await expect(page).toHaveURL(/\/create\/preview$/);
	await expect(page.getByRole('link', { name: 'Back to story' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Continue to review' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Does this look right?' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Saved in this browser' })).toHaveCount(0);
}

async function previewWithoutCover(page: Page) {
	await answerGoal(page);
	await page.getByRole('button', { name: 'Skip for now' }).click();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya get home');
	await page.getByRole('button', { name: 'OK' }).click();
	await page.getByRole('textbox', { name: 'Story' }).fill('Raising travel money so Maya can get home safely.');
	await page.getByRole('button', { name: 'Preview fund' }).click();
	await expect(page).toHaveURL(/\/create\/preview$/);
	await expect(page.getByRole('heading', { name: 'Help Maya get home', exact: true })).toBeVisible();
}

test('completes the local draft and can change an answer from the final preview', async ({ page }) => {
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
	await expect(page.getByText('Step 3 of 4')).toBeVisible();
	const title = page.getByRole('textbox', { name: 'Title' });
	await expect(title).toBeFocused();
	await title.fill('Help Maya get home');
	await title.press('Control+Enter');
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
	await expect(title).toHaveValue('Help Maya get home');
	await title.press('Enter');

	await expect(page.getByRole('heading', { name: 'Fundraiser story' })).toBeVisible();
	await expect(page.getByText('Step 4 of 4')).toBeVisible();
	await expect(page.getByText('to make a line break')).toBeVisible();
	await page.getByRole('textbox', { name: 'Story' }).fill('Raising travel money so Maya can get home safely.');
	await page.getByRole('button', { name: 'Preview fund' }).click();
	await expectFinalPreview(page);

	await expect(page.getByRole('heading', { name: 'Help Maya get home', exact: true })).toBeVisible();
	const titleAnswer = page.getByRole('link', { name: 'Edit title', exact: true });
	await expect(page.getByRole('region', { name: 'The story' })).toContainText(
		'Raising travel money so Maya can get home safely.'
	);
	await expect(page.getByRole('complementary', { name: 'Donation preview' })).toContainText(/100,000/);
	const cover = page.getByRole('img', { name: 'Cover for Help Maya get home' });
	await expect(cover).toBeVisible();
	await expect
		.poll(async () => cover.evaluate((img) => [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight]))
		.toEqual([1350, 1080]);
	const encoded = await cover.evaluate(async (img) => {
		const image = img as HTMLImageElement;
		const response = await fetch(image.src);
		const blob = await response.blob();
		return { type: blob.type, size: blob.size };
	});
	expect(['image/jpeg', 'image/webp']).toContain(encoded.type);
	expect(encoded.size).toBeGreaterThan(0);
	expect(encoded.size).toBeLessThanOrEqual(1024 * 1024);

	// Changing an answer opens that question and comes straight back to the final preview.
	await titleAnswer.click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
	await expect(title).toHaveValue('Help Maya get home');
	await title.fill('Help Maya fly home');
	await page.getByRole('button', { name: 'OK' }).click();
	await expectFinalPreview(page);
	await expect(page.getByRole('heading', { name: 'Help Maya fly home', exact: true })).toBeVisible();
});

test('preview edits return to preview with updated answers', async ({ page }) => {
	await previewWithoutCover(page);
	await expect(page.getByText('A place for your cover photo')).toBeVisible();
	await expect(page.getByRole('img', { name: /^Cover for / })).toHaveCount(0);

	await page.getByRole('link', { name: 'Edit title', exact: true }).click();
	await expect(page).toHaveURL(/\/create\?step=3&from=preview$/);
	await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Help Maya get home');
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya fly home');
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page).toHaveURL(/\/create\/preview$/);
	await expect(page.getByRole('heading', { name: 'Help Maya fly home', exact: true })).toBeVisible();

	await page.getByRole('link', { name: 'Edit goal', exact: true }).click();
	await expect(page).toHaveURL(/\/create\?step=1&from=preview$/);
	await page.getByRole('textbox', { name: 'Goal in Kenyan shillings' }).fill('75000');
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page).toHaveURL(/\/create\/preview$/);
	await expect(page.getByRole('complementary', { name: 'Donation preview' })).toContainText(/75,000/);

	await page.getByRole('link', { name: 'Edit story', exact: true }).click();
	await expect(page).toHaveURL(/\/create\?step=4&from=preview$/);
	await page.getByRole('textbox', { name: 'Story' }).fill('Help pay for Maya’s flight home.');
	await page.getByRole('button', { name: 'Preview fund' }).click();
	await expect(page).toHaveURL(/\/create\/preview$/);
	await expect(page.getByRole('region', { name: 'The story' })).toContainText('Help pay for Maya’s flight home.');

	await page.getByRole('link', { name: 'Add cover', exact: true }).click();
	await expect(page).toHaveURL(/\/create\?step=2&from=preview$/);
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page).toHaveURL(/\/create\/preview$/);
	await expect(page.getByRole('img', { name: 'Cover for Help Maya fly home' })).toBeVisible();
	await expect(page.getByText('A place for your cover photo')).toHaveCount(0);
	await page.getByRole('link', { name: 'Edit cover', exact: true }).click();
	await expect(page).toHaveURL(/\/create\?step=2&from=preview$/);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await page.getByRole('button', { name: 'OK' }).click();
	await expectFinalPreview(page);
	await expect(page.getByRole('heading', { name: 'Help Maya fly home', exact: true })).toBeVisible();
});

test('an empty direct preview offers a route back to creation', async ({ page }) => {
	await page.goto('/create/preview');
	await expect(page.getByRole('heading', { name: 'Your fund starts with your story.' })).toBeVisible();
	await expectFinalPreview(page);
	await page.getByRole('link', { name: 'Continue creating' }).click();
	await expect(page).toHaveURL(/\/create$/);
	await expect(page.getByRole('heading', { name: 'Fundraising goal' })).toBeVisible();
});

test('a mobile preview with a skipped cover has no horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await previewWithoutCover(page);
	await expect(page.getByText('A place for your cover photo')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Add cover', exact: true })).toBeVisible();
	await expect.poll(() => page.evaluate(() =>
		Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth
	)).toBeLessThanOrEqual(1);
	await expectFinalPreview(page);
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
	await expect(page.getByText('Step 2 of 4')).toBeVisible();
	// A cover has to be chosen or skipped before the arrow will move on.
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
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya get home');
	await page.getByRole('button', { name: 'OK' }).click();
	await page.getByRole('textbox', { name: 'Story' }).fill('Raising travel money so Maya can get home safely.');
	await page.getByRole('button', { name: 'Preview fund' }).click();
	await expectFinalPreview(page);

	await expect(page.getByText('A place for your cover photo')).toBeVisible();
	// A skipped cover still lets the arrow move past the question.
	await page.getByRole('link', { name: 'Add cover', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cover image' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Next question' })).toBeEnabled();

	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await page.getByRole('button', { name: 'OK' }).click();
	await expectFinalPreview(page);
	const cover = page.getByRole('img', { name: 'Cover for Help Maya get home' });
	await expect(cover).toBeVisible();
	await expect(page.getByText('A place for your cover photo')).toHaveCount(0);

	// Coming back re-opens the saved photo in the cropper; removing it leaves the question unanswered.
	await page.getByRole('link', { name: 'Edit cover', exact: true }).click();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await page.getByRole('button', { name: 'Remove photo' }).click();
	await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Next question' })).toBeDisabled();
	await page.getByRole('button', { name: 'Skip for now' }).click();
	await expectFinalPreview(page);
	await expect(page.getByText('A place for your cover photo')).toBeVisible();
	await expect(cover).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Add cover', exact: true })).toBeVisible();
});

test('keeps simple story formatting', async ({ page }) => {
	await answerGoal(page);
	await page.getByRole('button', { name: 'Skip for now' }).click();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya get home');
	await page.getByRole('button', { name: 'OK' }).click();

	const story = page.getByRole('textbox', { name: 'Story' });
	await expect(story).toBeVisible();
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

	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/create\/preview$/);
	const previewStory = page.getByRole('region', { name: 'The story' }).locator('.story-rich');
	await expect(previewStory.locator('h1')).toHaveText('Maya');
	await expect(previewStory.locator('strong')).toHaveText('help');
	await expectFinalPreview(page);
	await expect(previewStory.locator('[style], [class*="color"], script')).toHaveCount(0);
	await page.getByRole('link', { name: 'Edit story', exact: true }).click();
	await expect(story.locator('h1')).toHaveText('Maya');
	await expect(story.locator('strong')).toHaveText('help');
	await page.getByRole('button', { name: 'Preview fund' }).click();
	await expectFinalPreview(page);
	await expect(previewStory.locator('h1')).toHaveText('Maya');
	await expect(previewStory.locator('strong')).toHaveText('help');
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
	// Zooming could only make a weak photo worse, so there is nothing to zoom.
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
	// The slider spans the whole allowed range: its end is the last sharp zoom, never a warning.
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
	const controls = await slider.boundingBox();
	const okButton = await page.getByRole('button', { name: 'OK' }).boundingBox();
	expect(controls!.y + controls!.height).toBeLessThan(okButton!.y);
	expect(okButton!.y + okButton!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
	// On a taller screen the photo fills the column, as wide as the upload box.
	await page.setViewportSize({ width: 1280, height: 1000 });
	await expect.poll(async () => (await viewport.boundingBox())!.width).toBeGreaterThan(560);
	// Short / landscape viewports must keep a usable crop, even if the page has to scroll.
	await page.setViewportSize({ width: 667, height: 375 });
	await expect.poll(async () => (await viewport.boundingBox())!.width).toBeGreaterThanOrEqual(320);
	await page.setViewportSize({ width: 1280, height: 720 });
	expect(Math.abs(bounds!.width - cropBounds!.width)).toBeLessThanOrEqual(1);
	expect(Math.abs(bounds!.height - cropBounds!.height)).toBeLessThanOrEqual(1);
	await viewport.hover();
	await page.mouse.wheel(0, -2000);
	await expect(slider).toHaveValue('100');
	await expect(slider).toHaveAttribute('aria-valuetext', maxZoom!);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled();
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();

	// Going back re-opens the same frame at the same zoom.
	await page.getByRole('button', { name: 'Previous question' }).click();
	await expect(page.getByRole('heading', { name: 'Cover image' })).toBeVisible();
	await expect(slider).toBeVisible();
	await expect(slider).toHaveValue('100');
	await expect(slider).toHaveAttribute('aria-valuetext', maxZoom!);
	await expect(viewport).toBeVisible();
	await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled();
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
});

const RED = [200, 24, 24] as const;
const BLUE = [24, 48, 200] as const;

async function sampleCover(
	img: Locator,
	points: Array<{ x: number; y: number }>
): Promise<Array<[number, number, number]>> {
	return await img.evaluate(async (el, pts) => {
		const image = el as HTMLImageElement;
		// An undecoded image draws as black, which reads as "closer to red".
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not read cover pixels');
		ctx.drawImage(image, 0, 0);
		return pts.map((point) => {
			const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
			return [pixel[0], pixel[1], pixel[2]] as [number, number, number];
		});
	}, points);
}

function closerTo(
	pixel: [number, number, number],
	a: readonly [number, number, number],
	b: readonly [number, number, number]
): 'a' | 'b' {
	const dist = (color: readonly [number, number, number]) =>
		(pixel[0] - color[0]) ** 2 + (pixel[1] - color[1]) ** 2 + (pixel[2] - color[2]) ** 2;
	return dist(a) <= dist(b) ? 'a' : 'b';
}

test('encodes the user-selected crop region, not just any 5:4 slice', async ({ page }) => {
	await answerGoal(page);

	await page.locator('input[type="file"]').setInputFiles({
		name: 'banded.png',
		mimeType: 'image/png',
		buffer: pngFromPixels(1000, 2200, (_x, y) => (y < 1000 ? RED : BLUE))
	});
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();

	const cropper = page.locator('.cover-crop-container');
	await cropper.hover();
	const box = await cropper.boundingBox();
	if (!box) throw new Error('Cover cropper was not positioned');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y - box.height, { steps: 10 });
	await page.mouse.up();

	await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled();
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('heading', { name: 'Fundraiser title' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya get home');
	await page.getByRole('button', { name: 'OK' }).click();
	await page.getByRole('textbox', { name: 'Story' }).fill('Raising travel money so Maya can get home safely.');
	await page.getByRole('button', { name: 'Preview fund' }).click();
	await expectFinalPreview(page);

	const cover = page.getByRole('img', { name: 'Cover for Help Maya get home' });
	await expect(cover).toBeVisible();
	const [top, bottom] = await sampleCover(cover, [
		{ x: 675, y: 80 },
		{ x: 675, y: 1000 }
	]);
	if (!top || !bottom) throw new Error('Missing cover samples');
	expect(closerTo(top, BLUE, RED)).toBe('a');
	expect(closerTo(bottom, BLUE, RED)).toBe('a');
});
