export type CoverEdit = {
	original: File;
	crop: { x: number; y: number; width: number; height: number };
};

export type CreateDraft = {
	fundID: string;
	idempotencyKey: string;
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

function newIdempotencyKey() {
	return crypto.randomUUID();
}

const emptyDraft = (): CreateDraft => ({
	fundID: '',
	idempotencyKey: newIdempotencyKey(),
	goal: null,
	coverUrl: '',
	coverName: '',
	coverSkipped: false,
	title: '',
	story: ''
});

let draft: CreateDraft = emptyDraft();
const listeners = new Set<() => void>();

function emit() {
	listeners.forEach((listener) => {
		listener();
	});
}

function revoke(url: string) {
	if (url) URL.revokeObjectURL(url);
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

export function patchDraft(partial: Partial<CreateDraft>) {
	draft = { ...draft, ...partial };
	emit();
}

export function parseGoalText(value: string): { goal: number | null; text: string } {
	const digits = value.replace(/[^\d]/g, '');
	if (!digits) return { goal: null, text: '' };
	const amount = Number(digits);
	return { goal: amount > 0 ? amount : null, text: amount.toLocaleString('en-KE') };
}

export function formatGoal(amount: number) {
	return new Intl.NumberFormat('en-KE', {
		style: 'currency',
		currency: 'KES',
		maximumFractionDigits: 0
	}).format(amount);
}
