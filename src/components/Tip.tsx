import type { ReactNode } from 'react';

export function HorizonMark({ className }: { className: string }) {
	return (
		<svg viewBox="76 114 248 188" className={className} fill="currentColor" aria-hidden="true">
			<path d="M100 214A100 100 0 0 1 300 214Z" />
			<path d="M76 234H324V258H76Z" />
			<path d="M116 278H284V302H116Z" />
		</svg>
	);
}

/* A received-side helper bubble. Render it inside a message group; the group draws the avatar. */
export function Tip({ title, children }: { title: string; children: ReactNode }) {
	return (
		<aside className="bubble-in min-w-0 self-start rounded-3xl bg-card px-5 py-4 text-mute">
			<p className="text-sm font-bold text-ink">{title}</p>
			<div className="mt-1.5 text-sm leading-relaxed">{children}</div>
		</aside>
	);
}
