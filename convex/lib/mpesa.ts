import { parseIdempotencyKey } from './fundFields';

export const MPESA_MIN_AMOUNT = 1;
export const MPESA_MAX_AMOUNT = 250_000;
export const DONATE_PRESETS = [100, 500, 1_000, 2_000] as const;
export const STK_COOLDOWN_MS = 60_000;
export const PHONE_WINDOW_MS = 15 * 60_000;
export const PHONE_WINDOW_MAX = 5;
export const GUEST_WINDOW_MS = 15 * 60_000;
export const GUEST_WINDOW_MAX = 8;
export const TOKEN_REFRESH_SKEW_MS = 60_000;
export const REVERSAL_COOLDOWN_MS = 60_000;
export const REVERSAL_WINDOW_MS = 15 * 60_000;
export const REVERSAL_WINDOW_MAX = 5;

export const GUEST_SESSION_PATTERN = /^[a-f0-9]{32,64}$/;
export const STATUS_KEY_PATTERN = /^[a-f0-9]{32,64}$/;
export const CALLBACK_KEY_PATTERN = /^[a-f0-9]{32,64}$/;

export type MpesaEnvironment = 'sandbox';
export type AttemptStatus = 'pending' | 'accepted' | 'unknown' | 'succeeded' | 'cancelled' | 'failed';
export type ReversalStatus = 'pending' | 'accepted' | 'unknown' | 'succeeded' | 'failed';

export type MpesaConfig = {
	environment: MpesaEnvironment;
	consumerKey: string;
	consumerSecret: string;
	shortcode: string;
	passkey: string;
	transactionType: 'CustomerPayBillOnline';
	baseUrl: 'https://sandbox.safaricom.co.ke';
	siteUrl: string;
};

export type ReversalConfig = MpesaConfig & {
	initiator: string;
	securityCredential: string;
};

const DARAJA_INGRESS_IPS = [
	'196.201.214.200',
	'196.201.214.206',
	'196.201.213.114',
	'196.201.214.207',
	'196.201.214.208',
	'196.201.213.44',
	'196.201.212.127',
	'196.201.212.138',
	'196.201.212.129',
	'196.201.212.136',
	'196.201.212.74',
	'196.201.212.69'
] as const;

export const DARAJA_TRUSTED_INGRESS_IPS: readonly string[] = DARAJA_INGRESS_IPS;

export function parseMpesaConfig(env: Record<string, string | undefined> = process.env): MpesaConfig {
	const environment = env.MPESA_ENVIRONMENT?.trim();
	if (!environment) throw new Error('MPESA_ENVIRONMENT is not set.');
	if (environment === 'production') {
		throw new Error(
			'Production M-PESA is blocked until callback authenticity can be verified. See DOCS/mpesa-sandbox.md.'
		);
	}
	if (environment !== 'sandbox') {
		throw new Error('MPESA_ENVIRONMENT must be sandbox.');
	}

	const consumerKey = required(env, 'MPESA_CONSUMER_KEY');
	const consumerSecret = required(env, 'MPESA_CONSUMER_SECRET');
	const shortcode = required(env, 'MPESA_SHORTCODE');
	const passkey = required(env, 'MPESA_PASSKEY');
	const transactionType = required(env, 'MPESA_TRANSACTION_TYPE');
	if (transactionType !== 'CustomerPayBillOnline') {
		throw new Error('MPESA_TRANSACTION_TYPE must be CustomerPayBillOnline for this PayBill flow.');
	}
	if (!/^\d{5,7}$/.test(shortcode)) {
		throw new Error('MPESA_SHORTCODE is invalid.');
	}

	const siteUrl = (env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
	if (!/^https:\/\//i.test(siteUrl)) {
		throw new Error('CONVEX_SITE_URL must be an https URL for the M-PESA callback.');
	}

	return {
		environment,
		consumerKey,
		consumerSecret,
		shortcode,
		passkey,
		transactionType,
		baseUrl: 'https://sandbox.safaricom.co.ke',
		siteUrl
	};
}

/** STK prompts stay off until an operator sets this on the Convex deployment. */
export function stkCollectionEnabled(env: Record<string, string | undefined> = process.env): boolean {
	return env.MPESA_STK_ENABLED?.trim() === 'true';
}

export function parseReversalConfig(
	env: Record<string, string | undefined> = process.env
): ReversalConfig {
	const config = parseMpesaConfig(env);
	const initiator = env.MPESA_REVERSAL_INITIATOR?.trim();
	const securityCredential = env.MPESA_REVERSAL_SECURITY_CREDENTIAL?.trim();
	if (!initiator || !securityCredential) {
		throw new Error(
			'Reversals aren’t configured. Set MPESA_REVERSAL_INITIATOR and MPESA_REVERSAL_SECURITY_CREDENTIAL on this Convex deployment. Collection keys and the STK passkey cannot submit reversals. Enable the Daraja Reversal product and the Org Reversals Initiator API role, then store an environment-specific encrypted SecurityCredential. Ghunami does not generate that credential.'
		);
	}
	return { ...config, initiator, securityCredential };
}

export function mpesaConfigOrNull(env: Record<string, string | undefined> = process.env): MpesaConfig | null {
	try {
		return parseMpesaConfig(env);
	} catch {
		return null;
	}
}

export function parseDonateAmount(amount: number): number {
	if (!Number.isInteger(amount) || amount < MPESA_MIN_AMOUNT || amount > MPESA_MAX_AMOUNT) {
		throw new Error(`Enter a whole amount between Ksh ${MPESA_MIN_AMOUNT} and Ksh ${MPESA_MAX_AMOUNT.toLocaleString('en-KE')}.`);
	}
	return amount;
}

export function normalizeKenyanMsisdn(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) throw new Error('Enter an M-PESA phone number.');
	const digits = trimmed.replace(/[^\d]/g, '');
	let n = digits;
	if (n.startsWith('254') && n.length === 12) {
		// already international
	} else if (n.startsWith('0') && n.length === 10) {
		n = `254${n.slice(1)}`;
	} else if (n.length === 9 && (n.startsWith('7') || n.startsWith('1'))) {
		n = `254${n}`;
	} else {
		throw new Error('Enter a Kenyan M-PESA number.');
	}
	if (!/^254[17]\d{8}$/.test(n)) {
		throw new Error('Enter a Kenyan M-PESA number.');
	}
	return n;
}

export function parseGuestSessionId(id: string): string {
	if (!GUEST_SESSION_PATTERN.test(id)) throw new Error('Invalid request. Try again.');
	return id;
}

export function parseStatusKey(key: string): string {
	if (!STATUS_KEY_PATTERN.test(key)) throw new Error('Invalid request. Try again.');
	return key;
}

export function parseCallbackKey(key: string): string {
	if (!CALLBACK_KEY_PATTERN.test(key)) return '';
	return key;
}

export function parseDonateIdempotencyKey(key: string): string {
	return parseIdempotencyKey(key);
}

export function mpesaTimestamp(now: number): string {
	const kenya = new Date(now + 3 * 60 * 60 * 1000);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${kenya.getUTCFullYear()}${p(kenya.getUTCMonth() + 1)}${p(kenya.getUTCDate())}${p(kenya.getUTCHours())}${p(kenya.getUTCMinutes())}${p(kenya.getUTCSeconds())}`;
}

export function stkPassword(shortcode: string, passkey: string, timestamp: string): string {
	return btoa(`${shortcode}${passkey}${timestamp}`);
}

export function randomHex(bytes = 24): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function accountReference(fundID: string): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const rand = new Uint8Array(4);
	crypto.getRandomValues(rand);
	let suffix = '';
	for (const b of rand) suffix += alphabet[b! % alphabet.length];
	const ref = `G${fundID}${suffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
	return ref || 'GHUNAMI';
}

export function transactionDesc(): string {
	return 'Donation';
}

export function callbackUrl(siteUrl: string, callbackKey: string): string {
	return `${siteUrl.replace(/\/$/, '')}/mpesa/stk/${callbackKey}`;
}

export function reversalResultUrl(siteUrl: string, callbackKey: string): string {
	return `${siteUrl.replace(/\/$/, '')}/mpesa/reversal/result/${callbackKey}`;
}

export function reversalTimeoutUrl(siteUrl: string, timeoutKey: string): string {
	return `${siteUrl.replace(/\/$/, '')}/mpesa/reversal/timeout/${timeoutKey}`;
}

export function oauthBasic(consumerKey: string, consumerSecret: string): string {
	return btoa(`${consumerKey}:${consumerSecret}`);
}

export type StkPushBody = {
	BusinessShortCode: number;
	Password: string;
	Timestamp: string;
	TransactionType: 'CustomerPayBillOnline';
	Amount: number;
	PartyA: string;
	PartyB: string;
	PhoneNumber: string;
	CallBackURL: string;
	AccountReference: string;
	TransactionDesc: string;
};

export function buildStkPushBody(args: {
	config: MpesaConfig;
	amount: number;
	phone: string;
	callbackKey: string;
	fundID: string;
	now: number;
}): StkPushBody {
	const timestamp = mpesaTimestamp(args.now);
	const reference = accountReference(args.fundID);
	const desc = transactionDesc();
	if (reference.length > 12 || !/^[A-Za-z0-9]+$/.test(reference)) {
		throw new Error('Could not start this payment. Try again.');
	}
	if (desc.length > 13) throw new Error('Could not start this payment. Try again.');
	return {
		BusinessShortCode: Number(args.config.shortcode),
		Password: stkPassword(args.config.shortcode, args.config.passkey, timestamp),
		Timestamp: timestamp,
		TransactionType: args.config.transactionType,
		Amount: args.amount,
		PartyA: args.phone,
		PartyB: args.config.shortcode,
		PhoneNumber: args.phone,
		CallBackURL: callbackUrl(args.config.siteUrl, args.callbackKey),
		AccountReference: reference,
		TransactionDesc: desc
	};
}

export function parseResultCode(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
	return null;
}

export function metadataByName(items: unknown): Map<string, unknown> {
	return metadataPairs(items, 'Name');
}

export function metadataByKey(items: unknown): Map<string, unknown> {
	if (Array.isArray(items)) return metadataPairs(items, 'Key');
	if (items && typeof items === 'object') return metadataPairs([items], 'Key');
	return new Map();
}

function metadataPairs(items: unknown, label: 'Name' | 'Key'): Map<string, unknown> {
	const map = new Map<string, unknown>();
	if (!Array.isArray(items)) return map;
	for (const item of items) {
		if (!item || typeof item !== 'object' || !(label in item)) continue;
		const name = (item as Record<string, unknown>)[label];
		if (typeof name !== 'string') continue;
		map.set(name, (item as { Value?: unknown }).Value);
	}
	return map;
}

export function parseProviderResultCode(value: unknown): string | null {
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (typeof value === 'string' && value.trim()) return value.trim();
	return null;
}

export function isReversalSuccessCode(code: string): boolean {
	return code === '0';
}

export function isAlreadyReversedCode(code: string): boolean {
	return code === 'R000001';
}

export function parseReversalReason(reason: string): string {
	const trimmed = reason.trim();
	if (trimmed.length < 2 || trimmed.length > 100) {
		throw new Error('Enter a reason between 2 and 100 characters.');
	}
	return trimmed;
}

export function maskMsisdn(phone: string): string {
	if (phone.length < 9) return '***';
	return `${phone.slice(0, 5)}***${phone.slice(-3)}`;
}

export function metadataAmount(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

export function metadataPhone(value: unknown): string | null {
	if (typeof value === 'number' && Number.isFinite(value)) return normalizeLoose(String(value));
	if (typeof value === 'string') return normalizeLoose(value);
	return null;
}

function normalizeLoose(value: string): string | null {
	try {
		return normalizeKenyanMsisdn(value);
	} catch {
		const digits = value.replace(/[^\d]/g, '');
		return digits || null;
	}
}

export function amountsMatch(expected: number, actual: number): boolean {
	return Math.abs(expected - actual) < 0.001;
}

export function callbackKeyFromPath(pathname: string): string {
	const match = pathname.match(/\/mpesa\/stk\/([a-f0-9]{32,64})\/?$/);
	return match?.[1] && CALLBACK_KEY_PATTERN.test(match[1]) ? match[1] : '';
}

export function reversalKeyFromPath(pathname: string, kind: 'result' | 'timeout'): string {
	const match = pathname.match(new RegExp(`/mpesa/reversal/${kind}/([a-f0-9]{32,64})/?$`));
	return match?.[1] && CALLBACK_KEY_PATTERN.test(match[1]) ? match[1] : '';
}

export function parseStkCallback(body: unknown): {
	merchantRequestId: string;
	checkoutRequestId: string;
	resultCode: number;
	resultDesc?: string;
	amount?: number;
	phone?: string;
	receipt?: string;
} | null {
	if (!body || typeof body !== 'object' || !('Body' in body)) return null;
	const root = (body as { Body?: unknown }).Body;
	if (!root || typeof root !== 'object' || !('stkCallback' in root)) return null;
	const cb = (root as { stkCallback?: unknown }).stkCallback;
	if (!cb || typeof cb !== 'object') return null;
	const rec = cb as {
		MerchantRequestID?: unknown;
		CheckoutRequestID?: unknown;
		ResultCode?: unknown;
		ResultDesc?: unknown;
		CallbackMetadata?: { Item?: unknown };
	};
	if (typeof rec.MerchantRequestID !== 'string' || typeof rec.CheckoutRequestID !== 'string') return null;
	const resultCode = parseResultCode(rec.ResultCode);
	if (resultCode === null) return null;
	const resultDesc = typeof rec.ResultDesc === 'string' ? rec.ResultDesc : undefined;
	const meta = metadataByName(rec.CallbackMetadata?.Item);
	const amount = metadataAmount(meta.get('Amount')) ?? undefined;
	const phone = metadataPhone(meta.get('PhoneNumber')) ?? undefined;
	const receipt = typeof meta.get('MpesaReceiptNumber') === 'string' ? (meta.get('MpesaReceiptNumber') as string) : undefined;
	return {
		merchantRequestId: rec.MerchantRequestID,
		checkoutRequestId: rec.CheckoutRequestID,
		resultCode,
		resultDesc,
		amount,
		phone,
		receipt
	};
}

export type ReversalPushBody = {
	Initiator: string;
	SecurityCredential: string;
	CommandID: 'TransactionReversal';
	TransactionID: string;
	Amount: number;
	ReceiverParty: string;
	RecieverIdentifierType: '11';
	ResultURL: string;
	QueueTimeOutURL: string;
	Remarks: string;
};

export function buildReversalBody(args: {
	config: ReversalConfig;
	receipt: string;
	amount: number;
	shortcode: string;
	callbackKey: string;
	timeoutKey: string;
	remarks: string;
}): ReversalPushBody {
	const remarks = parseReversalReason(args.remarks);
	return {
		Initiator: args.config.initiator,
		SecurityCredential: args.config.securityCredential,
		CommandID: 'TransactionReversal',
		TransactionID: args.receipt,
		Amount: args.amount,
		ReceiverParty: args.shortcode,
		RecieverIdentifierType: '11',
		ResultURL: reversalResultUrl(args.config.siteUrl, args.callbackKey),
		QueueTimeOutURL: reversalTimeoutUrl(args.config.siteUrl, args.timeoutKey),
		Remarks: remarks
	};
}

export function parseReversalResult(body: unknown): {
	originatorConversationId: string;
	conversationId: string;
	resultCode: string;
	resultDesc?: string;
	reversalReceipt?: string;
	originalTransactionId?: string;
	amount?: number;
} | null {
	if (!body || typeof body !== 'object' || !('Result' in body)) return null;
	const result = (body as { Result?: unknown }).Result;
	if (!result || typeof result !== 'object') return null;
	const rec = result as {
		OriginatorConversationID?: unknown;
		ConversationID?: unknown;
		ResultCode?: unknown;
		ResultDesc?: unknown;
		TransactionID?: unknown;
		ResultParameters?: { ResultParameter?: unknown };
	};
	if (typeof rec.OriginatorConversationID !== 'string' || typeof rec.ConversationID !== 'string') {
		return null;
	}
	const resultCode = parseProviderResultCode(rec.ResultCode);
	if (resultCode === null) return null;
	const meta = metadataByKey(rec.ResultParameters?.ResultParameter);
	const original = meta.get('OriginalTransactionID');
	const amount = metadataAmount(meta.get('Amount')) ?? undefined;
	return {
		originatorConversationId: rec.OriginatorConversationID,
		conversationId: rec.ConversationID,
		resultCode,
		resultDesc: typeof rec.ResultDesc === 'string' ? rec.ResultDesc : undefined,
		reversalReceipt: typeof rec.TransactionID === 'string' ? rec.TransactionID : undefined,
		originalTransactionId: typeof original === 'string' ? original : undefined,
		amount
	};
}

export async function requestOAuthToken(
	config: MpesaConfig
): Promise<{ accessToken: string; expiresAt: number }> {
	const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
		headers: { Authorization: `Basic ${oauthBasic(config.consumerKey, config.consumerSecret)}` },
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok) throw new Error('Couldn’t authenticate with M-PESA. Try again.');
	const payload: unknown = await response.json().catch(() => null);
	const accessToken =
		payload && typeof payload === 'object' && typeof (payload as { access_token?: unknown }).access_token === 'string'
			? (payload as { access_token: string }).access_token
			: '';
	const expiresIn = parseResultCode(
		payload && typeof payload === 'object' ? (payload as { expires_in?: unknown }).expires_in : null
	);
	if (!accessToken) throw new Error('Couldn’t authenticate with M-PESA. Try again.');
	const ttl = (expiresIn && expiresIn > 0 ? expiresIn : 3599) * 1000;
	return { accessToken, expiresAt: Date.now() + ttl };
}

function required(env: Record<string, string | undefined>, name: string): string {
	const value = env[name]?.trim();
	if (!value) throw new Error(`${name} is not set.`);
	return value;
}

export type DonateUiStatus = AttemptStatus | 'form';

export function donateStatusCopy(status: DonateUiStatus): { title: string; body: string } {
	switch (status) {
		case 'form':
			return { title: 'Donate', body: '' };
		case 'pending':
		case 'accepted':
			return {
				title: 'Confirm on your phone',
				body: 'Enter your M-PESA PIN on your phone to confirm. We never ask for your PIN here.'
			};
		case 'unknown':
			return {
				title: 'Still confirming',
				body: 'The prompt may still be on your phone. We have not marked this as failed. Check M-PESA, then watch this page.'
			};
		case 'succeeded':
			return { title: 'Thank you', body: 'Your payment was recorded.' };
		case 'cancelled':
			return { title: 'Payment cancelled', body: 'The prompt was cancelled. You can try again.' };
		case 'failed':
			return { title: 'Payment didn’t go through', body: 'Nothing was collected. You can try again.' };
	}
}
