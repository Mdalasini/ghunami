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

export function Tip({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex items-end gap-3">
			<span
				className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-card"
				aria-hidden="true"
			>
				<HorizonMark className="h-5 w-auto" />
			</span>
			<aside className="min-w-0 rounded-3xl rounded-bl-lg bg-card px-5 py-4 text-mute">
				<p className="text-sm font-bold text-ink">{title}</p>
				<div className="mt-1.5 text-sm leading-relaxed">{children}</div>
			</aside>
		</div>
	);
}
