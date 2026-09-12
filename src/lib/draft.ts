export type CoverEdit = {
	original: File;
	crop: { x: number; y: number; width: number; height: number };
};

export type CreateDraft = {
	goal: number | null;
	coverUrl: string;
	coverName: string;
	coverEdit?: CoverEdit;
	/* The person chose to add a photo later. Cleared as soon as a cover is set. */
	coverSkipped: boolean;
	title: string;
	/* Sanitized HTML. See `lib/richText.ts` for the allowed tags. */
	story: string;
};

const emptyDraft = (): CreateDraft => ({
	goal: null,
	coverUrl: '',
	coverName: '',
	coverSkipped: false,
	title: '',
	story: ''
});

export type CoverSnapshot = Pick<CreateDraft, 'coverUrl' | 'coverName' | 'coverEdit' | 'coverSkipped'>;

let draft: CreateDraft = emptyDraft();
/* While an in-place edit is open, the cover it started with stays alive so Cancel can bring it back. */
let heldCoverUrl = '';
const listeners = new Set<() => void>();

function emit() {
	listeners.forEach((listener) => {
		listener();
	});
}

function revoke(url: string) {
	if (url && url !== heldCoverUrl) URL.revokeObjectURL(url);
}

export function subscribeDraft(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getDraft(): CreateDraft {
	return draft;
}

export function resetDraft() {
	releaseHeldCover();
	revoke(draft.coverUrl);
	draft = emptyDraft();
	emit();
}

export function setCover(file: File, coverEdit?: CoverEdit) {
	revoke(draft.coverUrl);
	draft = {
		...draft,
		coverUrl: URL.createObjectURL(file),
		coverName: file.name,
		coverEdit,
		coverSkipped: false
	};
	emit();
}

export function clearCover() {
	revoke(draft.coverUrl);
	draft = { ...draft, coverUrl: '', coverName: '', coverEdit: undefined };
	emit();
}

/* Start protecting the current cover from revocation and return what to restore on cancel. */
export function holdCover(): CoverSnapshot {
	releaseHeldCover();
	heldCoverUrl = draft.coverUrl;
	return {
		coverUrl: draft.coverUrl,
		coverName: draft.coverName,
		coverEdit: draft.coverEdit,
		coverSkipped: draft.coverSkipped
	};
}

/* Cancel path: put the held cover back and drop whatever replaced it meanwhile. */
export function restoreHeldCover(snapshot: CoverSnapshot) {
	heldCoverUrl = '';
	if (draft.coverUrl !== snapshot.coverUrl) revoke(draft.coverUrl);
	draft = { ...draft, ...snapshot };
	emit();
}

/* Commit path: the edit stuck, so the old cover can go if it is no longer in use. */
export function releaseHeldCover() {
	const url = heldCoverUrl;
	heldCoverUrl = '';
	if (url && url !== draft.coverUrl) URL.revokeObjectURL(url);
}

export function patchDraft(partial: Partial<CreateDraft>) {
	draft = { ...draft, ...partial };
	emit();
}

export function formatGoal(amount: number) {
	return new Intl.NumberFormat('en-KE', {
		style: 'currency',
		currency: 'KES',
		maximumFractionDigits: 0
	}).format(amount);
}
