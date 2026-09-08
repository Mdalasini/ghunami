# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People in Kenya using personal crowdfunding — any cause (personal need, community or group, a project they are making). The product serves both sides from the start: someone starting a fundraiser, and someone giving to one.

## Product Purpose

Ghunami lets Kenyans raise and give money for personal campaigns. Success is a fundraiser that people can actually fund the way they already send money, not a draft that never becomes a gift.

## Positioning

It just works in Kenya because giving rides M-Pesa. A card-first or Stripe-first neighbor cannot truthfully claim that.

## Operating Context

English. Kenyan shillings (KES). M-Pesa is the money rail. Raising and giving are both in scope now, not a later phase.

The shipped app is a web draft: landing page plus Goal → Photo → Story → Review. The draft lives in the browser only. Nothing publishes. Nobody gives. Amounts are still shown in USD. That is current code, not product truth.

## Capabilities and Constraints

- Name: **ghunami** (wordmark lowercase). Titles may use Ghunami.
- Horizon mark (rising semicircle over two receding bands) is a binding identity asset: `src/lib/assets/logo.svg`, `src/lib/assets/favicon.svg`.
- Stack in repo: SvelteKit, Tailwind, Convex (Convex is wired; no schema or live functions yet).
- Shipped create flow is a local draft. No persist, no publish, no M-Pesa, no donor path.
- Goal, cover photo (JPG/PNG/WebP, 8 MB), title (80), story (4000) exist only as client draft fields.
- Create-flow order is shipped behavior, not a locked product rule.
- Payments, payouts, published campaigns, and donor records are required by the job and are not built.

## Brand Commitments

Keep the name **ghunami** and the Horizon mark. No other brand rules were made binding.

## Evidence on Hand

Identity assets only (wordmark + Horizon). No real campaigns, donors, testimonials, press, or payment proofs. Placeholder copy in the UI is not evidence. Do not invent any of those.

## Product Principles

- Raise and give are both first-class; a draft that cannot receive M-Pesa is unfinished.
- Use Kenya’s existing money habit (M-Pesa, KES). Do not import a card-first model.
- Personal crowdfunding, not a single cause vertical.
- Preserve the name and Horizon mark; do not invent social proof or live payment claims.
