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
	await page.getByRole('button', { name: 'Send' }).click();

	await expect(page.getByRole('heading', { name: 'Add a cover photo' })).toBeVisible();
	await expect.poll(async () => {
		const heading = await page.getByRole('heading', { name: 'Add a cover photo' }).boundingBox();
		if (!heading) return false;
		return heading.y >= 0 && heading.y + heading.height <= page.viewportSize()!.height;
	}).toBe(true);
	await expect(page.getByRole('button', { name: 'Click to add' })).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Click to change' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
	await page.keyboard.press('Enter');

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
	const title = page.getByRole('textbox', { name: 'Title' });
	await title.fill('Help Maya get home');
	await title.press('Control+Enter');
	await expect(title).toHaveValue('Help Maya get home');
	await page.getByRole('button', { name: 'Send' }).click();

	await expect(page.getByRole('heading', { name: 'Tell people what happened' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Story' }).fill('Raising travel money so Maya can get home safely.');
	await page.getByRole('button', { name: 'Send' }).click();

	await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
	await expect(page.getByText('Tap anything to change it.')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Your draft' })).toHaveCount(0);
	const titleAnswer = page.getByRole('button', { name: 'Change your answer to step 3' });
	await expect(titleAnswer).toHaveText('Help Maya get home');
	await expect(page.getByRole('button', { name: 'Change your answer to step 4' })).toHaveText(
		'Raising travel money so Maya can get home safely.'
	);
	await expect(page.getByRole('button', { name: 'Change your answer to step 1' })).toHaveText(/100,000/);
	await expect(page.getByRole('img', { name: 'Your cover' })).toBeVisible();

	// Editing happens in place: fix the title and land back on the review, not on the story step again.
	await titleAnswer.click();
	await expect(page.getByRole('contentinfo').getByText('Editing the title')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya fly home');
	await page.getByRole('button', { name: 'Send' }).click();

	await expect(page.getByText('Editing the title')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
	await expect(titleAnswer).toHaveText('Help Maya fly home');
	await expect(page.getByRole('button', { name: 'Looks good' })).toBeVisible();

	// Cancel restores the previous answer.
	const goalAnswer = page.getByRole('button', { name: 'Change your answer to step 1' });
	await goalAnswer.click();
	await page.getByRole('textbox', { name: 'Goal in Kenyan shillings' }).fill('75000');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(goalAnswer).toHaveText(/100,000/);

	// Switching to another answer discards the unsent change too.
	await goalAnswer.click();
	await page.getByRole('textbox', { name: 'Goal in Kenyan shillings' }).fill('');
	await titleAnswer.click();
	await expect(page.getByRole('contentinfo').getByText('Editing the title')).toBeVisible();
	await expect(goalAnswer).toHaveText(/100,000/);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(goalAnswer).toHaveText(/100,000/);
});

test('can skip the cover, remove a chosen photo, and return to it later', async ({ page }) => {
	await page.goto('/create');
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByRole('heading', { name: 'Add a cover photo' })).toBeVisible();

	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Skip for now' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Remove photo' }).click();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Click to add' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

	await page.getByRole('button', { name: 'Skip for now' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	const skipped = page.getByRole('button', { name: 'Change your answer to step 2' });
	await expect(skipped).toHaveText('I’ll return to this later');

	await skipped.click();
	await expect(page.getByRole('contentinfo').getByText('Editing your cover photo')).toBeVisible();
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	const cover = page.getByRole('img', { name: 'Your cover' });
	await expect(cover).toBeVisible();
	await expect(page.getByText('I’ll return to this later')).toHaveCount(0);

	// Removing the cover during an edit and cancelling brings the original back, still loadable.
	await page.getByRole('button', { name: 'Change your answer to step 2' }).click();
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();
	await page.getByRole('button', { name: 'Remove photo' }).click();
	await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
	await expect(cover).toHaveCount(0);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(cover).toBeVisible();
	await expect
		.poll(async () => cover.evaluate((img) => (img as HTMLImageElement).naturalWidth))
		.toBe(1080);
});

test('keeps simple story formatting', async ({ page }) => {
	await page.goto('/create');
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Send' }).click();
	await page.getByRole('button', { name: 'Skip for now' }).click();
	await page.getByRole('textbox', { name: 'Title' }).fill('Help Maya get home');
	await page.getByRole('button', { name: 'Send' }).click();

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

	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
	const answer = page.getByRole('button', { name: 'Change your answer to step 4' });
	await expect(answer.locator('h1')).toHaveText('Maya');
	await expect(answer.locator('strong')).toHaveText('help');
	await expect(answer.locator('[style], [class*="color"], script')).toHaveCount(0);
});

test('rejects an empty goal and an unsupported or oversized cover', async ({ page }) => {
	await page.goto('/create');
	await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Send' }).click();

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
	await page.getByRole('button', { name: 'Send' }).click();

	await page.locator('input[type="file"]').setInputFiles(tinyCover);
	await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
	await expect(page.getByRole('alert')).toHaveText(/too small/i);
	// Zooming could only make a weak photo worse, so there is nothing to zoom.
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();

	await page.locator('input[type="file"]').setInputFiles(softCover);
	await expect(page.getByRole('status')).toHaveText(/a little soft/i);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
});

test('shows only the saved frame and clamps zoom before quality degrades', async ({ page }) => {
	await page.goto('/create');
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Send' }).click();
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
	expect(bounds!.width).toBeLessThanOrEqual(448);
	expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 300);
	await expect.poll(async () => {
		const controls = await slider.boundingBox();
		const continueButton = await page.getByRole('button', { name: 'Send' }).boundingBox();
		return controls!.y + controls!.height < continueButton!.y;
	}).toBe(true);
	expect(Math.abs(bounds!.width - cropBounds!.width)).toBeLessThanOrEqual(1);
	expect(Math.abs(bounds!.height - cropBounds!.height)).toBeLessThanOrEqual(1);
	await viewport.hover();
	await page.mouse.wheel(0, -2000);
	await expect(slider).toHaveValue('100');
	await expect(slider).toHaveAttribute('aria-valuetext', maxZoom!);
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByRole('status')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	await page.getByRole('button', { name: 'Change your answer to step 2' }).click();
	await expect(slider).toBeVisible();
	await expect(slider).toHaveValue('100');
	await expect(slider).toHaveAttribute('aria-valuetext', maxZoom!);
	await expect(viewport).toBeVisible();
	await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
	await page.getByRole('button', { name: 'Send' }).click();
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
	await page.getByRole('button', { name: 'Send' }).click();

	await page.locator('input[type="file"]').setInputFiles({
		name: 'banded.png',
		mimeType: 'image/png',
		buffer: pngFromPixels(800, 2200, (_x, y) => (y < 1000 ? RED : BLUE))
	});
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeVisible();

	const cropper = page.locator('.cover-crop-container');
	// Hovering waits for the tray to finish rising before we measure where to drag.
	await cropper.hover();
	const box = await cropper.boundingBox();
	if (!box) throw new Error('Cover cropper was not positioned');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + 24, { steps: 10 });
	await page.mouse.up();

	await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
	await page.getByRole('button', { name: 'Send' }).click();

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

test('the photo tray rises over the thread and lowers again without moving it', async ({ page }) => {
	await page.goto('/create');
	await page.getByRole('button', { name: /^Ksh\s*50,000$/ }).click();
	await page.getByRole('button', { name: 'Send' }).click();
	const heading = page.getByRole('heading', { name: 'Add a cover photo' });
	const tip = page.getByText('Choosing a photo');
	await expect(heading).toBeVisible();
	await expect(tip).toBeVisible();
	await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
	const before = await heading.boundingBox();
	const tipBefore = await tip.boundingBox();

	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	const tray = page.locator('.cover-tray');
	await expect(tray).toHaveClass(/is-raised/);
	const cropper = page.locator('.cover-crop-container');
	await cropper.hover();
	// The tray overlays the thread: nothing behind it was reflowed or hidden.
	expect(await heading.boundingBox()).toEqual(before);
	expect(await tip.boundingBox()).toEqual(tipBefore);
	await expect(tip).toHaveCount(1);
	const trayBox = await tray.boundingBox();
	const footer = await page.getByRole('contentinfo').boundingBox();
	expect(trayBox!.y + trayBox!.height).toBeLessThanOrEqual(footer!.y + 1);
	expect(trayBox!.y).toBeGreaterThanOrEqual(0);

	await page.getByRole('button', { name: 'Remove photo' }).click();
	await expect(tray).not.toHaveClass(/is-raised/);
	await expect(page.getByRole('slider', { name: 'Zoom photo' })).toBeHidden();
	expect(await heading.boundingBox()).toEqual(before);
	expect(await tip.boundingBox()).toEqual(tipBefore);

	// Sending lowers the tray too; the thread keeps the tip, and the cover lands as the next message.
	await page.locator('input[type="file"]').setInputFiles(sharpCover);
	await expect(tray).toHaveClass(/is-raised/);
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(tray).not.toHaveClass(/is-raised/);
	await expect(page.getByRole('img', { name: 'Your cover' })).toBeVisible();
	await expect(tip).toBeVisible();
	await expect(page.getByRole('heading', { name: 'What should we call it?' })).toBeVisible();
	await expect(page.locator('.reactEasyCrop_Container')).toHaveCount(0);
});
