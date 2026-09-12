import { type Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import { pngFromPixels, solidPng } from './png';

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
		await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

	await page.locator('input[type="file"]').setInputFiles(softCover);
	await expect(page.getByRole('status')).toHaveText(/a little soft/i);
		await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
});

test('shows only the saved frame and clamps zoom before quality degrades', async ({ page }) => {
	await page.goto('/create');
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	const slider = page.getByRole('slider', { name: 'Zoom photo' });
	await expect(slider).toBeEnabled();
	await slider.focus();
	await slider.press('End');
	const maximum = await slider.getAttribute('max');
	await expect(slider).toHaveValue(maximum!);
	const viewport = page.locator('.cover-crop-container');
	const frame = page.locator('.cover-crop-area');
	const bounds = await viewport.boundingBox();
	const cropBounds = await frame.boundingBox();
	expect(bounds).not.toBeNull();
	expect(cropBounds).not.toBeNull();
	expect(bounds!.width).toBeLessThanOrEqual(448);
	expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 300);
	await expect.poll(async () => {
		const controls = await slider.boundingBox();
		const continueButton = await page.getByRole('button', { name: 'Continue' }).boundingBox();
		return controls!.y + controls!.height < continueButton!.y;
	}).toBe(true);
	expect(Math.abs(bounds!.width - cropBounds!.width)).toBeLessThanOrEqual(1);
	expect(Math.abs(bounds!.height - cropBounds!.height)).toBeLessThanOrEqual(1);
	await viewport.hover();
	await page.mouse.wheel(0, -2000);
	await expect(slider).toHaveValue(maximum!);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	await page.getByRole('button', { name: 'Change your answer to step 2' }).click();
	await expect(slider).toBeVisible();
	await expect(slider).toHaveValue(maximum!);
	await expect(slider).toHaveAttribute('max', maximum!);
	await expect(viewport).toBeVisible();
	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
});

const RED = [200, 24, 24] as const;
const BLUE = [24, 48, 200] as const;

async function sampleCover(
	img: Locator,
	points: Array<{ x: number; y: number }>
): Promise<Array<[number, number, number]>> {
	return await img.evaluate((el, pts) => {
		const image = el as HTMLImageElement;
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

test('encodes the user-selected crop region, not just any 4:5 slice', async ({ page }) => {
	await page.goto('/create');
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Continue' }).click();

	await page.locator('input[type="file"]').setInputFiles({
		name: 'banded.png',
		mimeType: 'image/png',
		buffer: pngFromPixels(800, 2200, (_x, y) => (y < 1000 ? RED : BLUE))
	});
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();

	const cropper = page.locator('.cover-crop-container');
	const box = await cropper.boundingBox();
	if (!box) throw new Error('Cover cropper was not positioned');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + 24, { steps: 10 });
	await page.mouse.up();

	await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
	await page.getByRole('button', { name: 'Continue' }).click();

	const sentCover = page.getByRole('img', { name: 'Your cover' });
	await expect(sentCover).toBeVisible();
	const [top, bottom] = await sampleCover(sentCover, [
		{ x: 540, y: 80 },
		{ x: 540, y: 1270 }
	]);
	if (!top || !bottom) throw new Error('Missing cover samples');
	expect(closerTo(top, BLUE, RED)).toBe('a');
	expect(closerTo(bottom, BLUE, RED)).toBe('a');
});
