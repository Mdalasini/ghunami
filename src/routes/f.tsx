import { useConvexAuth, useQuery } from 'convex/react';
import { data, Link, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { isFundID } from '../../convex/lib/fundId';
import { SiteHeader } from '../components/BrandLink';
import { FundActions, FundCover, FundDonations, FundProgress, FundStory } from '../components/FundView';
import { convexServer } from '../lib/convex.server';
import { fundPath, isCanonicalFundPath } from '../lib/fundUrl';
import { coverMediaUrl } from '../lib/media';

type PublicFund = {
	fundID: string;
	goal: number;
	title: string;
	story: string;
	hasCover: boolean;
	organiserName: string;
	updatedAt: number;
};

type LoaderData = { fund: PublicFund | null; origin: string };

export function meta({ data, loaderData }: { data?: LoaderData; loaderData?: LoaderData }) {
	const page = loaderData ?? data;
	if (!page?.fund) return [{ title: 'Fund not found · ghunami' }];
	const href = `${page.origin}${fundPath(page.fund.fundID, page.fund.title)}`;
	return [{ title: `${page.fund.title} · ghunami` }, { tagName: 'link', rel: 'canonical', href }];
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const origin = new URL(request.url).origin;
	const fundID = params.fundID ?? '';
	if (!isFundID(fundID)) {
		return data({ fund: null, origin } satisfies LoaderData, { status: 404 });
	}

	const fund = await convexServer().query(api.funds.getPublic, { fundID });
	if (!fund) {
		return data({ fund: null, origin } satisfies LoaderData, { status: 404 });
	}

	const url = new URL(request.url);
	const canonical = fundPath(fund.fundID, fund.title);
	if (!isCanonicalFundPath(url.pathname, fund.fundID, fund.title)) {
		url.searchParams.delete('_routes');
		return redirect(`${canonical}${url.search}`);
	}

	return { fund, origin } satisfies LoaderData;
}

function OwnerManageBar({ fundID }: { fundID: string }) {
	const { isAuthenticated } = useConvexAuth();
	const mine = useQuery(api.funds.getPreview, isAuthenticated ? { fundID } : 'skip');
	if (!mine) return null;
	return (
		<p className="border-b border-line bg-sun/60 px-6 py-2.5 text-center text-xs font-bold text-mute">
			You own this fund ·{' '}
			<Link to={`/preview/${fundID}`} className="text-accent hover:underline">
				Manage
			</Link>
		</p>
	);
}

function Missing() {
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-6 py-16">
				<h1 className="text-3xl font-extrabold">Fund not found</h1>
				<p className="text-mute">This fund isn’t available. It may be private, or the link may be wrong.</p>
			</main>
		</div>
	);
}

export default function PublicFundPage() {
	const { fund, origin } = useLoaderData<LoaderData>();
	if (!fund) return <Missing />;

	const organiser = fund.organiserName;
	const coverUrl = fund.hasCover ? coverMediaUrl(fund.fundID, 'cover', fund.updatedAt) : '';
	const shareUrl = `${origin}${fundPath(fund.fundID, fund.title)}`;

	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<OwnerManageBar fundID={fund.fundID} />
			<main className="slide-forward mx-auto w-full max-w-6xl flex-1 px-6 pt-8 pb-48 md:pt-12 lg:pb-20">
				<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
					<article className="min-w-0">
						<h1 className="mb-6 text-3xl leading-[1.12] font-extrabold tracking-[-0.035em] wrap-break-word sm:text-4xl md:text-5xl">
							{fund.title}
						</h1>
						<FundCover
							title={fund.title}
							coverUrl={coverUrl}
							organiser={organiser}
							emptyTitle="No cover photo"
							emptyHint="The organiser hasn’t added a photo yet."
						/>
						<section className="mt-7 border-t border-line pt-7" aria-labelledby="story-heading">
							<h2 id="story-heading" className="mb-5 text-lg font-extrabold">
								The story
							</h2>
							<FundStory html={fund.story} />
						</section>
					</article>
					<aside className="rounded-3xl border border-line bg-card p-6 lg:sticky lg:top-8" aria-label="Fundraising">
						<FundProgress goal={fund.goal} />
						<div className="hidden lg:block">
							<FundActions shareUrl={shareUrl} footnote="Donations coming soon." />
						</div>
						<FundDonations />
					</aside>
				</div>
			</main>
			<div className="fixed inset-x-0 bottom-0 z-10 px-3 pb-3 lg:hidden">
				<div className="mx-auto max-w-xl rounded-3xl border border-line bg-card p-4 shadow-[0_-4px_24px_-8px_rgb(15_26_18/0.18)]">
					<FundProgress goal={fund.goal} compact />
					<FundActions shareUrl={shareUrl} footnote="Donations coming soon." />
				</div>
			</div>
		</div>
	);
}
