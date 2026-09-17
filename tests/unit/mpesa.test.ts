import { describe, expect, it } from 'vitest';
import {
	accountReference,
	buildStkPushBody,
	callbackKeyFromPath,
	donateStatusCopy,
	mpesaTimestamp,
	normalizeKenyanMsisdn,
	parseDonateAmount,
	parseDonateDisplayName,
	parseMpesaConfig,
	parseStkCallback,
	stkPassword,
	transactionDesc
} from '../../convex/lib/mpesa';
import { donateAmountError, parseCustomDonateText, selectedDonateAmount } from '../../src/lib/donate';

const env = {
	MPESA_ENVIRONMENT: 'sandbox',
	MPESA_CONSUMER_KEY: 'key',
	MPESA_CONSUMER_SECRET: 'secret',
	MPESA_SHORTCODE: '174379',
	MPESA_PASSKEY: 'passkey',
	MPESA_TRANSACTION_TYPE: 'CustomerPayBillOnline',
	MPESA_STK_ENABLED: 'true',
	CONVEX_SITE_URL: 'https://test.convex.site'
};

describe('M-PESA validation', () => {
	it('accepts whole shillings in documented bounds', () => {
		expect(parseDonateAmount(1)).toBe(1);
		expect(parseDonateAmount(250_000)).toBe(250_000);
		expect(() => parseDonateAmount(0)).toThrow(/whole amount/i);
		expect(() => parseDonateAmount(10.5)).toThrow(/whole amount/i);
		expect(() => parseDonateAmount(250_001)).toThrow(/whole amount/i);
	});

	it('trims a public display name and treats blank as anonymous', () => {
		expect(parseDonateDisplayName(undefined)).toBeUndefined();
		expect(parseDonateDisplayName('   ')).toBeUndefined();
		expect(parseDonateDisplayName('  Ada  Lovelace  ')).toBe('Ada Lovelace');
		expect(() => parseDonateDisplayName('a'.repeat(101))).toThrow(/too long/i);
		expect(() => parseDonateDisplayName('Ada\u0000Lovelace')).toThrow(/special characters/i);
	});

	it('normalizes Kenyan local and international numbers', () => {
		expect(normalizeKenyanMsisdn('0712345678')).toBe('254712345678');
		expect(normalizeKenyanMsisdn('+254 712 345 678')).toBe('254712345678');
		expect(normalizeKenyanMsisdn('712345678')).toBe('254712345678');
		expect(normalizeKenyanMsisdn('0112345678')).toBe('254112345678');
		expect(() => normalizeKenyanMsisdn('0202222222')).toThrow(/Kenyan M-PESA/i);
		expect(() => normalizeKenyanMsisdn('')).toThrow(/phone/i);
	});

	it('builds a sandbox STK payload with PayBill PartyB and a fresh password', () => {
		const config = parseMpesaConfig(env);
		const now = Date.UTC(2021, 5, 28, 6, 24, 8);
		const body = buildStkPushBody({
			config,
			amount: 100,
			phone: '254712345678',
			callbackKey: 'aa'.repeat(16),
			fundID: 'Ab3',
			now
		});
		expect(body.BusinessShortCode).toBe(174379);
		expect(body.PartyB).toBe('174379');
		expect(body.PartyA).toBe('254712345678');
		expect(body.PhoneNumber).toBe('254712345678');
		expect(body.Timestamp).toBe(mpesaTimestamp(now));
		expect(body.Password).toBe(stkPassword('174379', 'passkey', body.Timestamp));
		expect(body.CallBackURL).toBe(`https://test.convex.site/mpesa/stk/${'aa'.repeat(16)}`);
		expect(body.AccountReference.length).toBeLessThanOrEqual(12);
		expect(body.AccountReference).toMatch(/^[A-Za-z0-9]+$/);
		expect(body.TransactionDesc).toBe(transactionDesc());
		expect(body.TransactionDesc.length).toBeLessThanOrEqual(13);
		expect(accountReference('Ab3')).toMatch(/^GAb3[A-Z0-9]+$/);
	});

	it('fails clearly on missing, buy-goods, or production configuration', () => {
		expect(() => parseMpesaConfig({})).toThrow(/MPESA_ENVIRONMENT is not set/);
		expect(() => parseMpesaConfig({ ...env, MPESA_ENVIRONMENT: 'production' })).toThrow(/blocked/);
		expect(() => parseMpesaConfig({ ...env, MPESA_TRANSACTION_TYPE: 'CustomerBuyGoodsOnline' })).toThrow(
			/CustomerPayBillOnline/
		);
		expect(() => parseMpesaConfig({ ...env, CONVEX_SITE_URL: 'http://localhost:3210' })).toThrow(/https/);
		expect(() => parseMpesaConfig({ ...env, MPESA_STK_ENABLED: undefined })).toThrow(/paused/);
		expect(() => parseMpesaConfig({ ...env, MPESA_STK_ENABLED: 'false' })).toThrow(/paused/);
	});

	it('parses success and cancellation callbacks, including missing failure metadata', () => {
		expect(parseStkCallback({ no: true })).toBeNull();
		const cancelled = parseStkCallback({
			Body: {
				stkCallback: {
					MerchantRequestID: 'm1',
					CheckoutRequestID: 'c1',
					ResultCode: 1032,
					ResultDesc: 'Request cancelled by user'
				}
			}
		});
		expect(cancelled).toMatchObject({ resultCode: 1032, merchantRequestId: 'm1' });
		expect(cancelled?.amount).toBeUndefined();
		const ok = parseStkCallback({
			Body: {
				stkCallback: {
					MerchantRequestID: 'm2',
					CheckoutRequestID: 'c2',
					ResultCode: '0',
					CallbackMetadata: {
						Item: [
							{ Name: 'Amount', Value: 100.0 },
							{ Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
							{ Name: 'PhoneNumber', Value: 254712345678 }
						]
					}
				}
			}
		});
		expect(ok).toMatchObject({ resultCode: 0, amount: 100, phone: '254712345678', receipt: 'NLJ7RT61SV' });
		expect(callbackKeyFromPath(`/mpesa/stk/${'ab'.repeat(16)}`)).toBe('ab'.repeat(16));
		expect(callbackKeyFromPath('/mpesa/stk/nope')).toBe('');
	});
});

describe('donate UI helpers', () => {
	it('selects preset and custom amounts', () => {
		expect(selectedDonateAmount(500, null)).toBe(500);
		expect(selectedDonateAmount('custom', 1_000)).toBe(1_000);
		expect(parseCustomDonateText('1,000').amount).toBe(1_000);
		expect(donateAmountError(null)).toMatch(/amount/i);
		expect(donateAmountError(500)).toBeNull();
		expect(donateAmountError(0.5)).toMatch(/whole amount/i);
	});

	it('maps reactive payment statuses to copy', () => {
		expect(donateStatusCopy('accepted').title).toMatch(/phone/i);
		expect(donateStatusCopy('unknown').title).toMatch(/Still confirming/i);
		expect(donateStatusCopy('succeeded').title).toMatch(/Thank you/i);
		expect(donateStatusCopy('cancelled').title).toMatch(/cancelled/i);
		expect(donateStatusCopy('failed').body).toMatch(/try again/i);
	});
});
