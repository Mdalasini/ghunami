import {
	type ChangeEvent,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore
} from 'react';
import { Link, useNavigate, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { TITLE_MAX } from '../../convex/lib/fundFields';
import { isFundID } from '../../convex/lib/fundId';
import { AuthGate } from '../components/AuthGate';
import { CoverPhotoField, type CoverPhotoFieldHandle } from '../components/CoverPhotoField';
import {
	PLAIN_FORMATS,
	StoryEditor,
	type StoryEditorHandle,
	type StoryFormats,
	StoryToolbar
} from '../components/StoryEditor';
import { HorizonDisc } from '../components/HorizonMark';
import { clearCover, formatGoal, getDraft, patchDraft, resetDraft, subscribeDraft, type CreateDraft } from '../lib/draft';
import { coverMediaUrl } from '../lib/media';
import { persistDraft } from '../lib/persistFund';
import { requireSession } from '../lib/requireSession';
import { STORY_MAX, isStoryEmpty, storyLength } from '../lib/richText';

const STEPS = [
	{
		q: 'Fundraising goal',
		sub: 'Pick a starting number for your goal. You can update this later as things change.'
	},
	{
		q: 'Cover image',
		sub: 'A clear photo of the person or place helps more than a logo. Use a clear, bright photo. If possible, pick one from a happier time.'
	},
	{
		q: 'Fundraiser title',
		sub: 'Say who it’s for and the action, like “Help Maya get home”. A good title mentions who or what it’s for, and the action.'
	},
	{
		q: 'Fundraiser story',
		sub: 'Use plain words. Explain who it’s for, and what the money does.'
	}
] as const;

const LAST = STEPS.length;
const SUGGESTED = [50_000, 100_000, 250_000, 500_000];

type Direction = 'forward' | 'back';

function Key({ children }: { children: ReactNode }) {
	return <strong className="font-extrabold text-mute">{children}</strong>;
}

function Chevron({ direction, className = 'h-5 w-5' }: { direction: 'up' | 'down' | 'right'; className?: string }) {
	const path =
		direction === 'up' ? 'M4 12.5 10 6.5l6 6' : direction === 'down' ? 'M4 7.5 10 13.5l6-6' : 'M7.5 4 13.5 10l-6 6';
	return (
		<svg
			viewBox="0 0 20 20"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth="2.4"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={path} />
		</svg>
	);
}

function Check({ className }: { className: string }) {
	return (
		<svg
			viewBox="0 0 20 20"
			className={className}
			fill="none"
			stroke="currentColor"
			strokeWidth="3"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M4 10.5 8 14.5 16 6" />
		</svg>
	);
}

/* The numbered badge and heading that lead every question. */
function Question({ n, q, sub }: { n: number; q: string; sub: string }) {
	return (
		<div className="flex items-start gap-3">
			<span
				className="mt-1.5 inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md bg-ink px-1.5 text-xs font-extrabold text-card"
				aria-hidden="true"
			>
				{n}
				<Chevron direction="right" className="h-3 w-3" />
			</span>
			<div className="min-w-0">
				<h1 className="text-2xl leading-[1.15] font-extrabold tracking-[-0.02em] text-balance md:text-3xl md:leading-[1.12]">
					{q}
				</h1>
				<p className="mt-2 text-base text-mute md:text-lg">{sub}</p>
			</div>
		</div>
	);
}

export function meta() {
	return [{ title: 'Start a fundraiser · Ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	requireSession(request);
	return null;
}

export default function Create() {
	return (
		<AuthGate>
			<CreateForm />
		</AuthGate>
	);
}

function CreateForm() {
	const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft);
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const fundIDParam = searchParams.get('fundID') ?? '';
	const editing = isFundID(fundIDParam);
	const saved = useQuery(api.funds.getPreview, editing ? { fundID: fundIDParam } : 'skip');
	const generateUploadUrl = useMutation(api.funds.generateUploadUrl);
	const registerUpload = useMutation(api.funds.registerUpload);
	const createFund = useMutation(api.funds.create);
	const updateFund = useMutation(api.funds.update);

	const requestedStep = Number(searchParams.get('step'));
	const [step, setStep] = useState(() =>
		!editing && draft.goal !== null && requestedStep >= 1 && requestedStep <= LAST && Number.isInteger(requestedStep)
			? requestedStep : 1
	);
	const [returnToPreview, setReturnToPreview] = useState(searchParams.get('from') === 'preview');
	const [direction, setDirection] = useState<Direction>('forward');
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState('');
	const [ready, setReady] = useState(!editing);

	const [goalText, setGoalText] = useState(() =>
		draft.goal !== null ? draft.goal.toLocaleString('en-KE') : ''
	);
	const [coverReady, setCoverReady] = useState(false);
	const [coverBusy, setCoverBusy] = useState(false);
	const [storyFormats, setStoryFormats] = useState<StoryFormats>(PLAIN_FORMATS);
	const coverField = useRef<CoverPhotoFieldHandle>(null);
	const fieldRef = useRef<HTMLInputElement>(null);
	const storyRef = useRef<StoryEditorHandle>(null);
	const okRef = useRef<HTMLButtonElement>(null);
	const hydratedFor = useRef('');
	const savingRef = useRef(false);

	const current = STEPS[step - 1];
	if (!current) {
		throw new Error('Invalid create step');
	}

	const storyChars = storyLength(draft.story);

	const canContinue =
		(step === 1 && draft.goal !== null && draft.goal > 0) ||
		(step === 2 && coverReady) ||
		(step === 3 && draft.title.trim().length > 0) ||
		(step === 4 && !isStoryEmpty(draft.story) && storyChars <= STORY_MAX);

	const busy = coverBusy || saving;

	useEffect(() => {
		if (editing) return;
		if (getDraft().fundID) resetDraft();
	}, [editing]);

	useEffect(() => {
		if (!editing) return;
		if (saved === undefined) return;
		if (saved === null) {
			setReady(true);
			return;
		}
		if (hydratedFor.current === saved.fundID) {
			setReady(true);
			return;
		}
		hydratedFor.current = saved.fundID;
		let cancelled = false;
		void (async () => {
			resetDraft();
			const next = {
				fundID: saved.fundID,
				goal: saved.goal,
				title: saved.title,
				story: saved.story,
				coverSkipped: saved.coverSkipped,
				coverUrl: saved.hasCover ? coverMediaUrl(saved.fundID) : '',
				coverName: saved.coverName ?? '',
				coverEdit: undefined as CreateDraft['coverEdit']
			};
			if (saved.hasOriginal && saved.coverCrop) {
				try {
					const response = await fetch(coverMediaUrl(saved.fundID, 'original'));
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
			if (cancelled) return;
			patchDraft(next);
			setGoalText(saved.goal.toLocaleString('en-KE'));
			if (requestedStep >= 1 && requestedStep <= LAST && Number.isInteger(requestedStep)) {
				setStep(requestedStep);
			}
			setReady(true);
		})();
		return () => {
			cancelled = true;
		};
	}, [editing, saved, requestedStep]);

	/* Each question arrives with the field ready to type into. */
	useEffect(() => {
		if (step === 4) {
			storyRef.current?.focus();
			return;
		}
		if (step === 2) {
			if (coverReady) okRef.current?.focus({ preventScroll: true });
			return;
		}

		fieldRef.current?.focus({ preventScroll: true });
	}, [step, coverReady]);

	useEffect(() => {
		window.scrollTo({ top: 0, behavior: 'instant' });
	}, [step]);

	const onStoryFormats = useCallback((formats: StoryFormats) => setStoryFormats(formats), []);

	function parseGoal(value: string) {
		const digits = value.replace(/[^\d]/g, '');
		if (!digits) {
			patchDraft({ goal: null });
			setGoalText('');
			return;
		}
		const amount = Number(digits);
		patchDraft({ goal: amount > 0 ? amount : null });
		setGoalText(amount.toLocaleString('en-KE'));
	}

	function pickSuggested(amount: number) {
		patchDraft({ goal: amount });
		setGoalText(amount.toLocaleString('en-KE'));
		fieldRef.current?.focus({ preventScroll: true });
	}

	function show(n: number) {
		setDirection(n > step ? 'forward' : 'back');
		setStep(n);
	}

	async function saveAndPreview() {
		if (savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		setSaveError('');
		try {
			const fundID = await persistDraft({
				draft: getDraft(),
				generateUploadUrl: () => generateUploadUrl({}),
				registerUpload: (args) => registerUpload(args),
				create: (args) => createFund(args),
				update: (args) => updateFund(args)
			});
			patchDraft({ fundID });
			navigate(`/preview/${fundID}`);
		} catch (error) {
			savingRef.current = false;
			setSaveError(error instanceof Error ? error.message : 'We couldn’t save this fund. Try again.');
		} finally {
			setSaving(false);
		}
	}

	function advance() {
		if (returnToPreview || step === LAST) {
			void saveAndPreview();
			return;
		}

		show(step + 1);
	}

	async function goNext() {
		if (!canContinue || busy) return;
		if (step === 2 && coverField.current) {
			const confirmed = await coverField.current.confirm();
			if (!confirmed) return;
		}

		advance();
	}

	function skipCover() {
		if (busy || step !== 2) return;
		clearCover();
		patchDraft({ coverSkipped: true });
		advance();
	}

	function goBack() {
		if (busy) return;

		if (step > 1) {
			setReturnToPreview(false);
			show(step - 1);
		}
	}

	/* The down arrow is OK without the button: a skipped cover still counts as answered. */
	const canGoForward = !busy && (canContinue || (step === 2 && draft.coverSkipped));

	function goForward() {
		if (!canGoForward) return;
		if (step === 2 && !coverReady) {
			advance();
			return;
		}
		void goNext();
	}

	function onStoryKeydown(event: KeyboardEvent<HTMLElement>) {
		if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey) return;
		event.preventDefault();
		if (!event.ctrlKey && !event.metaKey && !event.altKey) {
			void goNext();
		}
	}

	/* Plain Enter submits the form; Enter with a modifier is not an answer. */
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
		parseGoal(event.currentTarget.value);
	}

	/* Enter anywhere on the question moves on, unless a control (button, link, field, slider) owns it. */
	function onFormKeydown(event: KeyboardEvent<HTMLFormElement>) {
		if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
		if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target as HTMLElement;
		if (target.closest('button, a, [contenteditable="true"], input')) return;
		event.preventDefault();
		void goNext();
	}

	const progress = ((step - 1) / LAST) * 100;
	const showSkip = step === 2 && !coverReady && !busy;
	const underline =
		'border-b-2 border-line pb-2 transition-colors duration-150 focus-within:border-accent';

	function field() {
		if (step === 1) {
			return (
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
					<div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Suggested goals">
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
								onClick={() => pickSuggested(amount)}
							>
								{formatGoal(amount)}
							</button>
						))}
					</div>
				</>
			);
		}
		if (step === 2) {
			return (
				<CoverPhotoField
					ref={coverField}
					coverUrl={draft.coverUrl}
					onReadyChange={setCoverReady}
					onBusyChange={setCoverBusy}
				/>
			);
		}
		if (step === 3) {
			return (
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
					<p className="mt-2 text-xs font-medium text-hint tabular-nums">
						{draft.title.length} / {TITLE_MAX}
					</p>
				</>
			);
		}
		if (step === 4) {
			return (
				<>
					<div className="mb-3">
						<StoryToolbar formats={storyFormats} editor={storyRef} />
					</div>
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
					<div className="mt-2 flex items-center justify-between gap-3 text-xs font-medium text-hint">
						<span>
							<Key>Shift ⇧</Key> + <Key>Enter ↵</Key> to make a line break
						</span>
						<span className={`tabular-nums ${storyChars > STORY_MAX ? 'font-bold text-error' : ''}`}>
							{storyChars} / {STORY_MAX}
						</span>
					</div>
				</>
			);
		}
		return null;
	}

	if (editing && saved === null) {
		return (
			<div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-5 px-6">
				<h1 className="text-3xl font-extrabold">Fund not found</h1>
				<p className="text-mute">This draft isn’t available. It may have been removed, or it belongs to someone else.</p>
				<Link to="/funds" className="btn-press self-start bg-accent text-card hover:bg-accent-deep">
					My funds
				</Link>
			</div>
		);
	}

	if (editing && !ready) {
		return (
			<div className="flex min-h-dvh flex-col items-center justify-center gap-4">
				<p className="text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
			</div>
		);
	}

	return (
		<div className="flex min-h-dvh flex-col">
			<div className="fixed inset-x-0 top-0 z-20 h-1.5 bg-line" role="presentation">
				<div
					className="h-full bg-accent transition-[width] duration-500 ease-out"
					style={{ width: `${progress}%` }}
					aria-hidden="true"
				/>
			</div>

			<header className="mx-auto flex w-full max-w-[44rem] items-center justify-between px-6 pt-6">
				<span className="inline-flex items-center gap-2">
					<HorizonDisc className="h-9 w-9" />
					<span className="text-sm font-extrabold">Ghunami</span>
				</span>
				<Link
					to="/"
					aria-label="Cancel and go home"
					className="inline-flex h-10 w-10 items-center justify-center rounded-full text-mute transition-colors hover:bg-card hover:text-ink"
				>
					<svg
						viewBox="0 0 16 16"
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M3 3l10 10M13 3L3 13" />
					</svg>
				</Link>
			</header>

			<main className="mx-auto flex w-full max-w-[44rem] flex-1 flex-col justify-center px-6 py-10 md:py-16">
				<form
					key={step}
					className={`${direction === 'forward' ? 'slide-forward' : 'slide-back'} flex flex-col gap-8`}
					onKeyDown={onFormKeydown}
					onSubmit={(event) => {
						event.preventDefault();
						void goNext();
					}}
				>
					<Question n={step} q={current.q} sub={current.sub} />

					<div className="pl-0 md:pl-11">{field()}</div>

					<div className="flex flex-wrap items-center gap-4 pl-0 md:pl-11">
						<button
							ref={okRef}
							type="submit"
							className={`btn-press min-w-28 gap-2 ${
								!canContinue || busy ? 'bg-line text-mute' : 'bg-accent text-card hover:bg-accent-deep'
							}`}
							disabled={!canContinue || busy}
						>
							{saving ? 'Saving…' : step === LAST ? 'Preview fund' : 'OK'}
							<Check className="h-4 w-4" />
						</button>
						<span className="text-xs font-medium text-hint">
							press <Key>Enter ↵</Key>
						</span>
						{showSkip && (
							<button
								type="button"
								className="ml-auto rounded-full px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:bg-card"
								onClick={skipCover}
							>
								Skip for now
							</button>
						)}
					</div>
					{saveError ? (
						<p className="pl-0 text-sm font-medium text-error md:pl-11" role="alert">
							{saveError}
						</p>
					) : null}
				</form>
			</main>

			<footer className="sticky bottom-0 z-10 bg-paper/95 backdrop-blur">
				<div className="mx-auto flex w-full max-w-[44rem] items-center justify-between gap-4 px-6 py-4">
					<p className="text-xs font-medium text-mute" aria-live="polite">
						{`Step ${step} of ${LAST}`}
					</p>
					<div className="flex overflow-hidden rounded-xl bg-accent text-card" role="group" aria-label="Questions">
						<button
							type="button"
							className="inline-flex h-10 w-11 items-center justify-center transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
							onClick={goBack}
							disabled={busy || step <= 1}
							aria-label="Previous question"
						>
							<Chevron direction="up" />
						</button>
						<span className="my-2 w-px bg-card/30" aria-hidden="true" />
						<button
							type="button"
							className="inline-flex h-10 w-11 items-center justify-center transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
							onClick={goForward}
							disabled={!canGoForward}
							aria-label="Next question"
						>
							<Chevron direction="down" />
						</button>
					</div>
				</div>
			</footer>
		</div>
	);
}
