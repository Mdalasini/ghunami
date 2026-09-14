import { Link } from 'react-router';
import { AuthBar } from '../components/AuthBar';
import { SiteHeader } from '../components/BrandLink';
import { resetDraft } from '../lib/draft';

export function meta() {
	return [{ title: 'ghunami' }];
}

export default function Home() {
	return (
		<div className="min-h-dvh">
			<SiteHeader>
				<AuthBar />
			</SiteHeader>

			<main className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-28 text-center md:px-12 md:pt-36">
				<h1 className="font-display mt-4 text-5xl leading-[1.05] font-extrabold tracking-tight md:text-7xl">
					You don&apos;t have to stand alone.
				</h1>
				<Link
					to="/create"
					onClick={resetDraft}
					className="btn-press mt-10 bg-accent px-8 text-card hover:bg-accent-deep"
				>
					Start a fundraiser
				</Link>
			</main>
		</div>
	);
}
