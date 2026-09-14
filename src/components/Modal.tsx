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
	onOpen?: (panel: HTMLDivElement) => void;
}) {
	const panelRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef(onClose);
	const disabledRef = useRef(closeDisabled);
	const onOpenRef = useRef(onOpen);
	const [armed, setArmed] = useState(false);
	closeRef.current = onClose;
	disabledRef.current = closeDisabled;
	onOpenRef.current = onOpen;

	useEffect(() => {
		const arm = window.setTimeout(() => setArmed(true), 0);
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const panel = panelRef.current;
		if (panel) onOpenRef.current?.(panel);
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape' && !disabledRef.current) closeRef.current();
		}
		document.addEventListener('keydown', onKey);
		return () => {
			window.clearTimeout(arm);
			document.removeEventListener('keydown', onKey);
			previous?.focus();
		};
	}, []);

	return createPortal(
		<div className="fixed inset-0 z-30 flex items-center justify-center px-6">
			<button
				type="button"
				className="absolute inset-0 bg-ink/40"
				aria-label={closeLabel}
				disabled={closeDisabled || !armed}
				onClick={onClose}
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className={`relative max-h-[90dvh] w-full overflow-y-auto rounded-3xl border border-line bg-card p-8 shadow-[0_16px_40px_-16px_rgb(15_26_18/0.35)] ${className}`}
			>
				<h2 id={titleId} className="text-2xl font-extrabold tracking-[-0.03em]">
					{title}
				</h2>
				{children}
			</div>
		</div>,
		document.body
	);
}
