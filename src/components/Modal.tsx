import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
	titleId,
	title,
	onClose,
	closeDisabled = false,
	closeLabel,
	children,
	className = 'max-w-md',
	onOpen
}: {
	titleId: string;
	title: string;
	onClose: () => void;
	closeDisabled?: boolean;
	closeLabel: string;
	children: ReactNode;
	className?: string;
	onOpen?: (panel: HTMLElement) => void;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef(onClose);
	const disabledRef = useRef(closeDisabled);
	const onOpenRef = useRef(onOpen);
	const armedRef = useRef(false);
	const [armed, setArmed] = useState(false);
	closeRef.current = onClose;
	disabledRef.current = closeDisabled;
	onOpenRef.current = onOpen;
	armedRef.current = armed;
	void closeLabel;

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const arm = window.setTimeout(() => setArmed(true), 0);
		dialog.showModal();
		onOpenRef.current?.(dialog);

		function dismiss() {
			if (!disabledRef.current) closeRef.current();
		}

		function onCancel(event: Event) {
			event.preventDefault();
			dismiss();
		}

		function onBackdrop(event: MouseEvent) {
			if (!armedRef.current || !dialog) return;
			const box = dialog.getBoundingClientRect();
			const outside =
				event.clientX < box.left ||
				event.clientX > box.right ||
				event.clientY < box.top ||
				event.clientY > box.bottom;
			if (outside) dismiss();
		}

		dialog.addEventListener('cancel', onCancel);
		dialog.addEventListener('click', onBackdrop);
		return () => {
			window.clearTimeout(arm);
			dialog.removeEventListener('cancel', onCancel);
			dialog.removeEventListener('click', onBackdrop);
			if (dialog.open) dialog.close();
		};
	}, []);

	return createPortal(
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			className={`m-auto max-h-[90dvh] w-[calc(100%-3rem)] overflow-y-auto rounded-3xl border border-line bg-card p-8 shadow-[0_16px_40px_-16px_rgb(15_26_18/0.35)] backdrop:bg-ink/40 ${className}`}
		>
			<h2 id={titleId} className="text-2xl font-extrabold tracking-[-0.03em]">
				{title}
			</h2>
			{children}
		</dialog>,
		document.body
	);
}
