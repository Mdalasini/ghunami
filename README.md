# ghunami

Local React Router app with Convex and WorkOS. You do not need Convex, WorkOS, or any hosted backend to run the automated tests.

## Prerequisites

- Node.js >= 22.22.0
- npm

## Commands

```bash
npm install
npm run typecheck
npm test              # Vitest, non-watch
npm run test:watch    # Vitest watch
npm run build         # production build (dummy Convex URL required if unset)
npm run test:e2e      # Playwright Chromium against the SSR server
npm run dev           # app (needs real .env.local for Convex/WorkOS)
npm run convex:dev    # Convex backend (not used by tests)
```

Dummy values used by CI and Playwright:

```bash
GHUNAMI_ISOLATED_TEST=1
VITE_CONVEX_URL=http://127.0.0.1:65531
SESSION_SECRET=ghunami-test-only-session-key-do-not-use!
```

`65531` is an unused loopback port. A placeholder URL is not a mock by itself; tests mock or block the backend.

## What each layer covers

| Layer | Command | Checks | Mocks / isolation |
| --- | --- | --- | --- |
| Unit | `npm test` (node project) | Draft store, `safeReturnTo`, encrypted session cookies | No `.env.local`. `process.loadEnvFile` is stubbed. Session tests use a labeled test-only key. |
| Convex functions | `npm test` (convex / authFlow projects) | `users.me`, `upsertFromWorkOS`, legacy user-field migration; `authFlow` send/verify/Google/refresh | `convex-test` in-memory database. **Does not** validate a deployed Convex or WorkOS integration. `authFlow` tests mock `@workos-inc/node` and use labeled test-only env vars; they never construct a network WorkOS client. |
| Server routes | `npm test` (node project) | Sign-in, token refresh, sign-out, Google/callback | `convexServer()` and `loadServerEnv()` mocked. Real cookie sealing is used in a subset of tests. JWT payloads are local expiry fixtures, not signature proofs. |
| Browser | `npm run test:e2e` | Signed-out home, local create-draft flow, client-side sign-in validation | Production build + `npm run start`. Does not reuse an existing server. Browser requests off the app origin (including WebSockets) are blocked. `/auth/token` returns a signed-out fixture. Node SSR is not intercepted by page routes; those journeys avoid loaders that call Convex. |

`/create` is not auth-gated in the current app.

## Isolation caveats

- Tests must not read developer `.env.local`. Vitest sets `envDir: false` and `GHUNAMI_ISOLATED_TEST=1`. The app skips `loadEnvFile` and Vite env files when that flag is set. Do not delete or rewrite `.env.local`.
- Builds still need a syntactically valid `VITE_CONVEX_URL` because the client module checks it at import time.
- Real WorkOS login, email codes, OAuth, and hosted Convex remain outside this suite.
- The in-memory draft does not survive a reload. Review does not publish a campaign.

## Adding an isolated fixture or scenario

1. Prefer Vitest for helpers and Convex functions (`tests/unit`, `tests/routes`, `tests/convex`).
2. Keep Playwright specs in `tests/e2e` (`*.spec.ts` so Vitest ignores them).
3. Never point tests at a live Convex URL or WorkOS key. Use the dummy loopback URL, mock `@workos-inc/node` / `convexServer()`, and `convex-test` identities.
4. Tiny static files go in `tests/e2e/fixtures/`. Large binary inputs can be built in-memory in the spec.
5. Restore env, clocks, mocks, and draft module state in `afterEach`.

## User schema cleanup

See [convex/MIGRATIONS.md](convex/MIGRATIONS.md) for the staged legacy-field migration and old-session compatibility notes before deploying the audit refactor.

## GitHub Actions

`.github/workflows/ci.yml` runs typecheck, Vitest, build, and Playwright on push and pull request. It needs no repository secrets. After this workflow has run on the branch, the repo owner can require the resulting check name in GitHub branch protection or rulesets. The YAML file alone does not block merges.
