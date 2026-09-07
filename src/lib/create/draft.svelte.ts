export type CreateDraft = {
	goal: number | null;
	coverUrl: string;
	coverName: string;
	title: string;
	story: string;
};

export const draft: CreateDraft = $state({
	goal: null,
	coverUrl: '',
	coverName: '',
	title: '',
	story: ''
});

export function resetDraft() {
	if (draft.coverUrl) URL.revokeObjectURL(draft.coverUrl);
	draft.goal = null;
	draft.coverUrl = '';
	draft.coverName = '';
	draft.title = '';
	draft.story = '';
}

export function setCover(file: File) {
	if (draft.coverUrl) URL.revokeObjectURL(draft.coverUrl);
	draft.coverUrl = URL.createObjectURL(file);
	draft.coverName = file.name;
}

export function formatGoal(amount: number) {
	return new Intl.NumberFormat('en-KE', {
		style: 'currency',
		currency: 'KES',
		maximumFractionDigits: 0
	}).format(amount);
}
