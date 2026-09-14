import { useQuery } from 'convex/react';
import { Link, useParams } from 'react-router';
import { api } from '../../convex/_generated/api';
import { AuthGate } from '../components/AuthGate';
import { BrandLink } from '../components/BrandLink';
import { CoverImage } from '../components/CoverImage';
import { HorizonDisc } from '../components/HorizonMark';
import { isFundID } from '../../convex/lib/fundId';
import { formatGoal } from '../lib/draft';
import { coverMediaUrl } from '../lib/media';
import { requireSession } from '../lib/requireSession';
import type { LoaderFunctionArgs } from 'react-router';

export function meta() {
	return [{ title: 'Preview your fund · ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	requireSession(request);
	return null;
}

function EditLink({ fundID, step, children }: { fundID: string; step: number; children: string }) {
	return (
		<Link
			to={`/create?fundID=${encodeURIComponent(fundID)}&step=${step}&from=preview`}
			className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-accent transition-colors hover:bg-sun"
		>
			{children}
		</Link>
	);
}

function Progress({ goal, compact = false }: { goal: number; compact?: boolean }) {
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

function Actions() {
	return (
		<div className="mt-4 grid grid-cols-2 gap-3">
			<button disabled className="btn-press w-full bg-accent px-4 text-card">
				Donate
			</button>
			<button
				disabled
				className="btn-press w-full border-2 border-line bg-card px-4 text-accent [--btn-edge:var(--color-line)]"
			>
				Share
			</button>
		</div>
	);
}

function Missing() {
	return (
		<main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-6 py-16">
			<h1 className="text-3xl font-extrabold">Fund not found</h1>
			<p className="text-mute">This draft isn’t available. It may have been removed, or it belongs to someone else.</p>
			<Link to="/funds" className="btn-press self-start bg-accent text-card hover:bg-accent-deep">
				My funds
			</Link>
		</main>
	);
}

function PreviewBody({ fundID }: { fundID: string }) {
	const fund = useQuery(api.funds.getPreview, { fundID });

	if (fund === undefined) {
		return (
			<main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-6 py-16">
				<p className="text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
			</main>
		);
	}

	if (fund === null) return <Missing />;

	const organiser = fund.organiserName || 'You';
	const coverUrl = fund.hasCover ? coverMediaUrl(fund.fundID) : '';

	return (
		<>
			<p className="border-b border-line bg-sun/60 px-6 py-2.5 text-center text-xs font-bold text-mute">
				This is a preview. Nothing is public yet.
			</p>
			<main className="slide-forward mx-auto w-full max-w-6xl flex-1 px-6 pt-8 pb-48 md:pt-12 lg:pb-20">
				<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
					<article className="min-w-0">
						<div className="mb-6 flex items-start justify-between gap-3">
							<h1 className="text-3xl leading-[1.12] font-extrabold tracking-[-0.035em] wrap-break-word sm:text-4xl md:text-5xl">
								{fund.title}
							</h1>
							<EditLink fundID={fund.fundID} step={3}>
								Edit title
							</EditLink>
						</div>
						<div className="relative">
							{coverUrl ? (
								<CoverImage src={coverUrl} alt={`Cover for ${fund.title}`} className="w-full rounded-3xl" />
							) : (
								<div className="flex aspect-[5/3] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line bg-sun/40 text-center">
									<HorizonDisc className="h-16 w-16" />
									<p className="font-bold text-mute">A place for your cover photo</p>
									<p className="px-6 text-sm text-hint">Give your story a face. You can add this later.</p>
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
						</div>
						<div className="mt-2 flex justify-end">
							<EditLink fundID={fund.fundID} step={2}>
								{coverUrl ? 'Edit cover' : 'Add cover'}
							</EditLink>
						</div>
						<section className="mt-5 border-t border-line pt-7" aria-labelledby="story-heading">
							<div className="mb-5 flex items-center justify-between gap-3">
								<h2 id="story-heading" className="text-lg font-extrabold">
									The story
								</h2>
								<EditLink fundID={fund.fundID} step={4}>
									Edit story
								</EditLink>
							</div>
							<div
								className="story-rich font-serif text-xl leading-[1.85] text-ink/85 md:text-[1.375rem]"
								dangerouslySetInnerHTML={{ __html: fund.story }}
							/>
						</section>
					</article>

					<aside className="rounded-3xl border border-line bg-card p-6 lg:sticky lg:top-8" aria-label="Donation preview">
						<div className="-mt-2 -mr-2 flex justify-end">
							<EditLink fundID={fund.fundID} step={1}>
								Edit goal
							</EditLink>
						</div>
						<Progress goal={fund.goal} />
						<div className="hidden lg:block">
							<Actions />
						</div>
						<p className="mt-4 text-center text-xs leading-relaxed text-hint">
							Donating and sharing open once your fund is live.
						</p>
						<section className="mt-6 border-t border-line pt-6" aria-labelledby="donations-heading">
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
					</aside>
				</div>
			</main>

			<div className="fixed inset-x-0 bottom-0 z-10 px-3 pb-3 lg:hidden">
				<div className="mx-auto max-w-xl rounded-3xl border border-line bg-card p-4 shadow-[0_-4px_24px_-8px_rgb(15_26_18/0.18)]">
					<Progress goal={fund.goal} compact />
					<Actions />
				</div>
			</div>
		</>
	);
}

export default function FundPreview() {
	const fundID = useParams().fundID ?? '';
	const valid = isFundID(fundID);

	return (
		<AuthGate>
			<div className="flex min-h-dvh flex-col">
				<header className="border-b border-line bg-paper">
					<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
						<BrandLink />
						<span className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-mute">
							Draft preview
						</span>
					</div>
				</header>
				{valid ? <PreviewBody fundID={fundID} /> : <Missing />}
			</div>
		</AuthGate>
	);
}
