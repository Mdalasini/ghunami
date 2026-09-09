import type { ReactNode } from 'react';
import {
	isRouteErrorResponse,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration
} from 'react-router';
import type { Route } from './+types/root';
import { HorizonMark } from './components/Tip';
import './index.css';

export const links: Route.LinksFunction = () => [
	{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
	{
		rel: 'preload',
		href: '/fonts/rubik-latin.woff2',
		as: 'font',
		type: 'font/woff2',
		crossOrigin: 'anonymous'
	}
];

export function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="text-scale" content="scale" />
				<meta name="theme-color" content="#15803d" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export function HydrateFallback() {
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper">
			<span
				className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink text-card"
				aria-hidden="true"
			>
				<HorizonMark className="h-6 w-auto" />
			</span>
			<p className="text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
		</div>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = 'Something went wrong';
	let details = 'Try again, or go back home.';

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? 'Page not found' : 'Error';
		details =
			error.status === 404
				? 'That page is not part of ghunami.'
				: error.statusText || details;
	} else if (import.meta.env.DEV && error instanceof Error) {
		details = error.message;
	}

	return (
		<main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 text-center">
			<h1 className="font-display text-4xl font-extrabold tracking-tight">{message}</h1>
			<p className="mt-3 text-base text-mute">{details}</p>
			<Link to="/" className="btn-press mt-8 bg-accent text-card hover:bg-accent-deep">
				Home
			</Link>
		</main>
	);
}
