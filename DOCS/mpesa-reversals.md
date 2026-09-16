# Sandbox reversals and collection pause

Operator-initiated **full** reversals of confirmed sandbox C2B collections. Ghunami does not auto-reverse donations, does not do partial refunds, and does not pay organisers from this flow.

A sandbox reversal **cannot** be assumed to refund a real production debit. Do not point this deployment at production. If an unexpected debit landed on an account Ghunami does not control, contact Safaricom / the merchant — this app cannot reverse it.

This work did **not** return any money. Automated tests mock Daraja and must never send a payment or reversal.

## Collection kill switch

STK prompts stay **off** unless `MPESA_STK_ENABLED=true` on the Convex deployment. Callbacks, status queries, and reversal processing keep running.

| Name | Purpose |
| --- | --- |
| `MPESA_STK_ENABLED` | Must be exactly `true` to send new STK prompts. Unset or any other value pauses collection. |

The public Donate button shows **Donation prompts are paused.** when M-PESA is configured but this flag is off. A sandbox badge is not a guarantee that no debit occurred.

## Reversal configuration

Set on the Convex deployment (`npx convex env set …`). Never `VITE_*`.

| Name | Purpose |
| --- | --- |
| `MPESA_REVERSAL_INITIATOR` | API operator username (Org portal, access channel API) |
| `MPESA_REVERSAL_SECURITY_CREDENTIAL` | SecurityCredential generated on the Daraja site for **this** environment (not the initiator password or STK passkey) |
| `MPESA_REVERSAL_SHORTCODE` | Organisation shortcode for `ReceiverParty` (Daraja Reversal test credentials, usually `600xxx`). Not Lipa Na M-Pesa `174379`. |
| `GHUNAMI_OPERATOR_TOKEN_IDENTIFIERS` | Comma-separated Convex `tokenIdentifier` values (`issuer\|subject`). Empty deny-by-default |

Collection `MPESA_CONSUMER_KEY` / `SECRET` are reused only for OAuth. They do **not** grant reversal permission. Enable the **Reversal** product on the Daraja app and assign the **Org Reversals Initiator** API role.

### SecurityCredential (do not invent this in app code)

Generate it on the [Daraja developer portal](https://developer.safaricom.co.ke) for the same app and environment (sandbox vs production). You do **not** need to download the M-PESA public certificate or run OpenSSL locally.

1. Open the **Reversal** API, then **Test Credentials**.
2. Generate the Security Credential there (same initiator password the portal shows for that environment).
3. Copy that generated string into `MPESA_REVERSAL_SECURITY_CREDENTIAL`. It is a long value, not the plaintext initiator password and not the STK passkey.

`DOCS/getting-started.md` still describes certificate encryption; ignore that for Ghunami setup. Ghunami does not generate, rotate, or log this value. Missing initiator/credential disables submission with an operator error.

## Operator workflow

1. Put your WorkOS identity’s `tokenIdentifier` on `GHUNAMI_OPERATOR_TOKEN_IDENTIFIERS`. Fund ownership, guest status tokens, and hidden UI do not grant refunds.
2. Open `/ops/reversals` while signed in.
3. Select a **confirmed** payment (M-PESA receipt, stored merchant shortcode, same sandbox environment).
4. Enter a 2–100 character reason, tick confirmation, submit.
5. Watch reactive status: `accepted` means Daraja took the request; **refunded only after ResultCode 0** on the result callback. `unknown` (timeout, missing IDs, R000001, metadata mismatch) blocks another automatic request — reconcile on the portal.

Legacy donations without `merchantShortcode` need manual review. Ghunami will not fill that from current env.

## Eligibility

- Confirmed STK success with a stored original receipt (`TransactionID`), not `CheckoutRequestID`
- Full amount only
- Same environment and receiving shortcode as the original attempt
- Reversal `ReceiverParty` is `MPESA_REVERSAL_SHORTCODE` (org), not the Express till
- Not already reversed; no open non-failed reversal

## Callbacks and unknown results

ResultURL / QueueTimeOutURL are `{CONVEX_SITE_URL}/mpesa/reversal/result|{timeout}/{capability}`.

An unguessable URL or matching conversation IDs is **not** proof of Daraja origin. Production stays blocked until trusted ingress or signed callbacks exist (`DOCS/mpesa-sandbox.md`). Documented Daraja IPs should be enforced on ingress we control, not `X-Forwarded-For`.

- ResultCode `0` / `"0"`: success. `Result.TransactionID` is the **reversal** receipt.
- `R000001`: already reversed at M-PESA. Local state stays unknown + review. Do not debit from this code; do not send another reversal.
- `R000002` and other failures: failed; operator may retry after the reservation clears.
- Queue timeout or missing callback: **unknown**, not refunded and not definitely failed.

## Accounting

`donationAttempts.credited` and the original receipt stay as gross payment history. `funds.sandboxRaised` / `sandboxDonationCount` (and live equivalents) are **net** after a verified reversal. Public lists and progress omit reversed rows. Late STK success cannot re-credit a reversed payment. Duplicate reversal callbacks debit once.

## Reported sandbox debit

Treat an apparent live transfer during sandbox testing as an **unverified financial incident**, not proof that sandbox always moves real money. Investigate with Daraja logs, the receiving PayBill, and Safaricom. Do not use this sandbox reversal API against production receipts.

## Tests

`npm test` mocks every provider call. Do not run the Daraja simulator from CI.
