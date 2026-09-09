export type CreateDraft = {
	goal: number | null;
	coverUrl: string;
	coverName: string;
	title: string;
	story: string;
};

const emptyDraft = (): CreateDraft => ({
	goal: null,
	coverUrl: '',
	coverName: '',
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
	if (draft.coverUrl) URL.revokeObjectURL(draft.coverUrl);
	draft = emptyDraft();
	emit();
}

export function setCover(file: File) {
	if (draft.coverUrl) URL.revokeObjectURL(draft.coverUrl);
	draft = {
		...draft,
		coverUrl: URL.createObjectURL(file),
		coverName: file.name
	};
	emit();
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
