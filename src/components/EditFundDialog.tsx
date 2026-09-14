import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { CoverPhotoField, type CoverPhotoFieldHandle } from './CoverPhotoField';
import {
	FIELD_COPY,
	GoalField,
	StoryField,
	TitleField,
	canSaveField,
	type FundField
} from './FundFields';
import { Modal } from './Modal';
import { PLAIN_FORMATS, type StoryEditorHandle, type StoryFormats } from './StoryEditor';
import { clearCover, getDraft, patchDraft, resetDraft, subscribeDraft } from '../lib/draft';
import { draftFromPreview, persistDraft, type PreviewFundDraft } from '../lib/persistFund';

export type EditField = FundField;

export function EditFundDialog({
	fund,
	field,
	onClose
}: {
	fund: PreviewFundDraft;
	field: EditField;
	onClose: () => void;
}) {
	const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft);
	const generateUploadUrl = useMutation(api.funds.generateUploadUrl);
	const registerUpload = useMutation(api.funds.registerUpload);
	const discardUpload = useMutation(api.funds.discardUpload);
	const updateFund = useMutation(api.funds.update);
	const titleId = useId();
	const copy = FIELD_COPY[field];
	const [ready, setReady] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState('');
	const [goalText, setGoalText] = useState(fund.goal.toLocaleString('en-KE'));
	const [coverReady, setCoverReady] = useState(false);
	const [coverBusy, setCoverBusy] = useState(false);
	const [storyFormats, setStoryFormats] = useState<StoryFormats>(PLAIN_FORMATS);
	const coverField = useRef<CoverPhotoFieldHandle>(null);
	const fieldRef = useRef<HTMLInputElement>(null);
	const storyRef = useRef<StoryEditorHandle>(null);
	const savingRef = useRef(false);

	const saved = useRef(fund).current;

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			resetDraft();
			const next = await draftFromPreview(saved, { original: field === 'cover' });
			if (cancelled) return;
			patchDraft(next);
			setGoalText(saved.goal.toLocaleString('en-KE'));
			setReady(true);
		})();
		return () => {
			cancelled = true;
		};
	}, [saved, field]);

	const canSave = canSaveField(field, draft, coverReady);
	const busy = coverBusy || saving;
	const showSkip = field === 'cover' && !coverReady && !busy && ready;

	function close() {
		if (savingRef.current) return;
		resetDraft();
		onClose();
	}

	async function save(force = false) {
		if (savingRef.current || (!canSave && !force)) return;
		if (!force && field === 'cover' && coverField.current) {
			const confirmed = await coverField.current.confirm();
			if (!confirmed) return;
		}
		savingRef.current = true;
		setSaving(true);
		setSaveError('');
		try {
			await persistDraft({
				draft: getDraft(),
				generateUploadUrl: () => generateUploadUrl({}),
				registerUpload: (args) => registerUpload(args),
				discardUpload: (args) => discardUpload(args),
				update: (args) => updateFund(args)
			});
			resetDraft();
			onClose();
		} catch (error) {
			savingRef.current = false;
			setSaveError(error instanceof Error ? error.message : 'We couldn’t save this fund. Try again.');
			setSaving(false);
		}
	}

	function skipCover() {
		if (busy || field !== 'cover') return;
		clearCover();
		patchDraft({ coverSkipped: true });
		void save(true);
	}

	const onStoryFormats = useCallback((formats: StoryFormats) => setStoryFormats(formats), []);

	useEffect(() => {
		if (!ready) return;
		if (field === 'story') storyRef.current?.focus();
		else fieldRef.current?.focus({ preventScroll: true });
	}, [ready, field]);

	function onStoryKeydown(event: KeyboardEvent<HTMLElement>) {
		if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) return;
		event.preventDefault();
		if (!event.ctrlKey && !event.metaKey && !event.altKey) void save();
	}

	return (
		<Modal
			titleId={titleId}
			title={copy.title}
			onClose={close}
			closeDisabled={busy}
			closeLabel="Cancel editing"
			className={field === 'cover' || field === 'story' ? 'max-w-xl' : 'max-w-md'}
		>
			<p className="mt-2 text-sm leading-relaxed text-mute md:text-base">{copy.sub}</p>
			{!ready ? (
				<p className="mt-8 text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
			) : (
				<form
					className="mt-6 flex flex-col gap-6"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					{field === 'goal' ? (
						<GoalField
							goal={draft.goal}
							goalText={goalText}
							setGoalText={setGoalText}
							fieldRef={fieldRef}
							suggestedClassName="flex flex-wrap gap-2"
						/>
					) : null}
					{field === 'cover' ? (
						<CoverPhotoField
							ref={coverField}
							coverUrl={draft.coverUrl}
							onReadyChange={setCoverReady}
							onBusyChange={setCoverBusy}
						/>
					) : null}
					{field === 'title' ? (
						<TitleField
							title={draft.title}
							fieldRef={fieldRef}
							counterClassName="text-xs font-medium text-hint tabular-nums"
						/>
					) : null}
					{field === 'story' ? (
						<StoryField
							value={draft.story}
							formats={storyFormats}
							editor={storyRef}
							onChange={(story) => patchDraft({ story })}
							onFormatsChange={onStoryFormats}
							onKeyDown={onStoryKeydown}
						/>
					) : null}
					<div className="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							className={`btn-press min-w-28 ${
								!canSave || busy ? 'bg-line text-mute' : 'bg-accent text-card hover:bg-accent-deep'
							}`}
							disabled={!canSave || busy}
						>
							{saving ? 'Saving…' : 'Save'}
						</button>
						<button
							type="button"
							className="btn-press border-2 border-line bg-card px-5 text-accent [--btn-edge:var(--color-line)]"
							disabled={busy}
							onClick={close}
						>
							Cancel
						</button>
						{showSkip ? (
							<button
								type="button"
								className="ml-auto rounded-full px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:bg-card"
								onClick={skipCover}
							>
								Skip for now
							</button>
						) : null}
					</div>
					{saveError ? (
						<p className="text-sm font-medium text-error" role="alert">
							{saveError}
						</p>
					) : null}
				</form>
			)}
		</Modal>
	);
}
