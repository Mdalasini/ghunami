import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatGoal } from '../../src/lib/draft';

describe('draft', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function loadDraft() {
		return await import('../../src/lib/draft');
	}

	it('starts empty', async () => {
		const { getDraft } = await loadDraft();
		expect(getDraft()).toEqual({
			goal: null,
			coverUrl: '',
			coverName: '',
			coverSkipped: false,
			title: '',
			story: ''
		});
	});

	it('clears a skipped flag when a cover is set and revokes it on clearCover', async () => {
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:cover');
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

		const { setCover, clearCover, patchDraft, getDraft } = await loadDraft();
		patchDraft({ coverSkipped: true });
		expect(getDraft().coverSkipped).toBe(true);

		setCover(new File(['a'], 'cover.png', { type: 'image/png' }));
		expect(getDraft()).toMatchObject({ coverUrl: 'blob:cover', coverSkipped: false });

		clearCover();
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover');
		expect(getDraft()).toMatchObject({ coverUrl: '', coverName: '', coverEdit: undefined });
		createObjectURL.mockRestore();
		revokeObjectURL.mockRestore();
	});

	it('patches only provided fields', async () => {
		const { getDraft, patchDraft } = await loadDraft();
		patchDraft({ title: 'Help Maya get home', goal: 50_000 });
		expect(getDraft()).toMatchObject({
			title: 'Help Maya get home',
			goal: 50_000,
			story: '',
			coverUrl: '',
			coverName: ''
		});
	});

	it('notifies subscribers and unsubscribes', async () => {
		const { patchDraft, subscribeDraft } = await loadDraft();
		const listener = vi.fn();
		const unsubscribe = subscribeDraft(listener);
		patchDraft({ title: 'One' });
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		patchDraft({ title: 'Two' });
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('revokes the previous cover when replacing or resetting', async () => {
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => {
			const name = file instanceof File ? file.name : 'blob';
			return `blob:${name}`;
		});
		const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

		const { setCover, resetDraft, getDraft } = await loadDraft();
		setCover(new File(['a'], 'first.png', { type: 'image/png' }));
		expect(getDraft().coverName).toBe('first.png');
		expect(getDraft().coverUrl).toBe('blob:first.png');

		setCover(new File(['b'], 'second.jpg', { type: 'image/jpeg' }));
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:first.png');
		expect(getDraft().coverName).toBe('second.jpg');

		resetDraft();
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:second.jpg');
		expect(getDraft()).toMatchObject({ coverUrl: '', coverName: '', title: '' });
		createObjectURL.mockRestore();
		revokeObjectURL.mockRestore();
	});

	it('isolates module state between tests', async () => {
		const { getDraft } = await loadDraft();
		expect(getDraft().title).toBe('');
	});

	it('formats KES amounts without depending on exact currency spacing', () => {
		const formatted = formatGoal(250_000);
		expect(formatted).toMatch(/250,000/);
		expect(formatted.toUpperCase()).toMatch(/KES|KSH/);
	});
});
