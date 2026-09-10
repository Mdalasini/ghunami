# Automated testing implementation plan

## Handoff to Cursor

Implement this plan on `test/automated-testing`. The branch already exists. Add the testing infrastructure and tests; do not deploy, provision services, commit, or push unless asked. Start by reading the current source and checking Git status. Preserve unrelated user changes.

## Goal and scope

Give this currently undeployed app repeatable local tests and GitHub Actions checks, without requiring Convex dashboard changes, WorkOS test accounts, deployment keys, or GitHub secrets. This is not a staging-environment project.

Current stack: React 19, React Router 8 framework mode with SSR, Vite 8, TypeScript, Convex, and Convex-managed WorkOS. `package.json` requires Node >=22.22.0. Existing commands are `dev`, `convex:dev`, `build`, `start`, `preview`, and `typecheck`; no test framework is configured.

Source is the authority. `PRODUCT.md` contains stale stack and flow descriptions; do not use it to infer current behavior or expand this task into documentation cleanup.

## Nonnegotiable isolation rules

- No test may contact real Convex or WorkOS, send email, perform OAuth, or modify a hosted database.
- Use `convex-test` for in-process Convex database/function tests. This does not validate an actual deployed Convex/WorkOS integration; document that limitation.
- Mock `convexServer()` at the module boundary in server route tests. Mock WorkOS if testing `convex/authFlow.ts`; do not instantiate a real network client.
- Do not run `convex dev`, `convex deploy`, or service provisioning in CI.
- Do not add authentication bypasses, test-only production routes, or seed/reset endpoints to the app.
- Do not read developer `.env.local` in unit/route tests. Mock `loadServerEnv()` where applicable and set/restore test env explicitly.
- Use a clearly labeled, nonsecret, test-only session key of at least 32 characters. Never reuse or commit real credentials.
- Builds/browser tests may require `VITE_CONVEX_URL` because the client modules validate it at import time. Supply a syntactically valid test-only loopback URL with a deliberately unused port, and ensure tests do not depend on a responding Convex service. A placeholder URL alone is not a mock.
- Vite loads `.env.local`, and the app also calls `process.loadEnvFile('.env.local')`. Explicitly verify the test runner/server cannot pick up real service settings. Do not delete or rewrite the user's env file. If isolation needs a code adjustment, keep it minimal and preserve normal runtime behavior; otherwise defer browser coverage rather than introduce a broad test mode.

## Phase 1: Test runner and focused unit coverage

Add compatible stable dev dependencies, checking their peer requirements against Vite 8 and Node 22.22.0. Use Vitest and `convex-test`; add the edge-runtime environment required by the selected `convex-test` version. Use a DOM environment and React Testing Library only where actual component tests require them.

Keep the Vitest configuration separate from the React Router Vite plugin unless verified necessary. Use the installed Vitest version's supported configuration for distinct Node, DOM (if used), and Convex edge-runtime tests. Do not blindly copy obsolete workspace examples. Limit discovery to project test files; exclude generated code, build output, node_modules, and Playwright specs. Ensure test/config TypeScript is checked, without polluting the Convex deployment source with Node-only helpers.

Suggested commands:

- `npm test`: deterministic, nonwatch Vitest run.
- `npm run test:watch`: interactive local Vitest watch.
- `npm run test:e2e`: Playwright run, added in Phase 4.

Keep existing app commands intact. Update the npm lockfile. Avoid unrelated upgrades.

### `src/lib/draft.ts`

Test initial state, partial updates preserving untouched fields, subscriptions/unsubscription, and reset behavior. Stub object URL creation/revocation; verify replacing/removing a cover revokes the previous URL and updates the filename. Isolate module-level draft state/listeners between tests. Check KES formatting using representative values without brittle assumptions about Unicode currency spacing.

### `src/lib/returnTo.ts`

Test null/undefined, empty values, relative paths, absolute external URLs, protocol-relative URLs, and valid same-origin paths with query/hash. Include adversarial backslash/control-character URL cases and evaluate their destination using URL parsing rather than asserting unsafe behavior is correct.

If a security regression test exposes a real redirect escape, keep the test and make only the minimal fix needed to enforce the helper's documented same-origin contract. Explain any behavior change. Do not silently weaken the test.

### `src/lib/session.server.ts`

Use a test-only secret and restore environment variables after each test. Cover cookie/read round trips, missing/unrelated cookies, tampered/truncated/invalid cookies, key rotation, missing/short secret when creating a cookie, cookie clearing, and HttpOnly/Path/SameSite/Max-Age/Secure attributes. Verify Secure is production-only. Do not assert exact ciphertext, since encryption intentionally uses a random IV. Avoid claiming server-enforced expiry exists: current max age is a cookie attribute.

## Phase 2: Convex function coverage without a deployment

Read `convex/schema.ts`, `convex/users.ts`, `convex/lib/auth.ts`, and `convex/lib/customFunctions.ts` before writing tests. Follow the installed `convex-test` documentation for loading generated references and function modules. Use a fresh in-memory harness for each test and simulated identities, not WorkOS tokens.

Cover:

- `users.me`: unauthenticated/missing user returns null; an existing identity gets its own public user fields, not another user's record.
- `users.storeUser`: unauthenticated rejection; new users default to role `user`; email normalization; repeated calls reuse the same record.
- Existing verified name/email survive missing identity claims, matching the comments in `storeUser`.
- Updating an existing admin does not accidentally demote them or create a second record.
- `internal.users.upsertFromWorkOS`: issuer/subject identity mapping, normalized email, full-name/email fallback, and updating instead of duplicating an existing identity.
- Distinct identities remain separate even if their email matches; identity lookup currently uses the token identifier.

Inspect role-check helpers and test any actual authorization behavior present. Do not invent admin UI or permissions. In-memory fixtures need no persisted seed data or dashboard setup.

## Phase 3: Server authentication route tests

Read the routes fully before choosing expectations: `src/routes/signin.tsx`, `auth.token.ts`, `auth.signout.ts`, `auth.google.ts`, and `callback.tsx`. Call exported loaders/actions with realistic Request objects. Use React Router's actual response/data shapes and a small typed argument helper if needed; avoid pervasive `any` casts.

Prioritize:

- Sign-in loader: signed-out data and signed-in safe redirect.
- Sign-in action: invalid email does not call backend; email normalization; send-code success/failure; verification success sets a session cookie and safe redirect; verification failure returns the error; unknown intent is rejected.
- Token loader: no session returns null without a backend call; fresh access token is reused; near-expiry/expired/malformed tokens trigger refresh; `force=1` refreshes; successful refresh updates the cookie; failed refresh clears it. Use a controlled clock, including the 60-second skew boundary.
- Token responses never expose the refresh token.
- Sign-out clears the cookie and follows current redirect behavior.
- OAuth/callback success and error branches can follow once the above pass, still with a mocked backend.

Mock environment loading and the Convex server module before importing route modules. Use real session serialization in a subset of route tests so cookie integration is covered. Synthetic JWT payloads are only fixtures for local expiry parsing, not evidence of signature verification.

Do not assume that `/create` is protected: inspect current code. Do not add protection or change product behavior just to match a planned test.

## Phase 4: Small isolated browser suite

Add Playwright with Chromium only initially. Use Playwright's managed `webServer` lifecycle, a fixed localhost port, bounded startup/test timeouts, and isolated browser contexts. Disable reusing an arbitrary existing server so tests cannot accidentally run against a real development backend. Prefer the production build and existing `npm run start` SSR server; do not assume `vite preview` correctly serves this framework app.

First verify the root provider and routes can run signed out without external services. Browser request interception does not intercept Node SSR requests. Keep this suite limited to routes/actions known not to call a backend, block unintended external browser requests (including WebSockets using the selected Playwright version's API), and return a signed-out `/auth/token` fixture where needed. Keep assertions proving the tested UI actually hydrated, not merely rendered SSR markup. Inspect browser errors rather than hiding them all.

Initial journeys:

1. Home page renders and navigates to the actual fundraiser-creation route.
2. Complete the current local draft flow: goal, cover image, title, story, review. Use a tiny committed image fixture. Assert submitted values appear in review.
3. Edit a previous answer and verify the updated review.
4. Check meaningful input validation supported by the current flow (e.g. invalid goal or oversized/unsupported cover). Inspect existing code for exact limits and accepted types.
5. Sign-in UI rejects invalid input without sending email, if it can be exercised with no backend call.

Use accessible locators and web-first assertions, not CSS implementation details or arbitrary sleeps. The draft is in memory, not persistent: do not expect it to survive reloads. Do not assert that review actually publishes a campaign.

Do not implement full authenticated browser testing in this iteration. If honest browser isolation requires substantial runtime changes, complete Phases 1–3 and CI first, explicitly record the browser blocker, and do not ship a fake passing suite. DOM component tests are an alternative for draft interactions, but label them accurately rather than calling them end-to-end tests.

## Phase 5: GitHub Actions and contributor instructions

Create `.github/workflows/ci.yml` after checking the directory structure. Run on pushes and pull requests, with read-only repository permissions, concurrency cancellation for superseded runs, and job timeouts. Pin a Node version satisfying >=22.22.0, use maintained checkout/setup-node actions and npm caching, and use `npm ci`.

Required checks:

1. `npm run typecheck`
2. `npm test`
3. `npm run build` with explicit dummy test config where required
4. If Phase 4 is implemented: install Chromium and its Linux dependencies with Playwright, then run `npm run test:e2e`.

Keep builds efficient: do not build twice unnecessarily if the Playwright server command includes a build. Upload browser failure reports/traces with bounded retention; use failure diagnostics rather than retrying every failure into a green result. CI must not require repository secrets, Convex credentials, or a deployed app. Package/browser downloads are expected; runtime calls to real app services are not.

Expand `README.md` with:

- Prerequisites and all local test commands.
- What each test layer checks and what it mocks.
- Explicit statement that no Convex setup is required for this suite.
- Instructions for adding an isolated fixture/scenario.
- Build/browser dummy configuration and isolation caveats.
- Real WorkOS login/email/OAuth and hosted Convex integration remain outside this suite.
- Optional later step: after this branch is pushed and CI runs, the owner can require the actual resulting check names via GitHub branch protection/rulesets. Do not claim workflow YAML alone blocks merges.

## Acceptance criteria and verification

- New tests run locally and from a clean checkout with no `.env.local`, service credentials, or provisioned test backend.
- Tests do not read/write the developer's hosted Convex data or send messages.
- Unit/route/backend tests are deterministic, independently runnable, and clean up clocks, globals, env, mocks, and state.
- Run typecheck, unit/backend/route tests, build, and implemented browser tests. Report exact commands and outcomes; do not claim a remote Actions run passed unless observed.
- Tests/configs themselves receive TypeScript checking; browser specs are not accidentally collected by Vitest.
- No real credentials, generated test reports, traces, or coverage output enter Git. Update `.gitignore` as needed.
- Prefer behavior assertions over broad snapshots. Do not pursue an arbitrary coverage percentage in this first iteration.
- If existing code has unrelated failures, report them separately. Only make narrow production fixes needed for clearly demonstrated regressions within this test scope.
- Final handoff: summarize files changed, coverage added, validation results, limitations/deferred browser work, and any genuine manual steps. Do not create a hosted environment as a workaround.
