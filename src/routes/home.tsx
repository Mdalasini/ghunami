import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import logo from '../assets/logo.svg';
import { AuthBar } from '../components/AuthBar';
import { resetDraft } from '../lib/draft';

export function meta() {
	return [{ title: 'Ghunami' }];
}

export default function Home() {
	const navigate = useNavigate();

	function start(event: MouseEvent<HTMLAnchorElement>) {
		event.preventDefault();
		resetDraft();
		void navigate('/create');
	}

	return (
		<div className="min-h-dvh px-6 py-8 md:px-12">
			<header className="flex items-center justify-between gap-4">
				<Link to="/" aria-label="ghunami — home">
					<img src={logo} alt="ghunami" className="h-8 w-auto" />
				</Link>
				<div className="flex items-center gap-2">
					<AuthBar />
					<Link
						to="/create"
						onClick={start}
						className="font-ui rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-sun"
					>
						Start a fundraiser
					</Link>
				</div>
			</header>

			<main className="mx-auto flex max-w-3xl flex-col items-center pt-28 text-center md:pt-36">
				<h1 className="font-display mt-4 text-5xl leading-[1.05] font-extrabold tracking-tight md:text-7xl">
					You don&apos;t have to stand alone.
				</h1>
				<Link
					to="/create"
					onClick={start}
					className="btn-press mt-10 bg-accent px-8 text-card hover:bg-accent-deep"
				>
					Start a fundraiser
				</Link>
			</main>
		</div>
	);
}
