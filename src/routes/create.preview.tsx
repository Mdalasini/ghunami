import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { CoverImage } from '../components/CoverImage';
import { HorizonDisc } from '../components/HorizonMark';
import { formatGoal, getDraft, subscribeDraft } from '../lib/draft';
import { isStoryEmpty, storyLength, STORY_MAX } from '../lib/richText';

export function meta() {
	return [{ title: 'Preview your fund · Ghunami' }];
}

function EditLink({ step, children }: { step: number; children: string }) {
	return (
		<Link to={`/create?step=${step}&from=preview`} className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-accent transition-colors hover:bg-sun">
			{children}
		</Link>
	);
}

export default function FundPreview() {
	const draft = useSyncExternalStore(subscribeDraft, getDraft, getDraft);
	const ready = draft.goal !== null && draft.goal > 0 && draft.title.trim() && !isStoryEmpty(draft.story) && storyLength(draft.story) <= STORY_MAX;

	return (
		<div className="flex min-h-dvh flex-col">
			<header className="border-b border-line bg-paper">
				<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">

					<Link to="/" aria-label="Ghunami home" className="inline-flex items-center gap-2">
						<HorizonDisc className="h-9 w-9" />
						<span className="hidden text-sm font-extrabold sm:inline">Ghunami</span>
					</Link>
					<span className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-mute">Draft preview</span>
				</div>
			</header>

			{!ready ? (
				<main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-6 py-16">
					<h1 className="text-3xl font-extrabold">Your fund starts with your story.</h1>
					<p className="text-mute">Add your goal, title and story to see your preview. Drafts are only kept while this app is open; refreshing may clear them.</p>
					<Link to="/create" className="btn-press self-start bg-accent text-card hover:bg-accent-deep">Continue creating</Link>
				</main>
			) : (
				<>
					<main className="slide-forward mx-auto w-full max-w-6xl flex-1 px-6 pt-8 pb-12 md:pt-12 md:pb-20">
						<div className="mb-9 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-6">
							<div>
								<p className="text-xs font-extrabold tracking-[0.16em] text-accent uppercase">A first look at your fund</p>
								<p className="mt-2 text-sm text-mute">Your story, ready to bring people together. Nothing is public yet.</p>
							</div>
						</div>
						<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
							<article className="min-w-0">
								<div className="mb-6">
									<div className="mb-2 flex items-center justify-between gap-3">
										<p className="text-xs font-bold tracking-widest text-hint uppercase">A community fundraiser</p>
										<EditLink step={3}>Edit title</EditLink>
									</div>
									<h1 className="text-3xl leading-[1.12] font-extrabold tracking-[-0.035em] wrap-break-word sm:text-4xl md:text-5xl">{draft.title}</h1>
									<div className="mt-6 flex items-center gap-3 text-sm text-mute">
										<span className="flex h-10 w-10 items-center justify-center rounded-full bg-sun font-bold text-accent" aria-hidden="true">Y</span>
										<p>Organised by <span className="font-bold text-ink">you</span></p>
									</div>
								</div>
								{draft.coverUrl ? (
									<CoverImage src={draft.coverUrl} alt={`Cover for ${draft.title}`} className="w-full rounded-3xl" />
								) : (
									<div className="flex aspect-[5/3] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line bg-sun/40 text-center">
										<HorizonDisc className="h-16 w-16" />
										<p className="font-bold text-mute">A place for your cover photo</p>
										<p className="px-6 text-sm text-hint">Give your story a face. You can add this later.</p>
									</div>
								)}
								<div className="mt-2 flex justify-end"><EditLink step={2}>{draft.coverUrl ? 'Edit cover' : 'Add cover'}</EditLink></div>
								<section className="mt-5 border-t border-line pt-7" aria-labelledby="story-heading">
									<div className="mb-5 flex items-center justify-between gap-3">
										<h2 id="story-heading" className="text-lg font-extrabold">The story</h2>
										<EditLink step={4}>Edit story</EditLink>
									</div>
									<div className="story-rich font-serif text-xl leading-[1.85] text-ink/85 md:text-[1.375rem]" dangerouslySetInnerHTML={{ __html: draft.story }} />
								</section>
							</article>

							<aside className="rounded-3xl border border-line bg-card p-6 lg:sticky lg:top-8" aria-label="Donation preview">
								<div className="flex items-center justify-between gap-2">
									<p className="text-xs font-extrabold tracking-widest text-hint uppercase">Every bit brings hope</p>
									<EditLink step={1}>Edit goal</EditLink>
								</div>
								<p className="mt-5 text-4xl font-extrabold tracking-tight">{formatGoal(0)} <span className="text-sm font-medium tracking-normal text-mute">raised</span></p>
								<p className="mt-2 text-sm text-mute">of <strong className="font-bold text-ink">{formatGoal(draft.goal!)}</strong> goal</p>
								<div role="progressbar" aria-label="Fundraising progress" aria-valuenow={0} aria-valuemin={0} aria-valuemax={100} className="mt-5 h-2.5 rounded-full bg-sun" />
								<p className="mt-3 text-xs text-hint">0 donations · Just getting started</p>
								<div className="mt-7 flex flex-col gap-3" aria-describedby="preview-actions-note">
									<button disabled className="btn-press w-full bg-accent text-card">Donate now</button>
									<button disabled className="btn-press w-full border-2 border-line bg-card text-accent">Share this fund</button>
								</div>
								<p id="preview-actions-note" className="mt-4 text-center text-xs leading-relaxed text-hint">Donating and sharing will be available once your fund is live.</p>
								<div className="mt-7 border-t border-line pt-6 text-center">
									<span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-paper text-2xl text-accent" aria-hidden="true">♡</span>
									<p className="mt-3 text-sm font-bold">The first act of kindness starts here.</p>
									<p className="mt-2 text-sm leading-relaxed text-mute">When people give, their support will appear here.</p>
								</div>
							</aside>
						</div>
					</main>

				</>
			)}
		</div>
	);
}
