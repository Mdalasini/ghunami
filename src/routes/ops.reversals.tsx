import { useAction, useQuery } from 'convex/react';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { AuthGate } from '../components/AuthGate';
import { SiteHeader } from '../components/BrandLink';
import { formatGoal } from '../lib/draft';
import { requireSession } from '../lib/requireSession';

export function meta() {
	return [{ title: 'Reversals · ghunami' }];
}

export async function loader({ request }: LoaderFunctionArgs) {
	requireSession(request);
	return null;
}

export default function OperatorReversals() {
	const access = useQuery(api.reversals.access);
	const list = useQuery(api.reversals.listPayments, access?.operator
		? { paginationOpts: { numItems: 40, cursor: null } }
		: 'skip');
	const initiate = useAction(api.reversals.initiate);
	const titleId = useId();
	const pendingRef = useRef(false);
	const [selected, setSelected] = useState<Id<'donationAttempts'> | null>(null);
	const [reason, setReason] = useState('');
	const [confirm, setConfirm] = useState(false);
	const [error, setError] = useState('');
	const [pending, setPending] = useState(false);
	const [reversalId, setReversalId] = useState<Id<'reversalAttempts'> | null>(null);

	const reversal = useQuery(api.reversals.getReversal, reversalId ? { reversalId } : 'skip');
	const selectedRow = list?.page.find((row) => row.attemptId === selected);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (pendingRef.current || !selected) return;
		setError('');
		pendingRef.current = true;
		setPending(true);
		try {
			const result = await initiate({
				donationAttemptId: selected,
				reason,
				idempotencyKey: crypto.randomUUID(),
				confirm
			});
			setReversalId(result.reversalId);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'Couldn’t submit the reversal.');
		} finally {
			setPending(false);
			pendingRef.current = false;
		}
	}

	return (
		<AuthGate>
			<div className="flex min-h-dvh flex-col">
				<SiteHeader />
				<main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
					<h1 id={titleId} className="text-3xl font-extrabold">
						Payment reversals
					</h1>
					{access === undefined ? (
						<p className="mt-6 text-sm font-extrabold tracking-wider text-mute uppercase">Loading</p>
					) : !access.operator ? (
						<p className="mt-6 text-mute">Not authorized.</p>
					) : (
						<>
							<p className="mt-4 text-sm leading-relaxed text-mute">
								Full reversals of confirmed sandbox collections only. An accepted request is not a completed
								refund. Unknown results need manual review — do not resubmit. A sandbox reversal cannot refund a
								production debit. Sandbox Express uses till 174379; reversals debit the organisation shortcode
								from Daraja Reversal test credentials, not that till.
							</p>
							<ul className="mt-8 space-y-3">
								{(list?.page ?? []).map((row) => (
									<li key={row.attemptId}>
										<button
											type="button"
											className={`w-full rounded-2xl border-2 px-4 py-3 text-left ${
												selected === row.attemptId ? 'border-accent bg-sun/60' : 'border-line bg-card'
											}`}
											onClick={() => {
												setSelected(row.attemptId);
												setReversalId(null);
												setError('');
											}}
										>
											<p className="font-extrabold">
												{formatGoal(row.amount)} · {row.receipt}
											</p>
											<p className="mt-1 text-xs text-mute">
												{row.fundTitle} · {row.environment} · {row.maskedPhone}
												{row.reversed ? ' · reversed' : ''}
												{row.reversalStatus ? ` · ${row.reversalStatus}` : ''}
												{row.reviewRequired ? ' · needs review' : ''}
											</p>
										</button>
									</li>
								))}
							</ul>
							{selectedRow &&
							!selectedRow.reversed &&
							(!selectedRow.reversalStatus || selectedRow.reversalStatus === 'failed') ? (
								<form className="mt-8 rounded-3xl border border-line bg-card p-5" onSubmit={(event) => void submit(event)}>
									<p className="font-bold">Reverse {formatGoal(selectedRow.amount)}</p>
									<label className="mt-4 block">
										<span className="text-sm font-bold">Reason</span>
										<textarea
											className="mt-2 w-full rounded-2xl border-2 border-line bg-card px-4 py-3 font-bold outline-none focus:border-accent"
											rows={3}
											value={reason}
											onChange={(event) => setReason(event.currentTarget.value)}
											required
											minLength={2}
											maxLength={100}
										/>
									</label>
									<label className="mt-4 flex items-center gap-2 text-sm font-bold">
										<input
											type="checkbox"
											checked={confirm}
											onChange={(event) => setConfirm(event.currentTarget.checked)}
										/>
										I confirm this full reversal
									</label>
									{error ? (
										<p className="mt-3 text-sm font-bold text-error" role="alert">
											{error}
										</p>
									) : null}
									<button
										type="submit"
										disabled={pending}
										className="btn-press mt-5 bg-accent px-5 text-card hover:bg-accent-deep"
									>
										Submit reversal
									</button>
								</form>
							) : null}
							{reversal ? (
								<p className="mt-6 text-sm font-bold" role="status" aria-live="polite">
									Status: {reversal.status}
									{reversal.reviewRequired ? ' · needs review' : ''}
									{reversal.resultDesc ? ` · ${reversal.resultDesc}` : ''}
								</p>
							) : null}
						</>
					)}
				</main>
			</div>
		</AuthGate>
	);
}
