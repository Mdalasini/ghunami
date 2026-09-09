import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { HorizonMark } from './Tip';

/**
 * Every auth screen sits on the same centred column: Horizon disc, display
 * question, mute subcopy, then the controls. Same paper, same face, same
 * pressable capsules as the create flow.
 */
export function AuthShell({
	title,
	sub,
	children
}: {
	title: string;
	sub: string;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-dvh flex-col bg-paper px-4 py-8">
			<header className="mx-auto w-full max-w-md">
				<Link
					to="/"
					className="font-ui inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-mute hover:bg-sun hover:text-ink"
				>
					<svg
						viewBox="0 0 20 20"
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M12 4l-6 6 6 6" />
					</svg>
					Back
				</Link>
			</header>

			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-16">
				<div className="flex flex-col items-center text-center">
					<span
						className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink text-card"
						aria-hidden="true"
					>
						<HorizonMark className="h-6 w-auto" />
					</span>
					<h1 className="font-display mt-5 text-3xl font-extrabold tracking-tight md:text-4xl">
						{title}
					</h1>
					<p className="mt-2 text-base text-mute">{sub}</p>
				</div>

				<div className="mt-8 flex flex-col gap-3">{children}</div>
			</main>
		</div>
	);
}
