import { usePaginatedQuery } from 'convex/react';
import { Link } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { AuthGate } from '../components/AuthGate';
import { BrandLink } from '../components/BrandLink';
import { CoverImage } from '../components/CoverImage';
import { HorizonDisc } from '../components/HorizonMark';
import { formatGoal, resetDraft } from '../lib/draft';
import { coverMediaUrl } from '../lib/media';
import { requireSession } from '../lib/requireSession';

export function meta() {
	return [{ title: 'My funds · ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	requireSession(request);
	return null;
}

export default function MyFunds() {
	const { results, status, loadMore } = usePaginatedQuery(api.funds.listMine, {}, { initialNumItems: 20 });

	return (
		<AuthGate>
			<div className="flex min-h-dvh flex-col">
				<header className="border-b border-line bg-paper">
					<div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-5">
						<BrandLink />
						{results.length > 0 && (
							<Link
								to="/create"
								onClick={resetDraft}
								className="rounded-full bg-accent px-4 py-2 text-xs font-extrabold tracking-wider text-card uppercase hover:bg-accent-deep"
							>
								Create a fund
							</Link>
						)}
					</div>
				</header>
				<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
					<h1 className="text-3xl font-extrabold tracking-[-0.02em]">My funds</h1>
					{status === 'LoadingFirstPage' ? (
						<p className="mt-8 text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
					) : results === undefined ? (
						<p className="mt-8 text-mute" role="alert">
							We couldn’t load your funds. Try again.
						</p>
					) : results.length === 0 ? (
						<div className="mt-10 flex flex-col gap-5">
							<p className="text-mute">You haven’t saved a fund yet. Start one and preview it to keep it here.</p>
							<Link
								to="/create"
								onClick={resetDraft}
								className="btn-press self-start bg-accent text-card hover:bg-accent-deep"
							>
								Create a fund
							</Link>
						</div>
					) : (
						<ul className="mt-8 flex flex-col gap-4">
							{results.map((fund) => (
								<li key={fund.fundID}>
									<Link
										to={`/preview/${fund.fundID}`}
										className="flex gap-4 rounded-3xl border border-line bg-card p-4 transition-colors hover:border-accent"
									>
										{fund.hasCover ? (
											<CoverImage
												src={coverMediaUrl(fund.fundID)}
												alt=""
												className="h-20 w-24 shrink-0 rounded-2xl"
											/>
										) : (
											<div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-2xl bg-sun">
												<HorizonDisc className="h-10 w-10" />
											</div>
										)}
										<div className="min-w-0 flex-1">
											<p className="truncate font-extrabold">{fund.title}</p>
											<p className="mt-1 text-sm text-mute">{formatGoal(fund.goal)}</p>
											<p className="mt-2 text-xs font-bold tracking-wider text-hint uppercase">Draft</p>
										</div>
									</Link>
								</li>
							))}
						</ul>
					)}
					{status === 'CanLoadMore' && (
						<button
							type="button"
							className="btn-press mt-8 self-center border-2 border-line bg-card text-accent [--btn-edge:var(--color-line)]"
							onClick={() => loadMore(20)}
						>
							Load more
						</button>
					)}
				</main>
			</div>
		</AuthGate>
	);
}
