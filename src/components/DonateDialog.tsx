import { useAction, useQuery } from 'convex/react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import { normalizeKenyanMsisdn } from '../../convex/lib/mpesa';
import { formatGoal } from '../lib/draft';
import {
	donateAmountError,
	donateStatusCopy,
	guestDonateSession,
	parseCustomDonateText,
	selectedDonateAmount
} from '../lib/donate';
import { Modal } from './Modal';

export function DonateDialog({ fundID, onClose }: { fundID: string; onClose: () => void }) {
	const titleId = useId();
	const initiate = useAction(api.donations.initiate);
	const config = useQuery(api.donations.publicConfig);
	const pendingRef = useRef(false);
	const [preset, setPreset] = useState<number | 'custom'>(500);
	const [customText, setCustomText] = useState('');
	const [customAmount, setCustomAmount] = useState<number | null>(null);
	const [phone, setPhone] = useState('');
	const [error, setError] = useState('');
	const [pending, setPending] = useState(false);
	const [statusKey, setStatusKey] = useState<string | null>(null);
	const [localStatus, setLocalStatus] = useState<'form' | 'accepted' | 'unknown' | 'failed'>('form');

	const remote = useQuery(api.donations.getStatus, statusKey ? { statusKey } : 'skip');
	const status = remote?.status ?? localStatus;
	const amount = selectedDonateAmount(preset, customAmount);
	const amountError = donateAmountError(amount);
	const copy = donateStatusCopy(status === 'form' ? 'form' : status);
	const waiting = status === 'pending' || status === 'accepted';
	const done = status === 'succeeded' || status === 'cancelled' || status === 'failed';

	pendingRef.current = pending;

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (pendingRef.current || waiting) return;
		setError('');
		if (amountError || amount === null) {
			setError(amountError ?? 'Choose an amount.');
			return;
		}
		let msisdn: string;
		try {
			msisdn = normalizeKenyanMsisdn(phone);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'Enter a Kenyan M-PESA number.');
			return;
		}
		pendingRef.current = true;
		setPending(true);
		try {
			const result = await initiate({
				fundID,
				amount,
				phone: msisdn,
				guestSessionId: guestDonateSession(),
				idempotencyKey: crypto.randomUUID()
			});
			setStatusKey(result.statusKey);
			setLocalStatus(result.status === 'unknown' ? 'unknown' : result.status === 'failed' ? 'failed' : 'accepted');
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'Couldn’t start the M-PESA prompt. Try again.');
			setPending(false);
			pendingRef.current = false;
		}
	}

	function retry() {
		setStatusKey(null);
		setLocalStatus('form');
		setPending(false);
		pendingRef.current = false;
		setError('');
	}

	return (
		<Modal
			titleId={titleId}
			title={copy.title}
			onClose={onClose}
			closeLabel="Close donation"
			onOpen={(panel) => (panel.querySelector('button, input') as HTMLElement | null)?.focus()}
		>
			<p className="mt-2 rounded-xl bg-sun/80 px-3 py-2 text-xs font-bold text-mute">
				Test payment · M-PESA sandbox. No real money is collected.
			</p>
			{status === 'form' ? (
				<form className="mt-5" onSubmit={(event) => void submit(event)}>
					<fieldset className="min-w-0">
						<legend className="text-sm font-bold">Amount</legend>
						<div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggested amounts">
							{(config?.presets ?? [100, 500, 1000, 2000]).map((value) => (
								<button
									key={value}
									type="button"
									className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
										preset === value
											? 'border-accent bg-accent text-card'
											: 'border-line bg-card text-accent hover:border-accent'
									}`}
									aria-pressed={preset === value}
									onClick={() => setPreset(value)}
								>
									{formatGoal(value)}
								</button>
							))}
							<button
								type="button"
								className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
									preset === 'custom'
										? 'border-accent bg-accent text-card'
										: 'border-line bg-card text-accent hover:border-accent'
								}`}
								aria-pressed={preset === 'custom'}
								onClick={() => setPreset('custom')}
							>
								Custom
							</button>
						</div>
						{preset === 'custom' ? (
							<label className="mt-4 flex items-center gap-3 border-b-2 border-line pb-2 focus-within:border-accent">
								<span className="sr-only">Custom amount in Kenyan shillings</span>
								<span className="shrink-0 text-lg font-extrabold text-accent" aria-hidden="true">
									Ksh
								</span>
								<input
									className="field-bare min-w-0 flex-1 text-xl font-extrabold"
									inputMode="numeric"
									autoComplete="off"
									value={customText}
									onChange={(event) => {
										const parsed = parseCustomDonateText(event.currentTarget.value);
										setCustomText(parsed.text);
										setCustomAmount(parsed.amount);
									}}
								/>
							</label>
						) : null}
					</fieldset>
					<label className="mt-6 block">
						<span className="text-sm font-bold">M-PESA number</span>
						<input
							className="mt-2 w-full rounded-2xl border-2 border-line bg-card px-4 py-3 font-bold outline-none focus:border-accent"
							type="tel"
							autoComplete="tel"
							inputMode="tel"
							placeholder="0712 345 678"
							value={phone}
							onChange={(event) => setPhone(event.currentTarget.value)}
						/>
					</label>
					<p className="mt-3 text-xs leading-relaxed text-hint">
						We’ll send a prompt to this phone. Ghunami never asks for your M-PESA PIN.
					</p>
					{error ? (
						<p className="mt-3 text-sm font-bold text-error" role="alert">
							{error}
						</p>
					) : null}
					<button type="submit" disabled={pending} className="btn-press mt-6 w-full bg-accent text-card hover:bg-accent-deep">
						{amount ? `Pay ${formatGoal(amount)}` : 'Pay'}
					</button>
				</form>
			) : (
				<div className="mt-5">
					<p className="text-sm leading-relaxed text-mute" role="status" aria-live="polite">
						{copy.body}
					</p>
					{remote ? (
						<p className="mt-3 text-lg font-extrabold">{formatGoal(remote.amount)}</p>
					) : amount ? (
						<p className="mt-3 text-lg font-extrabold">{formatGoal(amount)}</p>
					) : null}
					{waiting || status === 'unknown' ? (
						<p className="mt-4 text-sm font-bold text-accent">
							{status === 'unknown' ? 'Waiting for confirmation…' : 'Waiting for phone confirmation…'}
						</p>
					) : null}
					{done ? (
						<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
							{status !== 'succeeded' ? (
								<button
									type="button"
									className="btn-press border-2 border-line bg-card px-5 text-accent [--btn-edge:var(--color-line)]"
									onClick={retry}
								>
									Try again
								</button>
							) : null}
							<button type="button" className="btn-press bg-accent px-5 text-card hover:bg-accent-deep" onClick={onClose}>
								{status === 'succeeded' ? 'Done' : 'Close'}
							</button>
						</div>
					) : null}
				</div>
			)}
		</Modal>
	);
}
