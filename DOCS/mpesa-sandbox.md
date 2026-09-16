# Sandbox M-PESA Express

Ghunami collects donations on a single PayBill. Organisers are paid later. This
document covers **sandbox collection only**. Raised totals are progress, not a
withdrawable balance.

## Environment variables

Set these on the Convex deployment (`npx convex env set …`). Never put them in
`VITE_*` variables or client code.

| Name | Purpose |
| --- | --- |
| `MPESA_ENVIRONMENT` | Must be `sandbox`. `production` is rejected. |
| `MPESA_CONSUMER_KEY` | Daraja app consumer key |
| `MPESA_CONSUMER_SECRET` | Daraja app consumer secret |
| `MPESA_SHORTCODE` | Sandbox PayBill shortcode (PartyB) |
| `MPESA_PASSKEY` | STK password passkey |
| `MPESA_TRANSACTION_TYPE` | Must be `CustomerPayBillOnline` |
| `MPESA_STK_ENABLED` | Must be `true` to send STK prompts. Unset pauses collection; callbacks still run |
| `CONVEX_SITE_URL` | Set automatically by Convex. HTTPS callback origin |

Amount bounds are the documented Express limits: whole KES `1`–`250000`.

## Callback

STK `CallBackURL` is:

`{CONVEX_SITE_URL}/mpesa/stk/{per-attempt-capability}`

The capability is unguessable and is **not** authentication of Daraja. The
handler still checks payload shape, amount, and phone. Matching merchant or
checkout IDs is not treated as proof the callback is genuine.

For local debugging, tunnel `CONVEX_SITE_URL` is already public. You do not
need ngrok in front of Convex HTTP actions.

## Sandbox testing

1. Confirm the env vars above on the **development** deployment.
2. Publish a fund.
3. Donate with a Daraja simulator number. Confirm the PIN on the phone simulator
   if your app uses one — Ghunami never collects a PIN.
4. The public page should show a **test** donation and sandbox raised total.

Sandbox STK still moves **real money**. Safaricom automatically reverses the debit after about an hour. Ghunami does not perform that reversal.

Automated tests mock Daraja and must not send real prompts.

See [mpesa-reversals.md](mpesa-reversals.md) for operator-initiated reversals before that window. Do not reverse production receipts from this deployment.

## Production blockers

Production operation is **explicitly blocked** (`MPESA_ENVIRONMENT=production`
throws). Remaining work before go-live:

1. **Callback authenticity.** Local Daraja docs list ingress IPs and do not
   document signed STK callbacks. Convex HTTP actions do not expose a
   trustworthy connecting IP. `X-Forwarded-For` and similar headers must not be
   used as source authentication. Until Safaricom provides verifiable callback
   signatures (or a private ingress we can pin without forwarded-IP headers),
   production must stay off.
2. **STK query / reconciliation.** Local docs do not specify the Express query
   contract. Official guidance could not be re-verified from the developer
   portal during this work. Do not invent a query API. Missing callbacks stay
   `unknown`, never auto-failed.
3. **Trusted ingress.** Documented Daraja IPs (see `DOCS/getting-started.md`)
   should be enforced at an ingress we control, not by parsing client-supplied
   forwarding headers.
4. **Payouts** to organisers are out of scope.

## Privacy

Public fund queries expose amount, time, and a test label only. Phone numbers,
credentials, raw callbacks, and provider IDs stay on the attempt document and
are omitted from `getStatus` / `fundSummary` / `listDonations`.
