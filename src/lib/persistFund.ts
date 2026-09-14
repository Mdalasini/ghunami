import type { FunctionArgs } from 'convex/server';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import type { CreateDraft } from './draft';
import { coverMediaUrl } from './media';

export type PreviewFundDraft = {
	fundID: string;
	goal: number;
	title: string;
	story: string;
	coverSkipped: boolean;
	hasCover: boolean;
	hasOriginal: boolean;
	updatedAt?: number;
	coverCrop?: { x: number; y: number; width: number; height: number };
	coverName?: string;
};

export async function draftFromPreview(
	saved: PreviewFundDraft,
	opts: { original?: boolean } = {}
): Promise<
	Pick<CreateDraft, 'fundID' | 'goal' | 'title' | 'story' | 'coverSkipped' | 'coverUrl' | 'coverName' | 'coverEdit'>
> {
	const next: Pick<
		CreateDraft,
		'fundID' | 'goal' | 'title' | 'story' | 'coverSkipped' | 'coverUrl' | 'coverName' | 'coverEdit'
	> = {
		fundID: saved.fundID,
		goal: saved.goal,
		title: saved.title,
		story: saved.story,
		coverSkipped: saved.coverSkipped,
		coverUrl: saved.hasCover ? coverMediaUrl(saved.fundID, 'cover', saved.updatedAt) : '',
		coverName: saved.coverName ?? '',
		coverEdit: undefined
	};
	if (opts.original && saved.hasOriginal && saved.coverCrop) {
		try {
			const response = await fetch(coverMediaUrl(saved.fundID, 'original', saved.updatedAt));
			if (response.ok) {
				const blob = await response.blob();
				next.coverEdit = {
					original: new File([blob], saved.coverName || 'photo', { type: blob.type }),
					crop: saved.coverCrop
				};
			}
		} catch {
			// Crop editor can still use the saved cover image.
		}
	}
	return next;
}

type UploadKind = 'cover' | 'original';

type PersistFns = {
	generateUploadUrl: () => Promise<string>;
	registerUpload: (args: FunctionArgs<typeof api.funds.registerUpload>) => Promise<Id<'uploads'>>;
	discardUpload: (args: FunctionArgs<typeof api.funds.discardUpload>) => Promise<null>;
	create?: (args: FunctionArgs<typeof api.funds.create>) => Promise<string>;
	update: (args: FunctionArgs<typeof api.funds.update>) => Promise<string>;
};

export async function persistDraft(input: PersistFns & { draft: CreateDraft }): Promise<string> {
	const { draft } = input;
	if (draft.goal === null) throw new Error('Enter a goal in Kenyan shillings.');

	const localCover = draft.coverUrl.startsWith('blob:');
	let coverUploadId: Id<'uploads'> | undefined;
	let originalUploadId: Id<'uploads'> | undefined;

	try {
		if (localCover) {
			const response = await fetch(draft.coverUrl);
			if (!response.ok) throw new Error('That photo could not be saved. Try another one.');
			const blob = await response.blob();
			const cropped = new File([blob], draft.coverName || 'cover.jpg', { type: blob.type || 'image/jpeg' });
			coverUploadId = await uploadAndRegister(input, cropped, 'cover');
			if (draft.coverEdit) {
				originalUploadId = await uploadAndRegister(input, draft.coverEdit.original, 'original');
			}
		}

		const fields = {
			goal: draft.goal,
			title: draft.title,
			story: draft.story,
			coverSkipped: draft.coverSkipped,
			coverUploadId,
			originalUploadId,
			coverCrop: draft.coverEdit?.crop,
			coverName: draft.coverName || undefined
		};

		if (draft.fundID) {
			const cover = localCover ? 'replace' : draft.coverUrl ? 'keep' : 'clear';
			return await input.update({ fundID: draft.fundID, cover, ...fields });
		}

		if (!input.create) throw new Error('Fund not found');
		return await input.create({ idempotencyKey: draft.idempotencyKey, ...fields });
	} catch (error) {
		await Promise.all(
			[coverUploadId, originalUploadId]
				.filter((id): id is Id<'uploads'> => id !== undefined)
				.map((uploadId) => input.discardUpload({ uploadId }).catch(() => null))
		);
		throw error;
	}
}

async function uploadAndRegister(input: PersistFns, file: File, kind: UploadKind): Promise<Id<'uploads'>> {
	const postUrl = await input.generateUploadUrl();
	const response = await fetch(postUrl, {
		method: 'POST',
		headers: { 'Content-Type': file.type || 'application/octet-stream' },
		body: file
	});
	if (!response.ok) throw new Error('That photo could not be saved. Try another one.');
	const body = (await response.json()) as { storageId?: Id<'_storage'> };
	if (!body.storageId) throw new Error('That photo could not be saved. Try another one.');
	return await input.registerUpload({ storageId: body.storageId, kind });
}
