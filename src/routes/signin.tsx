import { useEffect, useRef, useState, type ReactNode } from 'react';
import { data, redirect, useFetcher, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import { AuthShell } from '../components/AuthShell';
import { convexServer } from '../lib/convex.server';
import { loadServerEnv } from '../lib/env.server';
import { safeReturnTo } from '../lib/returnTo';
import { clearedCookie, readSession, sessionCookie } from '../lib/session.server';

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function meta() {
	return [{ title: 'Sign in · Ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	loadServerEnv();
	const url = new URL(request.url);
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	const resetToken = url.searchParams.get('token');
	if (readSession(request) && !resetToken) return redirect(returnTo);
	return { returnTo, resetToken };
}

export async function action({ request }: ActionFunctionArgs) {
	loadServerEnv();
	const form = await request.formData();
	const intent = String(form.get('intent'));
	const email = String(form.get('email') ?? '').trim().toLowerCase();
	const password = String(form.get('password') ?? '');
	try {
		if (intent === 'reset') {
			const result = await convexServer().action(api.authFlow.resetPassword, {
				token: String(form.get('token') ?? ''), password
			});
			return result.ok
				? data({ reset: true }, { headers: { 'Set-Cookie': clearedCookie() } })
				: { error: result.error };
		}
		if (!isEmail(email)) return { error: 'That email doesn’t look right.' };
		if (intent === 'recover') {
			const result = await convexServer().action(api.authFlow.requestPasswordReset, { email });
			return result.ok ? { recoverySent: true } : { error: result.error };
		}
		if (intent !== 'signin' && intent !== 'signup' && intent !== 'verify') {
			return { error: 'Something went wrong. Try again.' };
		}
		if (intent !== 'verify' && !password) return { error: 'Please enter your password.' };
		const result = intent === 'verify'
			? await convexServer().action(api.authFlow.verifyEmail, {
				code: String(form.get('code') ?? ''),
				pendingAuthenticationToken: String(form.get('pendingAuthenticationToken') ?? '')
			})
			: await convexServer().action(api.authFlow.authenticatePassword, {
				email, password, signUp: intent === 'signup',
				...(intent === 'signup' ? {
					firstName: String(form.get('firstName') ?? '').trim(),
					lastName: String(form.get('lastName') ?? '').trim()
				} : {})
			});
		if (result.session) {
			return redirect(safeReturnTo(String(form.get('returnTo') ?? '/')), {
				headers: { 'Set-Cookie': sessionCookie(result.session) }
			});
		}
		if (result.pendingAuthenticationToken) return { pendingAuthenticationToken: result.pendingAuthenticationToken };
		return { error: result.error };
	} catch {
		return { error: 'We couldn’t connect. Please try again.' };
	}
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
	return (
		<label className="block min-w-0 rounded-3xl border-2 border-line bg-card px-5 py-3 transition-colors focus-within:border-accent">
			<span className="text-xs font-extrabold tracking-wider text-mute uppercase">{label}</span>
			<input className="field-bare mt-1 text-base text-ink" {...props} />
		</label>
	);
}

// Keep sections mounted so layout and opacity can transition in both directions.
function Section({ open, children }: { open: boolean; children: ReactNode }) {
	return (
		<div className="grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none"
			style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
			inert={!open} aria-hidden={!open}>
			<div className="min-h-0 overflow-hidden"><div className="flex flex-col gap-3 pb-4">{children}</div></div>
		</div>
	);
}

type Phase = 'email' | 'password' | 'verify' | 'recover' | 'reset';

export default function SignIn() {
	const { returnTo, resetToken } = useLoaderData<typeof loader>();
	const fetcher = useFetcher<typeof action>();
	const [email, setEmail] = useState('');
	const [isNew, setIsNew] = useState(false);
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
	const [phase, setPhase] = useState<Phase>(resetToken ? 'reset' : 'email');
	const [code, setCode] = useState('');
	const [pendingToken, setPendingToken] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const busy = fetcher.state !== 'idle';
	const enteringPassword = phase === 'password' || phase === 'reset';

	useEffect(() => {
		const data = fetcher.data;
		if (!data) return;
		setError('error' in data ? data.error ?? null : null);
		if ('pendingAuthenticationToken' in data && data.pendingAuthenticationToken) {
			setPendingToken(data.pendingAuthenticationToken);
			setPassword('');
			setPhase('verify');
		}
		if ('recoverySent' in data) setNotice('If an account exists for this email, you’ll receive a link to reset your password.');
		if ('reset' in data) {
			setPassword('');
			setPhase('email');
			setIsNew(false);
			setNotice('Your password has been reset. Sign in with your new password.');
			// Remove the one-use credential from the address bar after success.
			window.history.replaceState(window.history.state, '', `/signin?returnTo=${encodeURIComponent(returnTo)}`);
		}
	}, [fetcher.data, returnTo]);

	useEffect(() => {
		const name = enteringPassword ? 'password' : phase === 'verify' ? 'code' : 'email';
		formRef.current?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.focus({ preventScroll: true });
	}, [phase, enteringPassword]);

	function changePhase(next: Phase) {
		setError(null);
		setNotice(null);
		setPassword('');
		setShowPassword(false);
		setCode('');
		setPendingToken('');
		setPhase(next);
	}

	const canSubmit = !busy && (phase === 'reset' ? !!password : isEmail(email))
		&& (phase !== 'email' || !isNew || (!!firstName.trim() && !!lastName.trim()))
		&& (!enteringPassword || !!password)
		&& (phase !== 'verify' || !!code.trim());
	const title = phase === 'recover' || phase === 'reset' ? 'Reset password'
		: phase === 'verify' ? 'Verify your email' : isNew ? 'Sign up' : 'Sign in to ghunami';
	const buttonText = phase === 'email' ? (isNew ? 'Continue' : 'Continue with email')
		: phase === 'recover' ? 'Send reset link' : phase === 'reset' ? 'Reset password'
		: phase === 'verify' ? 'Verify email' : isNew ? 'Continue' : 'Sign in';
	const linkClass = 'rounded px-1 text-sm font-medium text-accent-deep hover:underline disabled:text-mute';

	return (
		<AuthShell title={title}>
			<form ref={formRef} aria-label={title} aria-busy={busy} onSubmit={(event) => {
				event.preventDefault();
				if (!canSubmit) return;
				setError(null);
				setNotice(null);
				if (phase === 'email') { setPhase('password'); return; }
				fetcher.submit({
					intent: phase === 'password' ? (isNew ? 'signup' : 'signin') : phase,
					email, password, firstName, lastName, code, returnTo,
					pendingAuthenticationToken: pendingToken, token: resetToken ?? ''
				}, { method: 'post' });
			}}>
				<Section open={isNew && phase === 'email'}>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<Field label="First name" name="firstName" autoComplete="given-name" placeholder="Your first name" value={firstName}
							disabled={busy || phase !== 'email' || !isNew} onChange={(e) => setFirstName(e.currentTarget.value)} />
						<Field label="Surname" name="lastName" autoComplete="family-name" placeholder="Your surname" value={lastName}
							disabled={busy || phase !== 'email' || !isNew} onChange={(e) => setLastName(e.currentTarget.value)} />
					</div>
				</Section>
				<Section open={phase !== 'reset'}>
					<div className="relative">
						<Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" value={email}
							readOnly={phase === 'password' || phase === 'verify'} disabled={busy || phase === 'reset'}
							onChange={(e) => setEmail(e.currentTarget.value)} />
						{(phase === 'password' || phase === 'verify') && <button type="button" disabled={busy}
							className={`${linkClass} absolute top-3 right-4`} onClick={() => changePhase('email')}>Change email</button>}
					</div>
				</Section>
				<Section open={enteringPassword}>
					<div className="relative">
						<Field label="Password" name="password" type={showPassword ? 'text' : 'password'}
							autoComplete={isNew || phase === 'reset' ? 'new-password' : 'current-password'}
							placeholder={isNew || phase === 'reset' ? 'Create a password' : 'Your password'}
							value={password} disabled={busy || !enteringPassword} style={{ paddingRight: '3rem' }}
							onChange={(e) => setPassword(e.currentTarget.value)} />
						<button type="button" className={`${linkClass} absolute right-4 bottom-3`} aria-label={showPassword ? 'Hide password' : 'Show password'}
							aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
					</div>
					{!isNew && phase === 'password' && <button type="button" disabled={busy} className={`${linkClass} self-end`}
						onClick={() => changePhase('recover')}>Reset password</button>}
				</Section>
				<Section open={phase === 'verify'}>
					<p className="px-2 text-sm text-mute">Enter the verification code sent to your email.</p>
					<Field label="Verification code" name="code" autoComplete="one-time-code" inputMode="numeric" value={code}
						disabled={busy || phase !== 'verify'} onChange={(e) => setCode(e.currentTarget.value)} />
				</Section>
				{error && <p role="alert" className="mb-4 px-2 text-sm font-medium text-error">{error}</p>}
				{notice && <p role="status" className="mb-4 px-2 text-sm text-mute">{notice}</p>}
				<button type="submit" disabled={!canSubmit} className={`btn-press mb-4 w-full ${canSubmit ? 'bg-accent text-card hover:bg-accent-deep' : 'bg-line text-mute'}`}>
					{busy ? 'One moment…' : buttonText}
				</button>
				<Section open={phase === 'email'}>
					<div className="my-2 flex items-center gap-3 px-2">
						<span className="h-px flex-1 bg-line" /><span className="text-xs font-extrabold tracking-wider text-mute uppercase">OR</span><span className="h-px flex-1 bg-line" />
					</div>
					<a href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`} className="btn-press mb-2 w-full border-2 border-line bg-card text-mute hover:text-ink"
						style={{ ['--btn-edge' as string]: 'var(--color-line)' }}><GoogleMark />Continue with Google</a>
				</Section>
				<Section open={phase === 'email' || phase === 'password'}>
					<p className="pt-2 text-center text-sm text-mute">
						{isNew ? 'Already have an account? ' : 'Don’t have an account? '}
						<button type="button" className={linkClass} disabled={busy} onClick={() => {
							setIsNew(!isNew); changePhase('email');
						}}>{isNew ? 'Sign in' : 'Sign up'}</button>
					</p>
				</Section>
				<Section open={phase !== 'email'}>
					<button type="button" className={`${linkClass} mx-auto mt-2`} disabled={busy} onClick={() => changePhase('email')}>
						{phase === 'recover' || phase === 'reset' ? 'Back to sign in' : '‹ Change method'}
					</button>
				</Section>
			</form>
		</AuthShell>
	);
}

function GoogleMark() {
	return (
		<svg viewBox="0 0 18 18" className="mr-3 h-4 w-4" aria-hidden="true">
			<path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
			<path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
			<path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z" />
			<path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
		</svg>
	);
}
