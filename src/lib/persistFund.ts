import type { Id } from '../../convex/_generated/dataModel';
import type { CreateDraft } from './draft';

type UploadKind = 'cover' | 'original';

export async function persistDraft(input: {
	draft: CreateDraft;
	generateUploadUrl: () => Promise<string>;
	registerUpload: (args: { storageId: Id<'_storage'>; kind: UploadKind }) => Promise<Id<'uploads'>>;
	discardUpload: (args: { uploadId: Id<'uploads'> }) => Promise<null>;
	create: (args: {
		idempotencyKey: string;
		goal: number;
		title: string;
		story: string;
		coverSkipped: boolean;
		coverUploadId?: Id<'uploads'>;
		originalUploadId?: Id<'uploads'>;
		coverCrop?: CreateDraft['coverEdit'] extends infer E
			? E extends { crop: infer C }
				? C
				: never
			: never;
		coverName?: string;
	}) => Promise<string>;
	update: (args: {
		fundID: string;
		goal: number;
		title: string;
		story: string;
		coverSkipped: boolean;
		cover: 'keep' | 'replace' | 'clear';
		coverUploadId?: Id<'uploads'>;
		originalUploadId?: Id<'uploads'>;
		coverCrop?: { x: number; y: number; width: number; height: number };
		coverName?: string;
	}) => Promise<string>;
}): Promise<string> {
	const { draft } = input;
	if (draft.goal === null) throw new Error('Enter a goal in Kenyan shillings.');

	const localCover = draft.coverUrl.startsWith('blob:');
	let coverUploadId: Id<'uploads'> | undefined;
	let originalUploadId: Id<'uploads'> | undefined;

	try {
		if (localCover) {
			const cropped = await fileFromUrl(draft.coverUrl, draft.coverName || 'cover.jpg');
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

		return await input.create({ idempotencyKey: draft.idempotencyKey, ...fields });
	} catch (error) {
		await discardNewUploads(input, coverUploadId, originalUploadId);
		throw error;
	}
}

async function discardNewUploads(
	input: { discardUpload: (args: { uploadId: Id<'uploads'> }) => Promise<null> },
	coverUploadId: Id<'uploads'> | undefined,
	originalUploadId: Id<'uploads'> | undefined
) {
	await Promise.all(
		[coverUploadId, originalUploadId]
			.filter((id): id is Id<'uploads'> => id !== undefined)
			.map((uploadId) => input.discardUpload({ uploadId }).catch(() => null))
	);
}

async function uploadAndRegister(
	input: {
		generateUploadUrl: () => Promise<string>;
		registerUpload: (args: { storageId: Id<'_storage'>; kind: UploadKind }) => Promise<Id<'uploads'>>;
	},
	file: File,
	kind: UploadKind
): Promise<Id<'uploads'>> {
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

async function fileFromUrl(url: string, name: string): Promise<File> {
	const response = await fetch(url);
	if (!response.ok) throw new Error('That photo could not be saved. Try another one.');
	const blob = await response.blob();
	return new File([blob], name, { type: blob.type || 'image/jpeg' });
}
