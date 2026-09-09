
import { useEffect, useRef, useState } from 'react';
import {
	redirect,
	useFetcher,
	useLoaderData,
	type ActionFunctionArgs,
	type LoaderFunctionArgs
} from 'react-router';
import { api } from '../../convex/_generated/api';
import { AuthShell } from '../components/AuthShell';
import { convexServer } from '../lib/convex.server';
import { loadServerEnv } from '../lib/env.server';
import { safeReturnTo } from '../lib/returnTo';
import { readSession, sessionCookie } from '../lib/session.server';

const CODE_LENGTH = 6;


/** Deliberately loose — WorkOS is the real authority on deliverability. */
function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function meta() {
	return [{ title: 'Log in · Ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	loadServerEnv();
	const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'));
	if (readSession(request)) {
		return redirect(returnTo);
	}
	return { returnTo };
}

export async function action({ request }: ActionFunctionArgs) {
	loadServerEnv();
	const form = await request.formData();
	const intent = String(form.get('intent'));
	const email = String(form.get('email') ?? '').trim().toLowerCase();

	if (!isEmail(email)) {
		return { error: 'That email doesn’t look right.' };
	}

	if (intent === 'send') {
		const firstName = String(form.get('firstName') ?? '').trim();
		const lastName = String(form.get('lastName') ?? '').trim();
		const result = await convexServer().action(api.authFlow.sendCode, {
			email,
			...(firstName ? { firstName, lastName } : {})
		});
		return result.ok ? { sent: true } : { error: result.error };
	}

	if (intent === 'verify') {
		const code = String(form.get('code') ?? '').trim();
		const result = await convexServer().action(api.authFlow.verifyCode, { email, code });
		if (!result.session) {
			return { error: result.error };
		}
		return redirect(safeReturnTo(String(form.get('returnTo') ?? '/')), {
			headers: { 'Set-Cookie': sessionCookie(result.session) }
		});
	}

	return { error: 'Something went wrong. Try again.' };
}


function Field({
	label,
	className = '',
	style,
	...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
	return (
		// className/style dress the bubble, not the input: the bubble carries the
		// border, the focus state, and the reveal animation.
		<label
			style={style}
			className={`block rounded-3xl border-2 border-line bg-card px-5 py-3 transition-colors focus-within:border-accent ${className}`}
		>
			<span className="text-xs font-extrabold tracking-wider text-mute uppercase">{label}</span>
			<input className="field-bare mt-1 text-base text-ink" {...props} />
		</label>
	);
}

export default function SignIn() {
	const { returnTo } = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();

	const [email, setEmail] = useState('');
	const [isNew, setIsNew] = useState(false);
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [phase, setPhase] = useState<'email' | 'code'>('email');
	const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
	const boxes = useRef<Array<HTMLInputElement | null>>([]);

	const valid = isEmail(email);


	const busy = fetcher.state !== 'idle';
	const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;

	useEffect(() => {
		if (fetcher.data && 'sent' in fetcher.data && fetcher.data.sent) {
			setPhase('code');
		}
	}, [fetcher.data]);

	useEffect(() => {
		if (phase === 'code') {
			boxes.current[0]?.focus();
		}
	}, [phase]);

	// A rejected code should be retypable straight away, not deleted by hand.
	useEffect(() => {
		if (phase === 'code' && error) {
			setDigits(Array(CODE_LENGTH).fill(''));
			boxes.current[0]?.focus();
		}
	}, [phase, error]);

	function send() {
		fetcher.submit(
			{ intent: 'send', email, ...(isNew ? { firstName, lastName } : {}) },
			{ method: 'post' }
		);
	}

	function verify(value: string) {
		fetcher.submit({ intent: 'verify', email, code: value, returnTo }, { method: 'post' });
	}

	function setDigit(index: number, raw: string) {
		const clean = raw.replace(/\D/g, '');
		if (!clean) {
			setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
			return;
		}
		// A paste fills forward from here; a keystroke fills one and advances.
		// Kept out of the state updater so a StrictMode double-invoke cannot
		// submit the code twice.
		const next = [...digits];
		for (let i = 0; i < clean.length && index + i < CODE_LENGTH; i += 1) {
			next[index + i] = clean[i]!;
		}
		setDigits(next);
		boxes.current[Math.min(index + clean.length, CODE_LENGTH - 1)]?.focus();
		if (next.join('').length === CODE_LENGTH) {
			verify(next.join(''));
		}
	}


	const namesReady = firstName.trim().length > 0 && lastName.trim().length > 0;
	const canSubmit = valid && !busy && (!isNew || namesReady);
	const label = isNew ? 'Sign up' : 'Log in';

	if (phase === 'code') {
		return (
			<CodeStep
				email={email}
				digits={digits}
				boxes={boxes}
				busy={busy}
				error={error}
				onDigit={setDigit}
				onClear={() => setDigits(Array(CODE_LENGTH).fill(''))}
				onResend={send}
			/>
		);
	}

	return (
		<AuthShell
					title={isNew ? 'Sign up for ghunami' : 'Log in to ghunami'}
					sub={isNew ? 'Create an account to get started.' : 'Welcome back. Log in to your account.'}
				>
			<Field
				label="Email"
				type="email"
				name="email"
				autoComplete="email"
				autoFocus
				inputMode="email"
				value={email}
				onChange={(event) => setEmail(event.currentTarget.value)}
			/>

			<button
				type="button"
				onClick={() => setIsNew(!isNew)}
				disabled={busy}
				className="px-2 text-sm font-medium text-accent-deep underline"
			>
				{isNew ? 'Already have an account? Log in' : 'New here? Sign up'}
			</button>

			{isNew && (
				<div className="flex flex-col gap-3">
					<div className="reveal">
						<Field
							label="First name"
							name="firstName"
							autoComplete="given-name"
							value={firstName}
							onChange={(event) => setFirstName(event.currentTarget.value)}
						/>
					</div>
					<div className="reveal" style={{ animationDelay: '60ms' }}>
						<Field
							label="Last name"
							name="lastName"
							autoComplete="family-name"
							value={lastName}
							onChange={(event) => setLastName(event.currentTarget.value)}
						/>
					</div>
				</div>
			)}

			{error && <p className="px-2 text-sm font-medium text-error">{error}</p>}

			<button
				type="button"
				onClick={send}
				disabled={!canSubmit}
				className={`btn-press mt-1 w-full ${
					canSubmit ? 'bg-accent text-card hover:bg-accent-deep' : 'bg-line text-mute'
				}`}
			>
				{busy ? 'One moment' : label}
			</button>

			<div className="mt-2 flex items-center gap-3 px-2">
				<span className="h-px flex-1 bg-line" />
				<span className="text-xs font-extrabold tracking-wider text-mute uppercase">or</span>
				<span className="h-px flex-1 bg-line" />
			</div>

			<a
				href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
				className="btn-press w-full border-2 border-line bg-card text-mute hover:text-ink"
				style={{ ['--btn-edge' as string]: 'var(--color-line)' }}
			>
				<GoogleMark />
				Continue with Google
			</a>
		</AuthShell>
	);
}

function GoogleMark() {
	return (
		<svg viewBox="0 0 18 18" className="mr-3 h-4 w-4" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
			/>
			<path
				fill="#34A853"
				d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
			/>
			<path
				fill="#FBBC05"
				d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
			/>
			<path
				fill="#EA4335"
				d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
			/>
		</svg>
	);
}

function CodeStep({
	email,
	digits,
	boxes,
	busy,
	error,
	onDigit,
	onClear,
	onResend
}: {
	email: string;
	digits: string[];
	boxes: React.RefObject<Array<HTMLInputElement | null>>;
	busy: boolean;
	error: string | null | undefined;
	onDigit: (index: number, value: string) => void;
	onClear: () => void;
	onResend: () => void;
}) {
	return (
		<AuthShell title="Confirm it’s you" sub={`Enter the code sent to ${email}`}>
			<div className="-mt-4 flex justify-center pb-2">
				<span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-line bg-card">
					<svg
						viewBox="0 0 24 24"
						className="h-7 w-7 text-ink"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<rect x="2.5" y="5" width="19" height="14" rx="3" />
						<path d="M3.5 7.5 12 13l8.5-5.5" />
					</svg>
					<span className="absolute -top-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-card">
						1
					</span>
				</span>
			</div>

			<div className="flex justify-center gap-2" role="group" aria-label="Six-digit code">
				{digits.map((digit, index) => (
					<input
						key={index}
						ref={(node) => {
							boxes.current[index] = node;
						}}
						value={digit}
						onChange={(event) => onDigit(index, event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === 'Backspace' && !digit && index > 0) {
								boxes.current[index - 1]?.focus();
								onDigit(index - 1, '');
							}
						}}
						inputMode="numeric"
						autoComplete={index === 0 ? 'one-time-code' : 'off'}
						maxLength={CODE_LENGTH}
						aria-label={`Digit ${index + 1}`}
						disabled={busy}
						className="h-14 w-12 rounded-2xl border-2 border-line bg-card text-center text-xl font-extrabold text-ink transition-colors focus:border-accent focus:ring-0"
					/>
				))}
			</div>

			{error && <p className="text-center text-sm font-medium text-error">{error}</p>}

			<div className="mt-2 flex flex-col items-center gap-1">
				<button
					type="button"
					onClick={() => {
						onClear();
						onResend();
					}}
					disabled={busy}
					className="font-ui rounded-full px-4 py-2 text-sm font-extrabold text-accent hover:bg-sun disabled:text-mute"
				>
					Resend code
				</button>
			</div>
		</AuthShell>
	);
}
