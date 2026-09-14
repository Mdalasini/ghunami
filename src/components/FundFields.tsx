import {
	type ChangeEvent,
	type KeyboardEvent,
	type ReactNode,
	type RefObject
} from 'react';
import { TITLE_MAX } from '../../convex/lib/fundFields';
import { formatGoal, parseGoalText, patchDraft } from '../lib/draft';
import { STORY_MAX, isStoryEmpty, storyLength } from '../lib/richText';
import { StoryEditor, type StoryEditorHandle, type StoryFormats, StoryToolbar } from './StoryEditor';

export const FIELD_COPY = {
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
} as const;

export type FundField = keyof typeof FIELD_COPY;

const SUGGESTED = [50_000, 100_000, 250_000, 500_000];
const fieldUnderline = 'border-b-2 border-line pb-2 transition-colors duration-150 focus-within:border-accent';

export function canSaveField(
	field: FundField,
	draft: { goal: number | null; title: string; story: string },
	coverReady: boolean
): boolean {
	if (field === 'goal') return draft.goal !== null && draft.goal > 0;
	if (field === 'cover') return coverReady;
	if (field === 'title') return draft.title.trim().length > 0;
	return !isStoryEmpty(draft.story) && storyLength(draft.story) <= STORY_MAX;
}

export function onTextKeydown(event: KeyboardEvent<HTMLInputElement>) {
	if (event.key === 'Enter' && (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) {
		event.preventDefault();
	}
}

export function onGoalKeydown(event: KeyboardEvent<HTMLInputElement>) {
	onTextKeydown(event);
	if (event.key.length === 1 && !/[0-9]/.test(event.key) && !event.metaKey && !event.ctrlKey) {
		event.preventDefault();
	}
}

export function onGoalInput(event: ChangeEvent<HTMLInputElement>, setGoalText: (text: string) => void) {
	const parsed = parseGoalText(event.currentTarget.value);
	patchDraft({ goal: parsed.goal });
	setGoalText(parsed.text);
}

export function pickSuggested(
	amount: number,
	setGoalText: (text: string) => void,
	fieldRef: RefObject<HTMLInputElement | null>
) {
	patchDraft({ goal: amount });
	setGoalText(amount.toLocaleString('en-KE'));
	fieldRef.current?.focus({ preventScroll: true });
}

export function GoalField({
	goal,
	goalText,
	setGoalText,
	fieldRef,
	suggestedClassName
}: {
	goal: number | null;
	goalText: string;
	setGoalText: (text: string) => void;
	fieldRef: RefObject<HTMLInputElement | null>;
	suggestedClassName: string;
}) {
	return (
		<>
			<label className={`flex items-center gap-3 ${fieldUnderline}`}>
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
					onChange={(event) => onGoalInput(event, setGoalText)}
					onKeyDown={onGoalKeydown}
				/>
			</label>
			<div className={suggestedClassName} role="group" aria-label="Suggested goals">
				{SUGGESTED.map((amount) => (
					<button
						key={amount}
						type="button"
						className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition-[color,background-color,border-color,transform] duration-150 active:scale-95 ${
							goal === amount
								? 'border-accent bg-accent text-card'
								: 'border-line bg-card text-accent hover:border-accent'
						}`}
						aria-pressed={goal === amount}
						onClick={() => pickSuggested(amount, setGoalText, fieldRef)}
					>
						{formatGoal(amount)}
					</button>
				))}
			</div>
		</>
	);
}

export function TitleField({
	title,
	fieldRef,
	counterClassName
}: {
	title: string;
	fieldRef: RefObject<HTMLInputElement | null>;
	counterClassName: string;
}) {
	return (
		<>
			<label className={`flex items-center ${fieldUnderline}`}>
				<span className="sr-only">Title</span>
				<input
					ref={fieldRef}
					className="field-bare min-w-0 flex-1 text-2xl font-bold tracking-[-0.01em] placeholder:font-medium md:text-3xl"
					maxLength={TITLE_MAX}
					autoComplete="off"
					placeholder="Type your answer here..."
					value={title}
					onChange={(event) => patchDraft({ title: event.currentTarget.value })}
					onKeyDown={onTextKeydown}
				/>
			</label>
			<p className={counterClassName}>
				{title.length} / {TITLE_MAX}
			</p>
		</>
	);
}

function Key({ children }: { children: ReactNode }) {
	return <strong className="font-extrabold text-mute">{children}</strong>;
}

export function StoryField({
	value,
	formats,
	editor,
	onChange,
	onFormatsChange,
	onKeyDown,
	breakHint = false
}: {
	value: string;
	formats: StoryFormats;
	editor: RefObject<StoryEditorHandle | null>;
	onChange: (story: string) => void;
	onFormatsChange: (formats: StoryFormats) => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	breakHint?: boolean;
}) {
	const storyChars = storyLength(value);
	return (
		<>
			{breakHint ? (
				<div className="mb-3">
					<StoryToolbar formats={formats} editor={editor} />
				</div>
			) : (
				<StoryToolbar formats={formats} editor={editor} />
			)}
			<div className={fieldUnderline}>
				<StoryEditor
					ref={editor}
					value={value}
					onChange={onChange}
					onFormatsChange={onFormatsChange}
					onKeyDown={onKeyDown}
					placeholder="Type your answer here..."
				/>
			</div>
			{breakHint ? (
				<div className="mt-2 flex items-center justify-between gap-3 text-xs font-medium text-hint">
					<span>
						<Key>Shift ⇧</Key> + <Key>Enter ↵</Key> to make a line break
					</span>
					<span className={`tabular-nums ${storyChars > STORY_MAX ? 'font-bold text-error' : ''}`}>
						{storyChars} / {STORY_MAX}
					</span>
				</div>
			) : (
				<p
					className={`text-right text-xs font-medium tabular-nums ${storyChars > STORY_MAX ? 'font-bold text-error' : 'text-hint'}`}
				>
					{storyChars} / {STORY_MAX}
				</p>
			)}
		</>
	);
}
