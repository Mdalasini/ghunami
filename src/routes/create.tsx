import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore
} from 'react';
import { Link, redirect, useNavigate, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { isFundID } from '../../convex/lib/fundId';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { AuthGate } from '../components/AuthGate';
import { SiteHeader } from '../components/BrandLink';
import { CoverPhotoField, type CoverPhotoFieldHandle } from '../components/CoverPhotoField';
import {
	FIELD_COPY,
	GoalField,
	StoryField,
	TitleField,
	canSaveField,
	type FundField
} from '../components/FundFields';
import { PLAIN_FORMATS, type StoryEditorHandle, type StoryFormats } from '../components/StoryEditor';
import { clearCover, getDraft, patchDraft, resetDraft, subscribeDraft } from '../lib/draft';
import { persistDraft } from '../lib/persistFund';
import { requireSession } from '../lib/requireSession';

const STEPS = [FIELD_COPY.goal, FIELD_COPY.cover, FIELD_COPY.title, FIELD_COPY.story] as const;
const FIELDS: FundField[] = ['goal', 'cover', 'title', 'story'];
const LAST = STEPS.length;

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
	return [{ title: 'Start a fundraiser · ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	requireSession(request);
	const fundID = new URL(request.url).searchParams.get('fundID');
	if (!fundID) return null;
	if (!isFundID(fundID)) throw new Response('Not found', { status: 404 });
	throw redirect(`/preview/${fundID}`);
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
	const generateUploadUrl = useMutation(api.funds.generateUploadUrl);
	const registerUpload = useMutation(api.funds.registerUpload);
	const discardUpload = useMutation(api.funds.discardUpload);
	const createFund = useMutation(api.funds.create);
	const updateFund = useMutation(api.funds.update);

	const requestedStep = Number(searchParams.get('step'));
	const [step, setStep] = useState(() =>
		draft.goal !== null && requestedStep >= 1 && requestedStep <= LAST && Number.isInteger(requestedStep)
			? requestedStep : 1
	);
	const [direction, setDirection] = useState<Direction>('forward');
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState('');

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
	const savingRef = useRef(false);

	const current = STEPS[step - 1];
	const fieldName = FIELDS[step - 1];
	if (!current || !fieldName) {
		throw new Error('Invalid create step');
	}

	const canContinue = canSaveField(fieldName, draft, coverReady);

	const busy = coverBusy || saving;

	useEffect(() => {
		if (getDraft().fundID) resetDraft();
	}, []);

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
				discardUpload: (args) => discardUpload(args),
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
		if (step === LAST) {
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

	function field() {
		if (step === 1) {
			return (
				<GoalField
					goal={draft.goal}
					goalText={goalText}
					setGoalText={setGoalText}
					fieldRef={fieldRef}
					suggestedClassName="mt-5 flex flex-wrap gap-2"
				/>
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
				<TitleField
					title={draft.title}
					fieldRef={fieldRef}
					counterClassName="mt-2 text-xs font-medium text-hint tabular-nums"
				/>
			);
		}
		if (step === 4) {
			return (
				<StoryField
					value={draft.story}
					formats={storyFormats}
					editor={storyRef}
					onChange={(story) => patchDraft({ story })}
					onFormatsChange={onStoryFormats}
					onKeyDown={onStoryKeydown}
					breakHint
				/>
			);
		}
		return null;
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

			<SiteHeader brand={false}>
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
			</SiteHeader>

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
					<Question n={step} q={current.title} sub={current.sub} />

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
