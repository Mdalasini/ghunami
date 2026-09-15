import { useMutation, useQuery } from 'convex/react';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { isFundID } from '../../convex/lib/fundId';
import { AuthGate } from '../components/AuthGate';
import { SiteHeader } from '../components/BrandLink';
import { EditFundDialog, type EditField } from '../components/EditFundDialog';
import { FundActions, FundCover, FundDonations, FundProgress, FundStory, useFundSupport } from '../components/FundView';
import { Modal } from '../components/Modal';
import { fundPath } from '../lib/fundUrl';
import { coverMediaUrl } from '../lib/media';
import type { PreviewFundDraft } from '../lib/persistFund';
import { requireSession } from '../lib/requireSession';

export function meta() {
	return [{ title: 'Preview your fund · ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	requireSession(request);
	return null;
}

function EditControl({
	fund,
	field,
	children
}: {
	fund: PreviewFundDraft;
	field: EditField;
	children: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-accent transition-colors hover:bg-sun"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen(true)}
			>
				{children}
			</button>
			{open ? <EditFundDialog fund={fund} field={field} onClose={() => setOpen(false)} /> : null}
		</>
	);
}

function PublishControl({ fundID }: { fundID: string }) {
	const [confirming, setConfirming] = useState(false);
	return (
		<>
			<button
				type="button"
				className="rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold tracking-wider text-card uppercase hover:bg-accent-deep"
				aria-haspopup="dialog"
				aria-expanded={confirming}
				onClick={() => setConfirming(true)}
			>
				Set fund live
			</button>
			{confirming ? <PublishDialog fundID={fundID} onCancel={() => setConfirming(false)} /> : null}
		</>
	);
}

function PublishDialog({ fundID, onCancel }: { fundID: string; onCancel: () => void }) {
	const publish = useMutation(api.funds.publish);
	const navigate = useNavigate();
	const titleId = useId();
	const pendingRef = useRef(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState('');
	pendingRef.current = pending;

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
		<Modal
			titleId={titleId}
			title="Set this fund live?"
			onClose={onCancel}
			closeDisabled={pending}
			closeLabel="Cancel publishing"
			onOpen={(panel) => panel.querySelector('button')?.focus()}
		>
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
		</Modal>
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
	const support = useFundSupport(valid ? fundID : null);
	const donateEnabled = Boolean(live && support.donateEnabled);
	const footnote = !live
		? 'Sharing opens when you set this fund live. Donations aren’t available yet.'
		: donateEnabled
			? 'Test payments via M-PESA sandbox. Donations collect to Ghunami’s PayBill.'
			: 'Donations aren’t available yet.';

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
						{support.donateDialog}
						<main className="slide-forward mx-auto w-full max-w-6xl flex-1 px-6 pt-8 pb-64 md:pt-12 lg:pb-20">
							<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
								<article className="min-w-0">
									<div className="mb-6 flex items-start justify-between gap-3">
										<h1 className="text-3xl leading-[1.12] font-extrabold tracking-[-0.035em] wrap-break-word sm:text-4xl md:text-5xl">
											{fund.title}
										</h1>
										<EditControl fund={fund} field="title">
											Edit title
										</EditControl>
									</div>
									<FundCover
										title={fund.title}
										coverUrl={fund.hasCover ? coverMediaUrl(fund.fundID, 'cover', fund.updatedAt) : ''}
										organiser={fund.organiserName || 'You'}
										emptyTitle="A place for your cover photo"
										emptyHint="Give your story a face. You can add this later."
									/>
									<div className="mt-2 flex justify-end">
										<EditControl fund={fund} field="cover">
											{fund.hasCover ? 'Edit cover' : 'Add cover'}
										</EditControl>
									</div>
									<section className="mt-5 border-t border-line pt-7" aria-labelledby="story-heading">
										<div className="mb-5 flex items-center justify-between gap-3">
											<h2 id="story-heading" className="text-lg font-extrabold">
												The story
											</h2>
											<EditControl fund={fund} field="story">
												Edit story
											</EditControl>
										</div>
										<FundStory html={fund.story} />
									</section>
								</article>

								<aside className="rounded-3xl border border-line bg-card p-6 lg:sticky lg:top-8" aria-label="Donation preview">
									<div className="hidden lg:block">
										<div className="-mt-2 -mr-2 flex justify-end">
											<EditControl fund={fund} field="goal">
												Edit goal
											</EditControl>
										</div>
										<FundProgress
											goal={fund.goal}
											raised={support.raised}
											donationCount={support.donationCount}
											testPayments={support.testPayments}
										/>
										<FundActions
											footnote={footnote}
											donateEnabled={donateEnabled}
											onDonate={support.openDonate}
										/>
									</div>
									<FundDonations
										className="lg:mt-6 lg:border-t lg:border-line lg:pt-6"
										count={support.donationCount}
										donations={support.donations}
									/>
								</aside>
							</div>
						</main>

						<div className="fixed inset-x-0 bottom-0 z-10 px-3 pb-3 lg:hidden">
							<div className="mx-auto max-w-xl rounded-3xl border border-line bg-card p-4 shadow-[0_-4px_24px_-8px_rgb(15_26_18/0.18)]">
								<div className="-mt-2 -mr-2 flex justify-end">
									<EditControl fund={fund} field="goal">
										Edit goal
									</EditControl>
								</div>
								<FundProgress
									goal={fund.goal}
									raised={support.raised}
									donationCount={support.donationCount}
									testPayments={support.testPayments}
									compact
								/>
								<FundActions
									footnote={footnote}
									donateEnabled={donateEnabled}
									onDonate={support.openDonate}
								/>
							</div>
						</div>
					</>
				)}
			</div>
		</AuthGate>
	);
}
