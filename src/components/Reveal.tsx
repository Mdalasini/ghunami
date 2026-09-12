import type { ReactNode } from 'react';

/*
 * Animates height via `grid-template-rows: 0fr -> 1fr` so content above slides instead of
 * jumping when something appears or disappears. Closed content stays mounted but hidden.
 */
export function Reveal({
	open,
	className = '',
	children
}: {
	open: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div className={`reveal-rows ${open ? 'is-open' : ''} ${className}`.trim()} aria-hidden={!open}>
			<div className="min-h-0">{children}</div>
		</div>
	);
}
