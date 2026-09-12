import {
	type ChangeEvent,
	type DragEvent,
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore
} from 'react';
import { Link } from 'react-router';
import { CoverImage } from '../components/CoverImage';
import { CoverPhotoField, type CoverPhotoFieldHandle } from '../components/CoverPhotoField';
import { HorizonMark, Tip } from '../components/Tip';
import { formatGoal, getDraft, patchDraft, resetDraft, subscribeDraft } from '../lib/draft';

const STEPS = [
	{ q: 'How much do you want to raise?', sub: 'Pick a starting number. You can change it later.' },
	{ q: 'Add a cover photo', sub: 'A clear photo of the person or place helps more than a logo.' },
	{ q: 'What should we call it?', sub: 'Say who it’s for and the action, like “Help Maya get home”.' },
	{ q: 'Tell people what happened', sub: 'Plain words. Who it’s for, and what the money does.' },
	{ q: 'Does this look right?', sub: 'Tap anything to change it.' }
] as const;

const LAST = STEPS.length;
const SUGGESTED = [50_000, 100_000, 250_000, 500_000];
const TYPING_MS = 700;

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

function Question({ q, sub, current }: { q: string; sub: string; current: boolean }) {
	return (
		<div className="bubble-in min-w-0 rounded-3xl bg-card px-5 py-4">
			{current ? (
				<h1 className="text-2xl leading-[1.15] font-extrabold tracking-[-0.02em] text-balance md:text-3xl md:leading-[1.12]">
					{q}
				</h1>
			) : (
				<p className="text-lg leading-snug font-extrabold tracking-[-0.01em]">{q}</p>
			)}
			<p className={`mt-1.5 text-mute ${current ? 'text-base md:text-lg' : 'text-sm'}`}>{sub}</p>
		</div>
	);
}

function Typing() {
	return (
		<Received>
			<div className="bubble-in flex h-12 items-center gap-1.5 rounded-3xl bg-card px-5" aria-hidden="true">
				<span className="typing-dot" />
				<span className="typing-dot" />
				<span className="typing-dot" />
			</div>
		</Received>
	);
}

function Sent({
	n,
	onEdit,
	children
}: {
	n: number;
	onEdit?: (n: number) => void;
	children: ReactNode;
}) {
	const bubble = 'max-w-[85%] rounded-3xl rounded-br-lg bg-accent px-5 py-3 text-left text-base font-medium text-card';
	return (
		<div className="fly-sent flex justify-end">
			{onEdit ? (
				<button
					type="button"
					className={`group ${bubble} transition-colors hover:bg-accent-deep`}
					onClick={() => onEdit(n)}
					aria-label={`Change your answer to step ${n}`}
				>
					<span className="flex items-center gap-3">
						<span className="min-w-0">{children}</span>
						<svg
							viewBox="0 0 20 20"
							className="h-3.5 w-3.5 shrink-0 text-card/50 transition-colors group-hover:text-card"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M13.5 3.5l3 3L7 16H4v-3z" />
						</svg>
					</span>
				</button>
			) : (
				<div className={bubble}>{children}</div>
			)}
		</div>
	);
}

function ReceiptRow({
	label,
	n,
	done,
	onEdit,
	children
}: {
	label: string;
	n: number;
	done: boolean;
	onEdit: (n: number) => void;
	children: ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-4">
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-mute">{label}</p>
				<div className="mt-1">{children}</div>
			</div>
			{!done && (
				<button
					type="button"
					className="shrink-0 rounded-full border-2 border-line px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
					onClick={() => onEdit(n)}
				>
					Edit
				</button>
			)}
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
	const coverField = useRef<CoverPhotoFieldHandle>(null);
	const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
	const sendRef = useRef<HTMLButtonElement>(null);
	const endRef = useRef<HTMLDivElement>(null);
	const scrollTimer = useRef<number>(0);
	const replyId = useRef(0);

	const currentStep = STEPS[step - 1];
	if (!currentStep) {
		throw new Error('Invalid create step');
	}

	const canContinue =
		(step === 1 && draft.goal !== null && draft.goal > 0) ||
		(step === 2 && coverReady) ||
		(step === 3 && draft.title.trim().length > 0) ||
		(step === 4 && draft.story.trim().length > 0) ||
		step === LAST;

	const busy = typing || sending || coverBusy;

	function scrollToEnd(behavior: ScrollBehavior = 'smooth') {
		const run = () => {
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
		};
		requestAnimationFrame(() => {
			run();
			requestAnimationFrame(run);
		});
	}

	useEffect(() => {
		scrollToEnd(typing ? 'instant' : 'smooth');
		window.clearTimeout(scrollTimer.current);
		scrollTimer.current = window.setTimeout(() => scrollToEnd('instant'), typing ? 50 : 320);
		return () => window.clearTimeout(scrollTimer.current);
	}, [step, typing, done, coverCropping, coverReady]);

	useEffect(() => {
		if (typing || done) return;
		if (step === 2) {
			if (coverReady) sendRef.current?.focus({ preventScroll: true });
			return;
		}
		fieldRef.current?.focus({ preventScroll: true });
	}, [step, typing, done, coverReady]);

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

	function goTo(n: number) {
		if (busy) return;
		setDone(false);
		setTyping(false);
		setSending(false);
		setStep(n);
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
		if (step === 2 && coverField.current) {
			setCoverBusy(true);
			const confirmed = await coverField.current.confirm();
			setCoverBusy(false);
			if (!confirmed) return;
		}
		if (step >= LAST) {
			await reply(() => setDone(true));
			return;
		}
		const from = step;
		await reply(() => setStep(from + 1));
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
		setTyping(false);
		setSending(false);
		setStep(1);
	}

	function onEnter(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
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
		if (step === 2) coverField.current?.addFile(event.dataTransfer.files[0]);
	}

	function photoEdit(n: number) {
		if (done) return null;
		return (
			<button
				type="button"
				className="absolute top-3 right-3 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
				onClick={() => goTo(n)}
			>
				Edit
			</button>
		);
	}

	function tip(n: number) {
		if (n === 2 && !(step === 2 && coverCropping)) {
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
		if (n === 1 && draft.goal !== null) {
			return (
				<Sent n={1} onEdit={goTo}>
					<span className="text-lg font-bold">{formatGoal(draft.goal)}</span>
				</Sent>
			);
		}
		if (n === 2 && draft.coverUrl) {
			return (
				<div className="fly-sent flex justify-end">
					<button
						type="button"
						className="block w-52 max-w-[70%] overflow-hidden rounded-3xl rounded-br-lg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:w-60"
						onClick={() => goTo(2)}
						aria-label="Change your answer to step 2"
					>
						<CoverImage src={draft.coverUrl} alt="Your cover" className="w-full" />
					</button>
				</div>
			);
		}
		if (n === 3 && draft.title.trim()) {
			return (
				<Sent n={3} onEdit={goTo}>
					<span className="text-lg font-bold wrap-break-word">{draft.title}</span>
				</Sent>
			);
		}
		if (n === 4 && draft.story.trim()) {
			return (
				<Sent n={4} onEdit={goTo}>
					<span className="block whitespace-pre-wrap leading-relaxed wrap-break-word">{draft.story}</span>
				</Sent>
			);
		}
		return null;
	}

	/* Every step up to the current one stays in the thread; the current step is shown once the typing bubble clears. */
	const visibleSteps = STEPS.slice(0, typing && !done ? step - 1 : step);

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
								{done ? 'Draft saved' : `Step ${step} of ${LAST}`}
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
						<div key={s.q} className="flex flex-col gap-4">
							<Received>
								<Question q={s.q} sub={s.sub} current={current} />
								{tip(n)}
								{n === LAST && (
									<section
										className="bubble-in w-full rounded-3xl bg-card px-5 pt-1 pb-1"
										aria-label="Your draft"
									>
										<div className="divide-y divide-dashed divide-line">
											<ReceiptRow label="Title" n={3} done={done} onEdit={goTo}>
												<p className="text-xl font-bold wrap-break-word">{draft.title}</p>
											</ReceiptRow>
											<div className="py-4">
												<p className="text-sm font-medium text-mute">Cover photo</p>
												{draft.coverUrl ? (
													<div className="relative mt-1 w-48 max-w-full">
														<CoverImage src={draft.coverUrl} alt="Your cover" className="rounded-2xl" />
														{photoEdit(2)}
													</div>
												) : (
													<p className="mt-1 text-base">None added</p>
												)}
											</div>
											<ReceiptRow label="Goal" n={1} done={done} onEdit={goTo}>
												<p className="text-3xl font-extrabold tracking-[-0.02em]">
													{draft.goal !== null ? formatGoal(draft.goal) : '—'}
												</p>
											</ReceiptRow>
											<ReceiptRow label="Story" n={4} done={done} onEdit={goTo}>
												<p className="whitespace-pre-wrap text-base leading-relaxed">{draft.story}</p>
											</ReceiptRow>
										</div>
									</section>
								)}
							</Received>
							{!current && n < LAST && answer(n)}
						</div>
					);
				})}

				{done && (
					<>
						<Sent n={LAST}>
							<span className="text-lg font-bold">Looks good</span>
						</Sent>
						{!typing && (
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
						)}
					</>
				)}

				{typing && <Typing />}
				<div ref={endRef} aria-hidden="true" />
			</main>

			<footer className="sticky bottom-0 z-10 border-t-2 border-line bg-paper/95 backdrop-blur">
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
					) : step === LAST ? (
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
							key={step}
							className={`flex flex-col gap-3 ${typing ? 'opacity-60' : 'fly-compose'}`}
							onSubmit={(event) => {
								event.preventDefault();
								void goNext();
							}}
							onKeyDown={(event) => {
								if (step !== 2 || event.key !== 'Enter' || event.nativeEvent.isComposing) return;
								if (!coverReady) return;
								const target = event.target as HTMLElement;
								if (target.closest('button:not(.send-btn):not([data-photo-prompt])')) return;
								event.preventDefault();
								void goNext();
							}}
							onDragOver={(event) => {
								if (step !== 2) return;
								event.preventDefault();
								setDragging(true);
							}}
							onDragLeave={() => setDragging(false)}
							onDrop={onDrop}
						>
							{step === 1 && (
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

							{step === 2 && (
								<CoverPhotoField
									ref={coverField}
									coverUrl={draft.coverUrl}
									onReadyChange={setCoverReady}
									onCroppingChange={setCoverCropping}
								/>
							)}

							<div
								className={`compose-bar flex items-end gap-2 rounded-[1.75rem] border-2 bg-card py-1.5 pr-1.5 pl-2 transition-colors duration-150 focus-within:border-accent ${
									dragging ? 'border-accent' : 'border-line'
								}`}
							>
								{step === 2 && (
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

								{step === 1 ? (
									<label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 pl-2">
										<span className="sr-only">Goal in Kenyan shillings</span>
										<span className="shrink-0 text-lg font-extrabold text-accent" aria-hidden="true">
											Ksh
										</span>
										<input
											ref={fieldRef as RefObject<HTMLInputElement | null>}
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
								) : step === 2 ? (
									<button
										type="button"
										data-photo-prompt
										className="flex min-h-10 min-w-0 flex-1 items-center pl-1 text-left text-base text-hint"
										onClick={() => coverField.current?.openPicker()}
									>
										{coverReady || coverCropping ? 'Click to change' : 'Click to add'}
									</button>
								) : step === 3 ? (
									<label className="flex min-h-10 min-w-0 flex-1 items-center pl-2">
										<span className="sr-only">Title</span>
										<input
											ref={fieldRef as RefObject<HTMLInputElement | null>}
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
									<label className="flex min-h-10 min-w-0 flex-1 items-center pl-2">
										<span className="sr-only">Story</span>
										<textarea
											ref={fieldRef as RefObject<HTMLTextAreaElement | null>}
											className="field-bare max-h-[40dvh] resize-none py-1.5 text-base leading-relaxed [field-sizing:content]"
											rows={1}
											maxLength={4000}
											placeholder="Hi, I’m Jane. I’m raising money for…"
											value={draft.story}
											onChange={(event) => patchDraft({ story: event.currentTarget.value })}
											onKeyDown={onEnter}
											disabled={typing}
										/>
									</label>
								)}

								<SendButton buttonRef={sendRef} disabled={!canContinue || busy} />
							</div>

							<div className="flex min-h-4 items-center justify-between gap-3 px-2 text-xs font-medium text-hint">
								<span className="hidden sm:inline">
									{step === 2
										? 'JPG, PNG, HEIC, WebP · up to 25 MB · or drop one here'
										: step === 4
											? 'Enter to send · Shift + Enter for a new line'
											: 'Enter to send'}
								</span>
								<span className="sm:hidden">
									{step === 2 ? 'JPG, PNG, HEIC, WebP · up to 25 MB' : ''}
								</span>
								{step === 3 && <span className="ml-auto tabular-nums">{draft.title.length} / 80</span>}
								{step === 4 && <span className="ml-auto tabular-nums">{draft.story.length} / 4000</span>}
							</div>
						</form>
					)}
				</div>
			</footer>
		</div>
	);
}
