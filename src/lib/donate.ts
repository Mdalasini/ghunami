import { DONATE_PRESETS, MPESA_MAX_AMOUNT, MPESA_MIN_AMOUNT, parseDonateAmount } from '../../convex/lib/mpesa';
import { parseGoalText } from './draft';

export { DONATE_PRESETS, donateStatusCopy } from '../../convex/lib/mpesa';

const SESSION_KEY = 'ghunami.donateSession';

export function guestDonateSession(): string {
	const existing = localStorage.getItem(SESSION_KEY);
	if (existing && /^[a-f0-9]{32,64}$/.test(existing)) return existing;
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	localStorage.setItem(SESSION_KEY, id);
	return id;
}

export function parseCustomDonateText(value: string): { amount: number | null; text: string } {
	const parsed = parseGoalText(value);
	if (parsed.goal === null) return { amount: null, text: parsed.text };
	try {
		return { amount: parseDonateAmount(parsed.goal), text: parsed.text };
	} catch {
		return { amount: parsed.goal, text: parsed.text };
	}
}

export function selectedDonateAmount(preset: number | 'custom', customAmount: number | null): number | null {
	if (preset === 'custom') return customAmount;
	return preset;
}

export function donateAmountError(amount: number | null): string | null {
	if (amount === null) return 'Choose an amount.';
	try {
		parseDonateAmount(amount);
		return null;
	} catch (error) {
		return error instanceof Error
			? error.message
			: `Enter a whole amount between Ksh ${MPESA_MIN_AMOUNT} and Ksh ${MPESA_MAX_AMOUNT.toLocaleString('en-KE')}.`;
	}
}

export const donatePresets = DONATE_PRESETS;
