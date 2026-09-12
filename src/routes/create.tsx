import {
	type ChangeEvent,
	type DragEvent,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore
} from 'react';
import { Link } from 'react-router';
import { CoverImage } from '../components/CoverImage';
import { CoverPhotoField, type CoverPhotoFieldHandle } from '../components/CoverPhotoField';
import {
	PLAIN_FORMATS,
	StoryEditor,
	type StoryEditorHandle,
	type StoryFormats,
	StoryToolbar
} from '../components/StoryEditor';
import { HorizonMark, Tip } from '../components/Tip';
import { type CreateDraft, formatGoal, getDraft, patchDraft, resetDraft, subscribeDraft } from '../lib/draft';
import { STORY_MAX, isStoryEmpty, storyLength } from '../lib/richText';

const STEPS = [
	{ q: 'How much do you want to raise?', sub: 'Pick a starting number. You can change it later.', label: 'your goal' },
	{ q: 'Add a cover photo', sub: 'A clear photo of the person or place helps more than a logo.', label: 'your cover photo' },
	{ q: 'What should we call it?', sub: 'Say who it’s for and the action, like “Help Maya get home”.', label: 'the title' },
	{ q: 'Tell people what happened', sub: 'Plain words. Who it’s for, and what the money does.', label: 'your story' },
	{ q: 'Does this look right?', sub: 'Tap anything to change it.', label: 'your draft' }
] as const;

const LAST = STEPS.length;
const SUGGESTED = [50_000, 100_000, 250_000, 500_000];
const TYPING_MS = 700;
const SKIP_COVER_MESSAGE = 'I’ll return to this later';
/* Long enough to cover the reveal transitions above plus the composer swap. */
const PIN_MS = 420;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Avatar() {
	return (
		<span
			className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-card"
			aria-hidden="true"
		>
			<HorizonMark className="h-4 w-auto" />
		</span>
	);
}

/* A run of received bubbles. The avatar sits at the bottom like a thread, and the last bubble gets the tail. */
function Received({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-end gap-2.5">
			<Avatar />
			<div className="thread-group flex min-w-0 max-w-[85%] flex-col items-start gap-1.5">{children}</div>
		</div>
	);
}

/* One element for both sizes so the shrink into the thread is a transition, not a swap. */
function Question({ q, sub, current }: { q: string; sub: string; current: boolean }) {
	return (
		<div className="bubble-in min-w-0 rounded-3xl bg-card px-5 py-4">
			<p
				role={current ? 'heading' : undefined}
				aria-level={current ? 1 : undefined}
				className={`question-text font-extrabold text-balance ${
					current
						? 'text-2xl leading-[1.15] tracking-[-0.02em] md:text-3xl md:leading-[1.12]'
						: 'text-lg leading-snug tracking-[-0.01em]'
				}`}
			>
				{q}
			</p>
			<p className={`question-sub mt-1.5 text-mute ${current ? 'text-base md:text-lg' : 'text-sm'}`}>{sub}</p>
		</div>
	);
}

function Typing() {
	return (
		<div className="grow-in">
			<Received>
				<div className="bubble-in flex h-12 items-center gap-1.5 rounded-3xl bg-card px-5" aria-hidden="true">
					<span className="typing-dot" />
					<span className="typing-dot" />
					<span className="typing-dot" />
				</div>
			</Received>
		</div>
	);
}

function Sent({
	n,
	onEdit,
	active = false,
	children
}: {
	n: number;
	onEdit?: (n: number) => void;
	active?: boolean;
	children: ReactNode;
}) {
	const bubble = 'max-w-[85%] rounded-3xl rounded-br-lg bg-accent px-5 py-3 text-left text-base font-medium text-card';
	return (
		<div className="grow-in">
			<div className="fly-sent flex justify-end">
				{onEdit ? (
					<button
						type="button"
						className={`${bubble} transition-[background-color,box-shadow] hover:bg-accent-deep ${
							active ? 'bg-accent-deep ring-4 ring-accent/25' : ''
						}`}
						onClick={() => onEdit(n)}
						aria-label={`Change your answer to step ${n}`}
						aria-pressed={active}
					>
						{children}
					</button>
				) : (
					<div className={bubble}>{children}</div>
				)}
			</div>
		</div>
	);
}

function SendButton({
	disabled,
	label = 'Send',
	buttonRef
}: {
	disabled: boolean;
	label?: string;
	buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
	return (
		<button
			ref={buttonRef}
			type="submit"
			className={`send-btn inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ${
				disabled ? 'bg-line text-mute' : 'bg-accent text-card hover:bg-accent-deep active:scale-95'
			}`}
			disabled={disabled}
			aria-label={label}
		>
			<svg
				viewBox="0 0 20 20"
				className="h-5 w-5"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.6"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" />
			</svg>
		</button>
	);
}

export function meta() {
	return [{ title: 'Start a fundraiser · Ghunami' }];
}

export default function Create() {
	const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft);
	const [step, setStep] = useState(1);
	/* While set, the composer edits this earlier answer and then returns to `step`. */
	const [editing, setEditing] = useState<number | null>(null);
	const [done, setDone] = useState(false);
	const [typing, setTyping] = useState(false);
	const [sending, setSending] = useState(false);
	const [goalText, setGoalText] = useState(() =>
		draft.goal !== null ? draft.goal.toLocaleString('en-KE') : ''
	);
	const [coverReady, setCoverReady] = useState(() => getDraft().coverUrl !== '');
	const [coverBusy, setCoverBusy] = useState(false);
	const [coverCropping, setCoverCropping] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [storyFormats, setStoryFormats] = useState<StoryFormats>(PLAIN_FORMATS);
	const coverField = useRef<CoverPhotoFieldHandle>(null);
	const fieldRef = useRef<HTMLInputElement>(null);
	const storyRef = useRef<StoryEditorHandle>(null);
	const sendRef = useRef<HTMLButtonElement>(null);
	const footerRef = useRef<HTMLElement>(null);
	const pinFrame = useRef(0);
	const replyId = useRef(0);
	const editSnapshot = useRef<Partial<CreateDraft>>({});

	const active = editing ?? step;
	const activeStep = STEPS[active - 1];
	if (!activeStep) {
		throw new Error('Invalid create step');
	}

	const storyChars = storyLength(draft.story);

	const canContinue =
		(active === 1 && draft.goal !== null && draft.goal > 0) ||
		(active === 2 && coverReady) ||
		(active === 3 && draft.title.trim().length > 0) ||
		(active === 4 && !isStoryEmpty(draft.story) && storyChars <= STORY_MAX) ||
		active === LAST;

	const busy = typing || sending || coverBusy;

	/*
	 * Keep the bottom of the thread glued to the viewport while heights animate. A single
	 * smooth scroll fights the layout changes; following each frame for a moment does not.
	 */
	function pinToEnd(ms: number) {
		cancelAnimationFrame(pinFrame.current);
		const until = performance.now() + ms;
		const tick = () => {
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
			if (performance.now() < until) pinFrame.current = requestAnimationFrame(tick);
		};
		pinFrame.current = requestAnimationFrame(tick);
	}

	useEffect(() => {
		pinToEnd(PIN_MS);
		return () => cancelAnimationFrame(pinFrame.current);
	}, [step, typing, done, editing, coverCropping, coverReady]);

	/* The composer grows (photo tray, toolbar, long story); keep the last message above it. */
	useEffect(() => {
		const footer = footerRef.current;
		if (!footer) return;
		const observer = new ResizeObserver(() => pinToEnd(PIN_MS));
		observer.observe(footer);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (typing || done) return;
		if (active === 2) {
			if (coverReady) sendRef.current?.focus({ preventScroll: true });
			return;
		}
		if (active === 4) {
			storyRef.current?.focus();
			return;
		}
		fieldRef.current?.focus({ preventScroll: true });
	}, [active, typing, done, coverReady]);

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

	/* Rewind the thread to step n. Later answers are kept in the draft but must be sent again. */
	function goTo(n: number) {
		if (busy) return;
		setDone(false);
		setEditing(null);
		setTyping(false);
		setSending(false);
		setStep(n);
	}

	/* Change one earlier answer in place; the thread stays where it is. */
	function startEdit(n: number) {
		if (busy || n >= step) return;
		editSnapshot.current = {
			goal: draft.goal,
			title: draft.title,
			story: draft.story,
			coverSkipped: draft.coverSkipped
		};
		setDone(false);
		setEditing(n);
	}

	function cancelEdit() {
		if (editing === null || busy) return;
		const snapshot = editSnapshot.current;
		if (editing === 1) {
			patchDraft({ goal: snapshot.goal ?? null });
			setGoalText(snapshot.goal ? snapshot.goal.toLocaleString('en-KE') : '');
		} else if (editing === 2) {
			// A removed cover can't be restored (its object URL is gone); fall back to "later".
			if (draft.coverUrl === '' && !draft.coverSkipped) patchDraft({ coverSkipped: true });
		} else if (editing === 3) {
			patchDraft({ title: snapshot.title ?? '' });
		} else if (editing === 4) {
			patchDraft({ story: snapshot.story ?? '' });
		}
		setEditing(null);
	}

	async function reply(next: () => void) {
		const id = ++replyId.current;
		setSending(true);
		next();
		setTyping(true);
		await sleep(TYPING_MS);
		// A newer reply or a jump via goTo owns the flags now; don't clear them from a stale reply.
		if (replyId.current !== id) return;
		setTyping(false);
		setSending(false);
	}

	async function goNext() {
		if (!canContinue || busy) return;
		if (active === 2 && coverField.current) {
			setCoverBusy(true);
			const confirmed = await coverField.current.confirm();
			setCoverBusy(false);
			if (!confirmed) return;
		}
		if (editing !== null) {
			setEditing(null);
			return;
		}
		if (step >= LAST) {
			await reply(() => setDone(true));
			return;
		}
		const from = step;
		await reply(() => setStep(from + 1));
	}

	async function skipCover() {
		if (busy || active !== 2) return;
		coverField.current?.clear();
		patchDraft({ coverSkipped: true });
		if (editing !== null) {
			setEditing(null);
			return;
		}
		await reply(() => setStep(3));
	}

	function goBack() {
		if (done) {
			setDone(false);
			return;
		}
		if (step > 1) goTo(step - 1);
	}

	function startOver() {
		replyId.current += 1;
		resetDraft();
		setGoalText('');
		setCoverReady(false);
		setCoverBusy(false);
		setCoverCropping(false);
		setDragging(false);
		setDone(false);
		setEditing(null);
		setTyping(false);
		setSending(false);
		setStep(1);
	}

	function onEnter(event: KeyboardEvent<HTMLElement>) {
		if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
		if (event.shiftKey) return;
		event.preventDefault();
		if (!event.ctrlKey && !event.metaKey && !event.altKey) {
			void goNext();
		}
	}

	function onTitleKeydown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
			void goNext();
		}
	}

	function onGoalKeydown(event: KeyboardEvent<HTMLInputElement>) {
		onEnter(event);
		if (event.key.length === 1 && !/[0-9]/.test(event.key) && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
		}
	}

	function onGoalInput(event: ChangeEvent<HTMLInputElement>) {
		parseGoal(event.currentTarget.value);
	}

	function onDrop(event: DragEvent<HTMLElement>) {
		event.preventDefault();
		setDragging(false);
		if (active === 2) coverField.current?.addFile(event.dataTransfer.files[0]);
	}

	function tip(n: number) {
		if (n === 2 && !(active === 2 && coverCropping)) {
			return (
				<Tip title="Choosing a photo">
					<p>Use a clear, bright photo. If possible, pick one from a happier time.</p>
				</Tip>
			);
		}
		if (n === 3) {
			return (
				<Tip title="A good title">
					<p>Mention who or what it’s for, and the action.</p>
				</Tip>
			);
		}
		if (n === 4) {
			return (
				<Tip title="What a good story covers">
					<ol className="list-decimal space-y-1 pl-4 marker:font-bold marker:text-accent">
						<li>Introduce yourself.</li>
						<li>Say who or what you’re fundraising for.</li>
						<li>Explain what happened.</li>
						<li>Share how the money will be used.</li>
					</ol>
				</Tip>
			);
		}
		return null;
	}

	function answer(n: number) {
		const editingThis = editing === n;
		if (n === 1 && draft.goal !== null) {
			return (
				<Sent n={1} onEdit={startEdit} active={editingThis}>
					<span className="text-lg font-bold">{formatGoal(draft.goal)}</span>
				</Sent>
			);
		}
		if (n === 2 && draft.coverUrl) {
			return (
				<div className="grow-in">
					<div className="fly-sent flex justify-end">
						<button
							type="button"
							className={`block w-52 max-w-[70%] overflow-hidden rounded-3xl rounded-br-lg transition-[opacity,box-shadow] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:w-60 ${
								editingThis ? 'ring-4 ring-accent/25' : ''
							}`}
							onClick={() => startEdit(2)}
							aria-label="Change your answer to step 2"
							aria-pressed={editingThis}
						>
							<CoverImage src={draft.coverUrl} alt="Your cover" className="w-full" />
						</button>
					</div>
				</div>
			);
		}
		if (n === 2 && draft.coverSkipped) {
			return (
				<Sent n={2} onEdit={startEdit} active={editingThis}>
					<span className="text-base font-medium">{SKIP_COVER_MESSAGE}</span>
				</Sent>
			);
		}
		if (n === 3 && draft.title.trim()) {
			return (
				<Sent n={3} onEdit={startEdit} active={editingThis}>
					<span className="text-lg font-bold wrap-break-word">{draft.title}</span>
				</Sent>
			);
		}
		if (n === 4 && !isStoryEmpty(draft.story)) {
			return (
				<Sent n={4} onEdit={startEdit} active={editingThis}>
					<div className="story-rich leading-relaxed" dangerouslySetInnerHTML={{ __html: draft.story }} />
				</Sent>
			);
		}
		return null;
	}

	/* Every step up to the current one stays in the thread; the current step is shown once the typing bubble clears. */
	const visibleSteps = STEPS.slice(0, typing && !done ? step - 1 : step);
	const showSkip = active === 2 && !coverReady && !coverCropping && !typing;

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="sticky top-0 z-10 bg-paper/95 backdrop-blur">
				<div className="mx-auto flex w-full max-w-[40rem] flex-col gap-3 px-4 pt-3 pb-3">
					<div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
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
						<div className="flex flex-col items-center gap-1">
							<span
								className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink text-card"
								aria-hidden="true"
							>
								<HorizonMark className="h-4 w-auto" />
							</span>
							<p className="text-sm font-extrabold">Ghunami</p>
							<p className="text-xs font-medium text-mute" aria-live="polite">
								{done ? 'Draft saved' : editing !== null ? `Editing ${activeStep.label}` : `Step ${step} of ${LAST}`}
							</p>
						</div>
					</div>
					<ol
						className="flex gap-1"
						aria-label={`Progress: step ${done ? LAST : step} of ${LAST}`}
					>
						{STEPS.map((s, i) => (
							<li
								key={s.q}
								className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
								aria-current={!done && i + 1 === step ? 'step' : undefined}
							>
								<div
									className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
									style={{
										width: done || i + 1 < step ? '100%' : i + 1 === step ? '45%' : '0%'
									}}
								/>
							</li>
						))}
					</ol>
				</div>
			</header>

			<main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-end gap-4 px-4 pt-4 pb-4">
				{visibleSteps.map((s, i) => {
					const n = i + 1;
					const current = n === step && !done;
					return (
						<div key={s.q} className="grow-in">
							<div className="flex flex-col gap-4">
								<Received>
									<Question q={s.q} sub={s.sub} current={current} />
									{tip(n)}
								</Received>
								{!current && n < LAST && answer(n)}
							</div>
						</div>
					);
				})}

				{done && (
					<>
						<Sent n={LAST}>
							<span className="text-lg font-bold">Looks good</span>
						</Sent>
						{!typing && (
							<div className="grow-in">
								<Received>
									<div className="bubble-in min-w-0 rounded-3xl bg-card px-5 py-4">
										<p className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-[-0.02em] text-accent md:text-3xl">
											<svg viewBox="0 0 20 20" className="h-6 w-6 shrink-0" fill="currentColor" aria-hidden="true">
												<path d="M10 0a10 10 0 1 0 0 20A10 10 0 0 0 10 0Zm4.7 7.7-5.5 5.5a1 1 0 0 1-1.4 0L5.3 10.7a1 1 0 1 1 1.4-1.4L8.5 11l4.8-4.8a1 1 0 0 1 1.4 1.4Z" />
											</svg>
											Saved in this browser
										</p>
										<p className="mt-1.5 text-base text-mute md:text-lg">
											Nothing is public yet. This is your draft.
										</p>
									</div>
								</Received>
							</div>
						)}
					</>
				)}

				{typing && <Typing />}
			</main>

			<footer ref={footerRef} className="sticky bottom-0 z-10 border-t-2 border-line bg-paper/95 backdrop-blur">
				<div className="mx-auto flex w-full max-w-[40rem] flex-col gap-3 px-4 py-3">
					{done ? (
						<div className="flex items-center justify-between gap-4 py-1">
							<button
								type="button"
								className="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink"
								onClick={goBack}
							>
								Back
							</button>
							<Link
								to="/create"
								className="btn-press bg-accent text-card hover:bg-accent-deep"
								onClick={startOver}
							>
								Start another
							</Link>
						</div>
					) : active === LAST ? (
						<div className="flex items-center justify-between gap-4 py-1">
							<button
								type="button"
								className="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink"
								onClick={goBack}
							>
								Back
							</button>
							<button
								type="button"
								className={`btn-press min-w-40 ${busy ? 'bg-line text-mute' : 'bg-accent text-card hover:bg-accent-deep'}`}
								disabled={busy}
								onClick={() => void goNext()}
							>
								Looks good
							</button>
						</div>
					) : (
						<form
							key={`${active}-${editing !== null ? 'edit' : 'new'}`}
							className={`flex flex-col gap-3 ${typing ? 'opacity-60' : 'fly-compose'}`}
							onSubmit={(event) => {
								event.preventDefault();
								void goNext();
							}}
							onKeyDown={(event) => {
								if (active !== 2 || event.key !== 'Enter' || event.nativeEvent.isComposing) return;
								if (!coverReady) return;
								const target = event.target as HTMLElement;
								if (target.closest('button:not(.send-btn):not([data-photo-prompt])')) return;
								event.preventDefault();
								void goNext();
							}}
							onDragOver={(event) => {
								if (active !== 2) return;
								event.preventDefault();
								setDragging(true);
							}}
							onDragLeave={() => setDragging(false)}
							onDrop={onDrop}
						>
							{editing !== null && (
								<div className="flex items-center justify-between gap-3 px-2">
									<p className="text-sm font-bold text-mute">
										Editing {activeStep.label}
									</p>
									<button
										type="button"
										className="rounded-full px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:bg-card"
										onClick={cancelEdit}
									>
										Cancel
									</button>
								</div>
							)}

							{active === 1 && (
								<div
									className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
									role="group"
									aria-label="Suggested goals"
								>
									{SUGGESTED.map((amount) => (
										<button
											key={amount}
											type="button"
											className={`shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors ${
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
							)}

							{active === 2 && (
								<CoverPhotoField
									ref={coverField}
									coverUrl={draft.coverUrl}
									onReadyChange={setCoverReady}
									onCroppingChange={setCoverCropping}
								/>
							)}

							{active === 4 && <StoryToolbar formats={storyFormats} editor={storyRef} />}

							<div
								className={`compose-bar flex items-end gap-2 rounded-[1.75rem] border-2 bg-card py-1.5 pr-1.5 pl-2 transition-colors duration-150 focus-within:border-accent ${
									dragging ? 'border-accent' : 'border-line'
								}`}
							>
								{active === 2 && (
									<button
										type="button"
										className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sun text-accent transition-colors hover:bg-line"
										onClick={() => coverField.current?.openPicker()}
										aria-label={coverReady || coverCropping ? 'Change photo' : 'Choose a photo'}
									>
										<svg
											viewBox="0 0 24 24"
											className="h-5 w-5"
											fill="none"
											stroke="currentColor"
											strokeWidth="2.2"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
										>
											<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
											<circle cx="12" cy="12.5" r="3.5" />
										</svg>
									</button>
								)}

								{active === 1 ? (
									<label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 pl-2">
										<span className="sr-only">Goal in Kenyan shillings</span>
										<span className="shrink-0 text-lg font-extrabold text-accent" aria-hidden="true">
											Ksh
										</span>
										<input
											ref={fieldRef}
											className="field-bare min-w-0 flex-1 text-2xl font-extrabold tracking-[-0.02em]"
											inputMode="numeric"
											autoComplete="off"
											placeholder="0"
											value={goalText}
											onChange={onGoalInput}
											onKeyDown={onGoalKeydown}
											disabled={typing}
										/>
									</label>
								) : active === 2 ? (
									<button
										type="button"
										data-photo-prompt
										className="flex min-h-10 min-w-0 flex-1 items-center pl-1 text-left text-base text-hint"
										onClick={() => coverField.current?.openPicker()}
									>
										{coverReady || coverCropping ? 'Click to change' : 'Click to add'}
									</button>
								) : active === 3 ? (
									<label className="flex min-h-10 min-w-0 flex-1 items-center pl-2">
										<span className="sr-only">Title</span>
										<input
											ref={fieldRef}
											className="field-bare min-w-0 flex-1 py-1.5 text-lg font-bold tracking-[-0.01em]"
											maxLength={80}
											placeholder="Help Maya get home"
											value={draft.title}
											onChange={(event) => patchDraft({ title: event.currentTarget.value })}
											onKeyDown={onTitleKeydown}
											disabled={typing}
										/>
									</label>
								) : (
									<div className="flex min-h-10 min-w-0 flex-1 items-center pl-2">
										<StoryEditor
											ref={storyRef}
											value={draft.story}
											onChange={(story) => patchDraft({ story })}
											onFormatsChange={onStoryFormats}
											onKeyDown={onEnter}
											disabled={typing}
											placeholder="Hi, I’m Jane. I’m raising money for…"
										/>
									</div>
								)}

								<SendButton buttonRef={sendRef} disabled={!canContinue || busy} />
							</div>

							<div className="flex min-h-4 items-center justify-between gap-3 px-2 text-xs font-medium text-hint">
								<span className="hidden sm:inline">
									{active === 2
										? 'JPG, PNG, HEIC, WebP · up to 25 MB · or drop one here'
										: active === 4
											? 'Enter to send · Shift + Enter for a new line'
											: 'Enter to send'}
								</span>
								<span className="sm:hidden">
									{active === 2 ? 'JPG, PNG, HEIC, WebP · up to 25 MB' : ''}
								</span>
								{showSkip && (
									<button
										type="button"
										className="ml-auto rounded-full px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:bg-card"
										onClick={() => void skipCover()}
									>
										Skip for now
									</button>
								)}
								{active === 3 && <span className="ml-auto tabular-nums">{draft.title.length} / 80</span>}
								{active === 4 && (
									<span className={`ml-auto tabular-nums ${storyChars > STORY_MAX ? 'font-bold text-error' : ''}`}>
										{storyChars} / {STORY_MAX}
									</span>
								)}
							</div>
						</form>
					)}
				</div>
			</footer>
		</div>
	);
}
