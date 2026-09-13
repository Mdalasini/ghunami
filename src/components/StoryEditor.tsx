import {
	type ClipboardEvent,
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	type RefObject,
	useEffect,
	useImperativeHandle,
	useRef
} from 'react';
import { isStoryEmpty, sanitizeStoryHtml } from '../lib/richText';

type Block = 'p' | 'h1' | 'h2';

export type StoryFormats = {
	block: Block;
	bold: boolean;
	italic: boolean;
	underline: boolean;
};

export type StoryEditorHandle = {
	focus: () => void;
	toggle: (command: 'bold' | 'italic' | 'underline') => void;
	setBlock: (block: Block) => void;
	clearFormatting: () => void;
};

export const PLAIN_FORMATS: StoryFormats = { block: 'p', bold: false, italic: false, underline: false };

/* Chrome leaves a bare <br> (or an empty div) behind when the last character is deleted. */
const EMPTY_SHELL = /^(?:<(?:div|p)>)?(?:<br>)?(?:<\/(?:div|p)>)?$/i;

function readFormats(): StoryFormats {
	const value = document.queryCommandValue('formatBlock').toLowerCase();
	return {
		block: value === 'h1' || value === 'h2' ? value : 'p',
		bold: document.queryCommandState('bold'),
		italic: document.queryCommandState('italic'),
		underline: document.queryCommandState('underline')
	};
}

export function StoryEditor({
	value,
	onChange,
	onFormatsChange,
	onKeyDown,
	disabled,
	placeholder,
	ref
}: {
	value: string;
	onChange: (html: string) => void;
	onFormatsChange?: (formats: StoryFormats) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
	disabled?: boolean;
	placeholder: string;
	ref?: Ref<StoryEditorHandle>;
}) {
	const editor = useRef<HTMLDivElement>(null);
	const lastEmitted = useRef(value);

	/* Only write to the DOM when the value changed outside the editor, or the caret would jump. */
	useEffect(() => {
		const el = editor.current;
		if (!el || value === lastEmitted.current) return;
		el.innerHTML = value;
		lastEmitted.current = value;
	}, [value]);

	useEffect(() => {
		const el = editor.current;
		if (el) el.innerHTML = lastEmitted.current;
	}, []);

	useEffect(() => {
		function onSelectionChange() {
			const el = editor.current;
			const selection = document.getSelection();
			if (!el || !selection?.anchorNode || !el.contains(selection.anchorNode)) return;
			onFormatsChange?.(readFormats());
		}
		document.addEventListener('selectionchange', onSelectionChange);
		return () => document.removeEventListener('selectionchange', onSelectionChange);
	}, [onFormatsChange]);

	function emit() {
		const el = editor.current;
		if (!el) return;
		let html = el.innerHTML;
		if (EMPTY_SHELL.test(html)) {
			el.innerHTML = '';
			html = '';
		}
		const clean = isStoryEmpty(html) && !/<h[12]>/i.test(html) ? '' : sanitizeStoryHtml(html);
		lastEmitted.current = clean;
		onChange(clean);
	}

	function run(command: string, argument?: string) {
		const el = editor.current;
		if (!el || disabled) return;
		el.focus({ preventScroll: true });
		document.execCommand('styleWithCSS', false, 'false');
		document.execCommand(command, false, argument);
		onFormatsChange?.(readFormats());
		emit();
	}

	/* Shift+Enter starts a new block so a heading stays on its own line; plain Enter is left to the caller. */
	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === 'Enter' && event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			document.execCommand('insertParagraph');
			emit();
			return;
		}
		onKeyDown?.(event);
	}

	function onPaste(event: ClipboardEvent<HTMLDivElement>) {
		event.preventDefault();
		const html = event.clipboardData.getData('text/html');
		if (html) {
			document.execCommand('insertHTML', false, sanitizeStoryHtml(html));
		} else {
			document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
		}
		emit();
	}

	useImperativeHandle(ref, () => ({
		focus: () => editor.current?.focus({ preventScroll: true }),
		toggle: (command) => run(command),
		setBlock: (block) => run('formatBlock', block),
		clearFormatting: () => {
			run('removeFormat');
			run('formatBlock', 'p');
		}
	}));

	return (
		<div
			ref={editor}
			className="story-rich rich-editor field-bare max-h-[40dvh] overflow-y-auto py-1.5 text-base leading-relaxed outline-none"
			role="textbox"
			aria-label="Story"
			aria-multiline="true"
			aria-disabled={disabled || undefined}
			contentEditable={!disabled}
			suppressContentEditableWarning
			data-placeholder={placeholder}
			onInput={emit}
			onBlur={emit}
			onKeyDown={handleKeyDown}
			onPaste={onPaste}
		/>
	);
}

function ToolButton({
	active,
	label,
	onPress,
	children
}: {
	active: boolean;
	label: string;
	onPress: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full border-2 px-3 text-sm transition-colors ${
				active ? 'border-accent bg-accent text-card' : 'border-line bg-card text-accent hover:border-accent'
			}`}
			aria-label={label}
			aria-pressed={active}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onPress}
		>
			{children}
		</button>
	);
}

export function StoryToolbar({
	formats,
	editor
}: {
	formats: StoryFormats;
	editor: RefObject<StoryEditorHandle | null>;
}) {
	const plain = formats.block === 'p' && !formats.bold && !formats.italic && !formats.underline;
	return (
		<div
			className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
			role="toolbar"
			aria-label="Story formatting"
		>
			<ToolButton active={plain} label="Normal text" onPress={() => editor.current?.clearFormatting()}>
				<span className="font-bold">Normal</span>
			</ToolButton>
			<ToolButton active={formats.block === 'h1'} label="Heading 1" onPress={() => editor.current?.setBlock('h1')}>
				<span className="text-base font-extrabold">H1</span>
			</ToolButton>
			<ToolButton active={formats.block === 'h2'} label="Heading 2" onPress={() => editor.current?.setBlock('h2')}>
				<span className="font-extrabold">H2</span>
			</ToolButton>
			<ToolButton active={formats.bold} label="Bold" onPress={() => editor.current?.toggle('bold')}>
				<span className="font-extrabold">B</span>
			</ToolButton>
			<ToolButton active={formats.italic} label="Italic" onPress={() => editor.current?.toggle('italic')}>
				<span className="font-serif italic">I</span>
			</ToolButton>
			<ToolButton active={formats.underline} label="Underline" onPress={() => editor.current?.toggle('underline')}>
				<span className="underline">U</span>
			</ToolButton>
		</div>
	);
}
