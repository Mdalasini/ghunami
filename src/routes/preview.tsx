import { useMutation, useQuery } from 'convex/react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { isFundID } from '../../convex/lib/fundId';
import { AuthGate } from '../components/AuthGate';
import { SiteHeader } from '../components/BrandLink';
import { FundActions, FundCover, FundDonations, FundProgress, FundStory } from '../components/FundView';
import { fundPath } from '../lib/fundUrl';
import { coverMediaUrl } from '../lib/media';
import { requireSession } from '../lib/requireSession';

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

function PublishControl({ fundID }: { fundID: string }) {
	const [confirming, setConfirming] = useState(false);
	const close = () => setConfirming(false);

	return (
		<>
			<button
				type="button"
				className="rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold tracking-wider text-card uppercase hover:bg-accent-deep"
				aria-haspopup="dialog"
				aria-expanded={confirming}
				onClick={() => {
					setConfirming(true);
				}}
			>
				Set fund live
			</button>
			{confirming ? createPortal(<PublishDialog fundID={fundID} onCancel={close} />, document.body) : null}
		</>
	);
}

function PublishDialog({ fundID, onCancel }: { fundID: string; onCancel: () => void }) {
	const publish = useMutation(api.funds.publish);
	const navigate = useNavigate();
	const titleId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const pendingRef = useRef(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState('');
	const [armed, setArmed] = useState(false);
	pendingRef.current = pending;

	useEffect(() => {
		const arm = window.setTimeout(() => setArmed(true), 0);
		const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		panelRef.current?.querySelector('button')?.focus();
		function onKey(event: KeyboardEvent) {
			if (event.key === 'Escape' && !pendingRef.current) onCancel();
		}
		document.addEventListener('keydown', onKey);
		return () => {
			window.clearTimeout(arm);
			document.removeEventListener('keydown', onKey);
			previous?.focus();
		};
	}, [onCancel]);

	async function confirm() {
		if (pending) return;
		setPending(true);
		setError('');
		try {
			const result = await publish({ fundID });
			navigate(fundPath(result.fundID, result.title));
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'Couldn’t set this fund live. Try again.');
			setPending(false);
		}
	}

	return (
		<div className="fixed inset-0 z-30 flex items-center justify-center px-6">
			<button
				type="button"
				className="absolute inset-0 bg-ink/40"
				aria-label="Cancel publishing"
				disabled={pending || !armed}
				onClick={onCancel}
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="relative w-full max-w-md rounded-3xl border border-line bg-card p-8 shadow-[0_16px_40px_-16px_rgb(15_26_18/0.35)]"
			>
				<h2 id={titleId} className="text-2xl font-extrabold tracking-[-0.03em]">
					Set this fund live?
				</h2>
				<p className="mt-3 text-sm leading-relaxed text-mute">
					Anyone with the link will be able to see the fund and its cover photo. You can keep editing afterwards.
				</p>
				{error ? (
					<p className="mt-3 text-sm font-bold text-error" role="alert">
						{error}
					</p>
				) : null}
				<div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
					<button
						type="button"
						disabled={pending}
						className="btn-press border-2 border-line bg-card px-5 text-accent [--btn-edge:var(--color-line)]"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={pending}
						className="btn-press bg-accent px-5 text-card hover:bg-accent-deep"
						onClick={() => void confirm()}
					>
						{pending ? 'Publishing…' : 'Set fund live'}
					</button>
				</div>
			</div>
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

export default function FundPreview() {
	const fundID = useParams().fundID ?? '';
	const valid = isFundID(fundID);
	const fund = useQuery(api.funds.getPreview, valid ? { fundID } : 'skip');
	const live = fund?.status === 'live';

	return (
		<AuthGate>
			<div className="flex min-h-dvh flex-col">
				<SiteHeader>
					{live && fund ? (
						<Link
							to={fundPath(fund.fundID, fund.title)}
							className="rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold tracking-wider text-card uppercase hover:bg-accent-deep"
						>
							View live fund
						</Link>
					) : fund && !live ? (
						<PublishControl fundID={fund.fundID} />
					) : null}
				</SiteHeader>
				{!valid || fund === null ? (
					<Missing />
				) : fund === undefined ? (
					<main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-6 py-16">
						<p className="text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
					</main>
				) : (
					<>
						{live ? (
							<p className="border-b border-line bg-sun/60 px-6 py-2.5 text-center text-xs font-bold text-mute">
								This fund is live. Edits you make here change the public page.
							</p>
						) : null}
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
									<FundCover
										title={fund.title}
										coverUrl={fund.hasCover ? coverMediaUrl(fund.fundID) : ''}
										organiser={fund.organiserName || 'You'}
										emptyTitle="A place for your cover photo"
										emptyHint="Give your story a face. You can add this later."
									/>
									<div className="mt-2 flex justify-end">
										<EditLink fundID={fund.fundID} step={2}>
											{fund.hasCover ? 'Edit cover' : 'Add cover'}
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
										<FundStory html={fund.story} />
									</section>
								</article>

								<aside className="rounded-3xl border border-line bg-card p-6 lg:sticky lg:top-8" aria-label="Donation preview">
									<div className="-mt-2 -mr-2 flex justify-end">
										<EditLink fundID={fund.fundID} step={1}>
											Edit goal
										</EditLink>
									</div>
									<FundProgress goal={fund.goal} />
									<div className="hidden lg:block">
										<FundActions
											footnote={
												live
													? 'Donations coming soon.'
													: 'Sharing opens when you set this fund live. Donations aren’t available yet.'
											}
										/>
									</div>
									<FundDonations />
								</aside>
							</div>
						</main>

						<div className="fixed inset-x-0 bottom-0 z-10 px-3 pb-3 lg:hidden">
							<div className="mx-auto max-w-xl rounded-3xl border border-line bg-card p-4 shadow-[0_-4px_24px_-8px_rgb(15_26_18/0.18)]">
								<FundProgress goal={fund.goal} compact />
								<FundActions
									footnote={
										live
											? 'Donations coming soon.'
											: 'Sharing opens when you set this fund live. Donations aren’t available yet.'
									}
								/>
							</div>
						</div>
					</>
				)}
			</div>
		</AuthGate>
	);
}
