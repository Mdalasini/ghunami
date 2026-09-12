import {
	type ChangeEvent,
	type KeyboardEvent,
	type ReactNode,
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Sent({ n, onEdit, children }: { n: number; onEdit: (n: number) => void; children: ReactNode }) {
	return (
		<div className="fly-sent flex justify-end">
			<button
				type="button"
				className="group max-w-[85%] rounded-3xl rounded-br-lg bg-accent px-5 py-3 text-left text-base font-medium text-card transition-colors hover:bg-accent-deep"
				onClick={() => onEdit(n)}
				aria-label={`Change your answer to step ${n}`}
			>
				<span className="flex items-center gap-3">
					<span className="min-w-0">{children}</span>
					<svg
						viewBox="0 0 20 20"
						className="h-4 w-4 shrink-0 text-card/70 transition-colors group-hover:text-card"
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

export function meta() {
	return [{ title: 'Start a fundraiser · Ghunami' }];
}

export default function Create() {
	const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft);
	const [step, setStep] = useState(1);
	const [done, setDone] = useState(false);
	const [sending, setSending] = useState(false);
	const [shownThrough, setShownThrough] = useState(0);
	const [goalText, setGoalText] = useState(() =>
		draft.goal !== null ? draft.goal.toLocaleString('en-KE') : ''
	);
	const [coverReady, setCoverReady] = useState(() => getDraft().coverUrl !== '');
	const [coverBusy, setCoverBusy] = useState(false);
	const [coverCropping, setCoverCropping] = useState(false);
	const coverField = useRef<CoverPhotoFieldHandle>(null);

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

	const heading = done ? 'Saved in this browser' : currentStep.q;
	const sub = done ? 'Nothing is public yet. This is your draft.' : currentStep.sub;

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
	}

	async function goTo(n: number) {
		setDone(false);
		setSending(false);
		setShownThrough(Math.max(0, n - 1));
		setStep(n);
		requestAnimationFrame(() => {
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
		});
	}

	async function goNext() {
		if (!canContinue || sending || coverBusy) return;
		if (step === 2 && coverField.current) {
			setCoverBusy(true);
			const confirmed = await coverField.current.confirm();
			setCoverBusy(false);
			if (!confirmed) return;
		}
		if (step >= LAST) {
			setDone(true);
			return;
		}
		setSending(true);
		await sleep(160);
		const from = step;
		setSending(false);
		setStep(from + 1);
		requestAnimationFrame(() => {
			window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
		});
		await sleep(220);
		setShownThrough(from);
	}

	function goBack() {
		if (done) {
			setDone(false);
			return;
		}
		if (step > 1) void goTo(step - 1);
	}

	function startOver() {
		resetDraft();
		setGoalText('');
		setCoverReady(false);
		setCoverBusy(false);
		setCoverCropping(false);
		setDone(false);
		setSending(false);
		setShownThrough(0);
		setStep(1);
	}

	function onEnter(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
		if (event.key === 'Enter') {
			event.preventDefault();
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

	function photoEdit(n: number) {
		if (done) return null;
		return (
			<button
				type="button"
				className="absolute top-3 right-3 rounded-full border-2 border-line bg-card px-3 py-1 text-xs font-extrabold tracking-wider text-accent uppercase hover:border-accent"
				onClick={() => void goTo(n)}
			>
				Edit
			</button>
		);
	}

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="sticky top-0 z-10 bg-paper">
				<div className="mx-auto flex w-full max-w-[40rem] items-center gap-4 px-4 py-4 md:py-6">
					<Link
						to="/"
						aria-label="Cancel and go home"
						className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute transition-colors hover:bg-card hover:text-ink"
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
					<ol
						className="flex flex-1 gap-1.5"
						aria-label={`Progress: step ${done ? LAST : step} of ${LAST}`}
					>
						{STEPS.map((s, i) => (
							<li
								key={s.q}
								className="h-4 flex-1 overflow-hidden rounded-full bg-line transition-colors duration-300"
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

			<main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-end gap-5 px-4 pt-4 pb-32">
				{!done && step < LAST && (
					<>
						{shownThrough >= 1 && draft.goal !== null && (
							<Sent n={1} onEdit={(n) => void goTo(n)}>
								<span className="text-lg font-bold">{formatGoal(draft.goal)}</span>
							</Sent>
						)}
						{shownThrough >= 2 && draft.coverUrl && (
							<Sent n={2} onEdit={(n) => void goTo(n)}>
								<CoverImage
									src={draft.coverUrl}
									alt="Your cover"
									className="w-16 rounded-2xl"
								/>
							</Sent>
						)}
						{shownThrough >= 3 && draft.title.trim() && (
							<Sent n={3} onEdit={(n) => void goTo(n)}>
								<span className="text-lg font-bold wrap-break-word">{draft.title}</span>
							</Sent>
						)}
					</>
				)}

				<div key={`${step}-${done}-q`} className="fly-question flex flex-col gap-3">
					<div className="flex items-end gap-3">
						<span
							className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-card"
							aria-hidden="true"
						>
							<HorizonMark className="h-5 w-auto" />
						</span>
						<div className="min-w-0 rounded-3xl rounded-bl-lg bg-card px-6 py-5">
							<h1 className="text-[1.75rem] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance md:text-4xl md:leading-[1.12]">
								{heading}
							</h1>
							<p className="mt-2 text-base text-mute md:text-lg">{sub}</p>
						</div>
					</div>
					{!done && step === 2 && !coverCropping && (
						<Tip title="Choosing a photo">
							<p>Use a clear, bright photo. If possible, pick one from a happier time.</p>
						</Tip>
					)}
					{!done && step === 3 && (
						<Tip title="A good title">
							<p>Mention who or what it’s for, and the action.</p>
						</Tip>
					)}
					{!done && step === 4 && (
						<Tip title="What a good story covers">
							<ol className="list-decimal space-y-1 pl-4 marker:font-bold marker:text-accent">
								<li>Introduce yourself.</li>
								<li>Say who or what you’re fundraising for.</li>
								<li>Explain what happened.</li>
								<li>Share how the money will be used.</li>
							</ol>
						</Tip>
					)}
				</div>

				<div
					key={`${step}-${done}-c`}
					className={`flex flex-col gap-4 ${sending ? 'sending-draft' : 'fly-compose'}`}
				>
					{done || step === LAST ? (
						<section className="ml-8 rounded-3xl rounded-tl-lg bg-card px-6 pt-5 pb-2 md:ml-14" aria-label="Your draft">
							{done && (
								<p className="mb-4 inline-flex items-center gap-2 text-xl font-extrabold text-accent">
									<svg viewBox="0 0 20 20" className="h-6 w-6" fill="currentColor" aria-hidden="true">
										<path d="M10 0a10 10 0 1 0 0 20A10 10 0 0 0 10 0Zm4.7 7.7-5.5 5.5a1 1 0 0 1-1.4 0L5.3 10.7a1 1 0 1 1 1.4-1.4L8.5 11l4.8-4.8a1 1 0 0 1 1.4 1.4Z" />
									</svg>
									Draft confirmed
								</p>
							)}
							<div className="divide-y divide-dashed divide-line">
								<ReceiptRow label="Title" n={3} done={done} onEdit={(n) => void goTo(n)}>
									<p className="text-xl font-bold wrap-break-word">{draft.title}</p>
								</ReceiptRow>
								<div className="py-4">
									<p className="text-sm font-medium text-mute">Cover photo</p>
									{draft.coverUrl ? (
										<div className="relative mt-1 w-48 max-w-full">
											<CoverImage
												src={draft.coverUrl}
												alt="Your cover"
												className="rounded-2xl"
											/>
											{photoEdit(2)}
										</div>
									) : (
										<p className="mt-1 text-base">None added</p>
									)}
								</div>
								<ReceiptRow label="Goal" n={1} done={done} onEdit={(n) => void goTo(n)}>
									<p className="text-3xl font-extrabold tracking-[-0.02em]">
										{draft.goal !== null ? formatGoal(draft.goal) : '—'}
									</p>
								</ReceiptRow>
								<ReceiptRow label="Story" n={4} done={done} onEdit={(n) => void goTo(n)}>
									<p className="whitespace-pre-wrap text-base leading-relaxed">{draft.story}</p>
								</ReceiptRow>
							</div>
						</section>
					) : step === 1 ? (
						<>
							<label className="compose-card ml-15 flex items-baseline gap-3 rounded-3xl rounded-tr-lg border-2 border-line bg-card px-6 py-5 transition-colors duration-150 focus-within:border-accent">
								<span className="sr-only">Goal in Kenyan shillings</span>
								<span className="shrink-0 text-2xl font-extrabold text-accent md:text-3xl" aria-hidden="true">
									Ksh
								</span>
								<span className="goal-fit min-w-0 flex-1">
									<input
										className="goal-amount field-bare min-w-0 overflow-hidden whitespace-nowrap font-extrabold tracking-[-0.03em]"
										size={1}
										inputMode="numeric"
										autoComplete="off"
										placeholder="0"
										value={goalText}
										onChange={onGoalInput}
										onKeyDown={onGoalKeydown}
									/>
								</span>
							</label>
							<div className="ml-15 flex flex-wrap gap-2" role="group" aria-label="Suggested goals">
								{SUGGESTED.map((amount) => (
									<button
										key={amount}
										type="button"
										className={`rounded-full border-2 px-5 py-2.5 text-base font-bold transition-colors ${
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
					) : step === 2 ? (
						<CoverPhotoField
							ref={coverField}
							coverUrl={draft.coverUrl}
							onReadyChange={setCoverReady}
							onCroppingChange={setCoverCropping}
						/>
					) : step === 3 ? (
						<label className="compose-card ml-15 block rounded-3xl rounded-tr-lg border-2 border-line bg-card px-6 py-5 transition-colors duration-150 focus-within:border-accent">
							<span className="sr-only">Title</span>
							<textarea
								className="field-bare min-h-[1.2em] resize-none text-2xl font-bold tracking-[-0.01em] wrap-break-word md:text-3xl [field-sizing:content]"
								rows={1}
								maxLength={80}
								placeholder="Help Maya get home"
								value={draft.title}
								onChange={(event) => patchDraft({ title: event.currentTarget.value })}
								onKeyDown={onEnter}
							/>
							<span className="mt-2 block text-right text-xs font-medium text-mute">
								{draft.title.length} / 80
							</span>
						</label>
					) : (
						<label className="compose-card ml-15 block rounded-3xl rounded-tr-lg border-2 border-line bg-card px-6 py-5 transition-colors duration-150 focus-within:border-accent">
							<span className="sr-only">Story</span>
							<textarea
								className="field-bare min-h-56 resize-none text-lg leading-relaxed [field-sizing:content]"
								maxLength={4000}
								placeholder="Hi, I’m Jane. I’m raising money for…"
								value={draft.story}
								onChange={(event) => patchDraft({ story: event.currentTarget.value })}
							/>
							<span className="mt-2 block text-right text-xs font-medium text-mute">
								{draft.story.length} / 4000
							</span>
						</label>
					)}
				</div>
			</main>

			<footer className="fixed inset-x-0 bottom-0 border-t-2 border-line bg-paper/95 backdrop-blur">
				<div className="mx-auto flex w-full max-w-[40rem] items-center justify-between gap-4 px-4 py-4">
					{done ? (
						<>
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
						</>
					) : (
						<>
							{step === 1 ? (
								<Link
									to="/"
									className="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink"
								>
									Cancel
								</Link>
							) : (
								<button
									type="button"
									className="btn-press border-2 border-line bg-card text-mute [--btn-edge:var(--color-line)] hover:text-ink"
									onClick={goBack}
								>
									Back
								</button>
							)}
							<button
								type="button"
								className={`btn-press min-w-40 ${
									canContinue && !coverBusy
										? 'bg-accent text-card hover:bg-accent-deep'
										: 'bg-line text-mute'
								}`}
								disabled={!canContinue || coverBusy}
								onClick={() => void goNext()}
							>
								{step === LAST ? 'Looks good' : 'Continue'}
							</button>
						</>
					)}
				</div>
			</footer>
		</div>
	);
}
