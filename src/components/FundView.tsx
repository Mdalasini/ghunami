import { useState, type ReactNode } from 'react';
import { CoverImage } from './CoverImage';
import { HorizonDisc } from './HorizonMark';
import { formatGoal } from '../lib/draft';
import { shareOrCopyUrl } from '../lib/share';

export function FundProgress({ goal, compact = false }: { goal: number; compact?: boolean }) {
	const raised = 0;
	const percent = Math.min(100, Math.round((raised / goal) * 100));
	return (
		<div className="flex items-center gap-4">
			<div
				role="progressbar"
				aria-label="Fundraising progress"
				aria-valuenow={percent}
				aria-valuemin={0}
				aria-valuemax={100}
				className={`relative shrink-0 ${compact ? 'h-12 w-12' : 'h-20 w-20'}`}
			>
				<svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
					<circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" className="stroke-sun" />
					{percent > 0 && (
						<circle
							cx="18"
							cy="18"
							r="15.5"
							fill="none"
							strokeWidth="4"
							strokeLinecap="round"
							pathLength={100}
							strokeDasharray={`${percent} 100`}
							className="stroke-accent"
						/>
					)}
				</svg>
				<span className={`absolute inset-0 flex items-center justify-center font-extrabold ${compact ? 'text-[0.65rem]' : 'text-sm'}`}>
					{percent}%
				</span>
			</div>
			<div className="min-w-0">
				<p className={compact ? 'text-base' : 'text-xl'}>
					<strong className="font-extrabold">{formatGoal(raised)} raised</strong>{' '}
					<span className="text-mute">of {formatGoal(goal)}</span>
				</p>
				<p className="mt-0.5 text-sm text-mute">Be the first to donate</p>
			</div>
		</div>
	);
}

export function FundActions({
	shareUrl,
	footnote
}: {
	shareUrl?: string;
	footnote: string;
}) {
	const [feedback, setFeedback] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function share() {
		if (!shareUrl || busy) return;
		setBusy(true);
		setFeedback(null);
		try {
			const result = await shareOrCopyUrl(shareUrl);
			if (result === 'copied') setFeedback('Link copied');
			else if (result === 'shared') setFeedback('Link shared');
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : 'Couldn’t share this fund.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<div className="mt-4 grid grid-cols-2 gap-3">
				<button type="button" disabled className="btn-press w-full bg-accent px-4 text-card" aria-describedby="donate-soon">
					Donate
				</button>
				<button
					type="button"
					disabled={!shareUrl || busy}
					onClick={() => void share()}
					className="btn-press w-full border-2 border-line bg-card px-4 text-accent [--btn-edge:var(--color-line)]"
				>
					Share
				</button>
			</div>
			<p id="donate-soon" className="mt-4 text-center text-xs leading-relaxed text-hint">
				{footnote}
			</p>
			{feedback ? (
				<p className="mt-2 text-center text-xs font-bold text-accent" role="status" aria-live="polite">
					{feedback}
				</p>
			) : null}
		</>
	);
}

export function FundDonations({ className = 'mt-6 border-t border-line pt-6' }: { className?: string }) {
	return (
		<section className={className} aria-labelledby="donations-heading">
			<div className="flex items-center gap-2">
				<h2 id="donations-heading" className="text-lg font-extrabold">
					Donations
				</h2>
				<span className="rounded-md bg-paper px-2 py-0.5 text-xs font-bold text-mute">0</span>
			</div>
			<div className="mt-4 flex items-center gap-3">
				<span
					className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sun text-xl text-accent"
					aria-hidden="true"
				>
					♡
				</span>
				<p className="text-sm leading-relaxed text-mute">
					No donations yet. The first act of kindness will show up here.
				</p>
			</div>
		</section>
	);
}

export function FundCover({
	title,
	coverUrl,
	organiser,
	emptyTitle,
	emptyHint,
	badge
}: {
	title: string;
	coverUrl: string;
	organiser: string;
	emptyTitle: string;
	emptyHint: string;
	badge?: ReactNode;
}) {
	return (
		<div className="relative">
			{coverUrl ? (
				<CoverImage src={coverUrl} alt={`Cover for ${title}`} className="w-full rounded-3xl" />
			) : (
				<div className="flex aspect-[5/3] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line bg-sun/40 text-center">
					<HorizonDisc className="h-16 w-16" />
					<p className="font-bold text-mute">{emptyTitle}</p>
					<p className="px-6 text-sm text-hint">{emptyHint}</p>
				</div>
			)}
			<p className="absolute top-4 left-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-card/95 py-1.5 pr-4 pl-1.5 text-sm shadow-sm">
				<span
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-card"
					aria-hidden="true"
				>
					{organiser.charAt(0).toUpperCase()}
				</span>
				<span className="truncate">
					<span className="sr-only">Organised by </span>
					<strong className="font-bold">{organiser}</strong>
				</span>
			</p>
			{badge}
		</div>
	);
}

export function FundStory({ html }: { html: string }) {
	return (
		<div
			className="story-rich font-serif text-xl leading-[1.85] text-ink/85 md:text-[1.375rem]"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
