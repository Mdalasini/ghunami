import {
	type ChangeEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	useSyncExternalStore
} from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { TITLE_MAX } from '../../convex/lib/fundFields';
import { CoverPhotoField, type CoverPhotoFieldHandle } from './CoverPhotoField';
import { Modal } from './Modal';
import {
	PLAIN_FORMATS,
	StoryEditor,
	type StoryEditorHandle,
	type StoryFormats,
	StoryToolbar
} from './StoryEditor';
import { clearCover, formatGoal, getDraft, parseGoalText, patchDraft, resetDraft, subscribeDraft } from '../lib/draft';
import { draftFromPreview, persistDraft, type PreviewFundDraft } from '../lib/persistFund';
import { STORY_MAX, isStoryEmpty, storyLength } from '../lib/richText';

export type EditField = 'goal' | 'cover' | 'title' | 'story';

const COPY: Record<EditField, { title: string; sub: string }> = {
	goal: {
		title: 'Fundraising goal',
		sub: 'Pick a starting number for your goal. You can update this later as things change.'
	},
	cover: {
		title: 'Cover image',
		sub: 'A clear photo of the person or place helps more than a logo. Use a clear, bright photo. If possible, pick one from a happier time.'
	},
	title: {
		title: 'Fundraiser title',
		sub: 'Say who it’s for and the action, like “Help Maya get home”. A good title mentions who or what it’s for, and the action.'
	},
	story: {
		title: 'Fundraiser story',
		sub: 'Use plain words. Explain who it’s for, and what the money does.'
	}
};

const SUGGESTED = [50_000, 100_000, 250_000, 500_000];
const underline = 'border-b-2 border-line pb-2 transition-colors duration-150 focus-within:border-accent';

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
	const copy = COPY[field];
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

	const storyChars = storyLength(draft.story);
	const canSave =
		(field === 'goal' && draft.goal !== null && draft.goal > 0) ||
		(field === 'cover' && coverReady) ||
		(field === 'title' && draft.title.trim().length > 0) ||
		(field === 'story' && !isStoryEmpty(draft.story) && storyChars <= STORY_MAX);
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
				create: async () => {
					throw new Error('Fund not found');
				},
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

	function onTextKeydown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'Enter' && (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) {
			event.preventDefault();
		}
	}

	function onGoalKeydown(event: KeyboardEvent<HTMLInputElement>) {
		onTextKeydown(event);
		if (event.key.length === 1 && !/[0-9]/.test(event.key) && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
		}
	}

	function onGoalInput(event: ChangeEvent<HTMLInputElement>) {
		const parsed = parseGoalText(event.currentTarget.value);
		patchDraft({ goal: parsed.goal });
		setGoalText(parsed.text);
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
						<>
							<label className={`flex items-center gap-3 ${underline}`}>
								<span className="sr-only">Goal in Kenyan shillings</span>
								<span className="shrink-0 text-xl font-extrabold text-accent md:text-2xl" aria-hidden="true">
									Ksh
								</span>
								<input
									ref={fieldRef}
									className="field-bare min-w-0 flex-1 text-2xl font-extrabold tracking-[-0.02em] placeholder:font-medium md:text-3xl"
									inputMode="numeric"
									autoComplete="off"
									placeholder="Type your answer here..."
									value={goalText}
									onChange={onGoalInput}
									onKeyDown={onGoalKeydown}
								/>
							</label>
							<div className="flex flex-wrap gap-2" role="group" aria-label="Suggested goals">
								{SUGGESTED.map((amount) => (
									<button
										key={amount}
										type="button"
										className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition-[color,background-color,border-color,transform] duration-150 active:scale-95 ${
											draft.goal === amount
												? 'border-accent bg-accent text-card'
												: 'border-line bg-card text-accent hover:border-accent'
										}`}
										aria-pressed={draft.goal === amount}
										onClick={() => {
											patchDraft({ goal: amount });
											setGoalText(amount.toLocaleString('en-KE'));
											fieldRef.current?.focus({ preventScroll: true });
										}}
									>
										{formatGoal(amount)}
									</button>
								))}
							</div>
						</>
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
						<>
							<label className={`flex items-center ${underline}`}>
								<span className="sr-only">Title</span>
								<input
									ref={fieldRef}
									className="field-bare min-w-0 flex-1 text-2xl font-bold tracking-[-0.01em] placeholder:font-medium md:text-3xl"
									maxLength={TITLE_MAX}
									autoComplete="off"
									placeholder="Type your answer here..."
									value={draft.title}
									onChange={(event) => patchDraft({ title: event.currentTarget.value })}
									onKeyDown={onTextKeydown}
								/>
							</label>
							<p className="text-xs font-medium text-hint tabular-nums">
								{draft.title.length} / {TITLE_MAX}
							</p>
						</>
					) : null}
					{field === 'story' ? (
						<>
							<StoryToolbar formats={storyFormats} editor={storyRef} />
							<div className={underline}>
								<StoryEditor
									ref={storyRef}
									value={draft.story}
									onChange={(story) => patchDraft({ story })}
									onFormatsChange={onStoryFormats}
									onKeyDown={onStoryKeydown}
									placeholder="Type your answer here..."
								/>
							</div>
							<p
								className={`text-right text-xs font-medium tabular-nums ${storyChars > STORY_MAX ? 'font-bold text-error' : 'text-hint'}`}
							>
								{storyChars} / {STORY_MAX}
							</p>
						</>
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
