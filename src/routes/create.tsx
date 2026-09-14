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
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CoverImage } from '../components/CoverImage';
import { CoverPhotoField, type CoverPhotoFieldHandle } from '../components/CoverPhotoField';
import {
	PLAIN_FORMATS,
	StoryEditor,
	type StoryEditorHandle,
	type StoryFormats,
	StoryToolbar
} from '../components/StoryEditor';
import { HorizonDisc } from '../components/HorizonMark';
import { clearCover, formatGoal, getDraft, patchDraft, resetDraft, subscribeDraft } from '../lib/draft';
import { STORY_MAX, isStoryEmpty, storyLength } from '../lib/richText';

const STEPS = [
	{
		q: 'Fundraising goal',
		sub: 'Pick a starting number for your goal. You can update this later as things change.',
		label: 'Goal'
	},
	{
		q: 'Cover image',
		sub: 'A clear photo of the person or place helps more than a logo. Use a clear, bright photo. If possible, pick one from a happier time.',
		label: 'Cover'
	},
	{
		q: 'Fundraiser title',
		sub: 'Say who it’s for and the action, like “Help Maya get home”. A good title mentions who or what it’s for, and the action.',
		label: 'Title'
	},
	{
		q: 'Fundraiser story',
		sub: 'Use plain words. Explain who it’s for, and what the money does.',
		label: 'Story'
	},
	{ q: 'Does this look right?', sub: 'Choose any answer to change it.', label: 'Review' }
] as const;

const LAST = STEPS.length;
const TITLE_MAX = 80;
const SUGGESTED = [50_000, 100_000, 250_000, 500_000];
const SKIP_COVER_MESSAGE = 'I’ll return to this later';

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

/* One row of the review card. Pressing it jumps back to that question. */
function Answer({
	n,
	label,
	onEdit,
	children
}: {
	n: number;
	label: string;
	onEdit: (n: number) => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			data-answer={n}
			className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-sun/40 focus-visible:bg-sun/40 focus-visible:outline-0"
			aria-label={`Change your answer to step ${n}`}
			onClick={() => onEdit(n)}
		>
			<span className="w-14 shrink-0 text-xs font-extrabold tracking-wider text-hint uppercase" aria-hidden="true">
				{label}
			</span>
			<span className="min-w-0 flex-1">{children}</span>
			<span className="shrink-0 text-accent" aria-hidden="true">
				<Chevron direction="right" />
			</span>
		</button>
	);
}

export function meta() {
	return [{ title: 'Start a fundraiser · Ghunami' }];
}

export default function Create() {
	const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft);
	const navigate = useNavigate();
		const [searchParams] = useSearchParams();
		const requestedStep = Number(searchParams.get('step'));
		const [step, setStep] = useState(() =>
			draft.goal !== null && requestedStep >= 1 && requestedStep <= LAST && Number.isInteger(requestedStep)
				? requestedStep : 1
		);
		const [returnToPreview, setReturnToPreview] = useState(searchParams.get('from') === 'preview');
	const [direction, setDirection] = useState<Direction>('forward');
	const [done, setDone] = useState(false);
	/* Set when a question was opened from the review, so the next answer returns there. */
	const [returnToReview, setReturnToReview] = useState(false);
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

	const current = STEPS[step - 1];
	if (!current) {
		throw new Error('Invalid create step');
	}

	const storyChars = storyLength(draft.story);

	const canContinue =
		(step === 1 && draft.goal !== null && draft.goal > 0) ||
		(step === 2 && coverReady) ||
		(step === 3 && draft.title.trim().length > 0) ||
		(step === 4 && !isStoryEmpty(draft.story) && storyChars <= STORY_MAX) ||
		step === LAST;

	const busy = coverBusy;

	/* Each question arrives with the field ready to type into. */
	useEffect(() => {
		if (done) return;
		if (step === 4) {
			storyRef.current?.focus();
			return;
		}
		if (step === 2) {
			if (coverReady) okRef.current?.focus({ preventScroll: true });
			return;
		}
		if (step === LAST) {
			okRef.current?.focus({ preventScroll: true });
			return;
		}
		fieldRef.current?.focus({ preventScroll: true });
	}, [step, done, coverReady]);

	useEffect(() => {
		window.scrollTo({ top: 0, behavior: 'instant' });
	}, [step, done]);

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
		setDone(false);
		setStep(n);
	}

	/* Open an earlier question from the review; answering it comes straight back here. */
	function edit(n: number) {
		if (busy) return;
		setReturnToReview(true);
		show(n);
	}

	function advance() {
		if (returnToPreview || (step === 4 && !returnToReview)) {
			navigate('/create/preview');
			return;
		}
		if (returnToReview) {
			setReturnToReview(false);
			show(LAST);
			return;
		}
		show(step + 1);
	}

	async function goNext() {
		if (!canContinue || busy || done) return;
		if (step === 2 && coverField.current) {
			const confirmed = await coverField.current.confirm();
			if (!confirmed) return;
		}
		if (step >= LAST) {
			setDone(true);
			return;
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
		if (done) {
			setDone(false);
			return;
		}
		if (step === LAST) {
			navigate('/create/preview');
			return;
		}
		if (step > 1) {
			setReturnToPreview(false);
			setReturnToReview(false);
			show(step - 1);
		}
	}

	/* The down arrow is OK without the button: a skipped cover still counts as answered. */
	const canGoForward = !busy && !done && step < LAST && (canContinue || (step === 2 && draft.coverSkipped));

	function goForward() {
		if (!canGoForward) return;
		if (step === 2 && !coverReady) {
			advance();
			return;
		}
		void goNext();
	}

	function startOver() {
		resetDraft();
		setGoalText('');
		setCoverReady(false);
		setCoverBusy(false);
		setDone(false);
		setReturnToPreview(false);
		setReturnToReview(false);
		setDirection('forward');
		setStep(1);
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

	const progress = done ? 100 : ((step - 1) / LAST) * 100;
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
		return (
			<div className="divide-y-2 divide-line overflow-hidden rounded-3xl border-2 border-line bg-card">
				<Answer n={2} label="Cover" onEdit={edit}>
					{draft.coverUrl ? (
						<CoverImage src={draft.coverUrl} alt="Your cover" className="w-24 rounded-xl" />
					) : (
						<span className="text-base font-medium text-mute">{SKIP_COVER_MESSAGE}</span>
					)}
				</Answer>
				<Answer n={1} label="Goal" onEdit={edit}>
					<span className="text-lg font-bold">{draft.goal !== null ? formatGoal(draft.goal) : ''}</span>
				</Answer>
				<Answer n={3} label="Title" onEdit={edit}>
					<span className="text-lg font-bold wrap-break-word">{draft.title}</span>
				</Answer>
				<Answer n={4} label="Story" onEdit={edit}>
					<div className="story-rich leading-relaxed" dangerouslySetInnerHTML={{ __html: draft.story }} />
				</Answer>
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
				{done ? (
					<div key="done" className="slide-forward flex flex-col gap-8">
						<div className="flex items-start gap-3">
							<span
								className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-card"
								aria-hidden="true"
							>
								<Check className="h-4 w-4" />
							</span>
							<div>
								<h1 className="text-2xl leading-[1.15] font-extrabold tracking-[-0.02em] md:text-3xl">
									Saved in this browser
								</h1>
								<p className="mt-2 text-base text-mute md:text-lg">Nothing is public yet. This is your draft.</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<Link
								to="/create"
								className="btn-press bg-accent text-card hover:bg-accent-deep"
								onClick={startOver}
							>
								Start another
							</Link>
							<button
								type="button"
								className="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink"
								onClick={goBack}
							>
								Back
							</button>
						</div>
					</div>
				) : (
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
								{step === LAST ? 'Looks good' : step === 4 ? 'Preview fund' : 'OK'}
								{step !== LAST && <Check className="h-4 w-4" />}
							</button>
							{step !== LAST && (
								<span className="text-xs font-medium text-hint">
									press <Key>Enter ↵</Key>
								</span>
							)}
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
					</form>
				)}
			</main>

			<footer className="sticky bottom-0 z-10 bg-paper/95 backdrop-blur">
				<div className="mx-auto flex w-full max-w-[44rem] items-center justify-between gap-4 px-6 py-4">
					<p className="text-xs font-medium text-mute" aria-live="polite">
						{done ? 'Draft saved' : `Step ${step} of ${LAST}`}
					</p>
					<div className="flex overflow-hidden rounded-xl bg-accent text-card" role="group" aria-label="Questions">
						<button
							type="button"
							className="inline-flex h-10 w-11 items-center justify-center transition-colors hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
							onClick={goBack}
							disabled={busy || (!done && step <= 1)}
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
