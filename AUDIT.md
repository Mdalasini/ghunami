# Ponytail audit

Scope: over-engineering only. Ranked by the biggest cut first. Nothing has been applied yet.

1. `yagni:` `storeUser` mutation + `EnsureUser` component. `upsertFromWorkOS` already writes the row on every login (`verifyCode`/`exchangeCode`), and `storeUser` refuses blank overwrites, so all it does now is bump `updatedAt`, which nothing reads. Delete both and their tests. Only keep them if sessions from before `upsertFromWorkOS` existed still need backfilling. [convex/users.ts:13, src/components/ConvexClientProvider.tsx:90]
2. `delete:` `authedQuery`/`authedMutation` have zero callers. Delete the file and the `convex-helpers` dependency. [convex/lib/customFunctions.ts]
3. `delete:` `requireAdmin` and `getCurrentUser` are only reached by tests and item 2. `role` is never read by the UI, and neither is `pictureUrl` (`AuthBar` uses only `name`/`email`). Drop them from `meReturn`/`me`, then drop `role` from the schema once existing docs are migrated. [convex/lib/auth.ts:4, convex/lib/auth.ts:36, convex/users.ts:5]
4. `shrink:` `verifyCode`, `exchangeCode` and `refresh` each map a WorkOS result to `session` by hand, and two of them also call `record()` with the same fields. Replace all of that with one `toSession(result)` helper plus one `record(ctx, clientId, result.user)`. [convex/authFlow.ts:111-124, 169-182, 202-208]
5. `shrink:` In `pickEncodedBlob`, the `qualities` parameter is always the default, both "empty" guards can't fire, and callers only use `blob`. Change it to `for (q of COVER_QUALITY_STEPS) { blob = await encode(type, q); if (blob.size <= MAX) break } return blob`. [src/lib/coverImage.ts:180]
6. `yagni:` `processCoverCrop` returns `cropPixels` and `quality`, but the only caller takes `file`. `drawCoverCrop`'s injectable `canvas` param is never passed, and neither is `preferredCoverMimeType`'s `supportsType` param. Return the `File`, and drop the params. [src/lib/coverImage.ts:205, 359, 395]
7. `yagni:` `CoverBitmapSource`, `defaultCoverBitmapSource` and `fileToBitmap` are a DI seam with one production implementation, and they only exist for tests. Call `createOrientedBitmap`/`heicToBitmap`/`detectHeicMagic` directly and test with `vi.mock('heic-to')`. [src/lib/coverImage.ts:237-295]
8. `native:` `canvasSupportsType` builds a throwaway canvas to probe for WebP. `toBlob` already reports what it actually encoded, so encode as `image/webp`, fall back to JPEG if `blob.type !== 'image/webp'`, and drop the probe. [src/lib/coverImage.ts:217]
9. `shrink:` The four copies of the black Horizon disc markup (`HydrateFallback`, `AuthShell`, `create` `Avatar`, `create` header) can become one `<HorizonDisc className>` in `Tip.tsx`. [src/root.tsx:50, src/components/AuthShell.tsx:44, src/routes/create.tsx:66, 656]
10. `shrink:` The `goalText` state mirrors `draft.goal` and is re-synced in four places. Derive it instead: `value={draft.goal?.toLocaleString('en-KE') ?? ''}`. [src/routes/create.tsx:213, 363-379, 411, 489]
11. `delete:` `by_email` has no query using it, `createdAt` duplicates Convex's native `_creationTime`, and `updatedAt` is written but never read. [convex/schema.ts:11-15]
12. `shrink:` `vitest.config.ts` has an `exclude` list, but every project has an explicit `include`, so it's redundant. Delete it. [vitest.config.ts:10-17]
13. `shrink:` `onTitleKeydown` duplicates `onEnter`. Use `onKeyDown={onEnter}`. [src/routes/create.tsx:511]
14. `yagni:` `publishReady` is a `useCallback` that only calls `onReadyChange`. Call the prop directly. [src/components/CoverPhotoField.tsx:153]
15. `shrink:` `closeThen`'s timeout body is `settleClose()` word for word, so make the timeout call `settleClose`. [src/components/CoverPhotoField.tsx:197-215]
16. `delete:` The `client` state and its mount effect are redundant: `cropSize` is only ever set inside an effect, so `cropSize` alone already means the component is on the client. [src/components/CoverPhotoField.tsx:80, 133, 436]
17. `shrink:` The `SESSION_SECRET` presence and length check is duplicated. Use one exported `sessionSecret()` in `session.server.ts`. [src/lib/session.server.ts:19, src/lib/oauthState.server.ts:7]
18. `shrink:` `Home.start` calls `preventDefault` and then `navigate('/create')`, which re-implements `<Link>`. Replace it with `onClick={resetDraft}`. [src/routes/home.tsx:14]
19. `delete:` The `className`/`style` passthrough on `Field` is never passed. The same goes for `CodeStep`'s `onClear` and `onResend`, which only fire together, so merge them into one `onResend`. [src/routes/signin.tsx:73, 175]

Kept on purpose: `isbot` (the default React Router `entry.server` needs it), `@edge-runtime/vm` (the Convex test environment), the `GHUNAMI_ISOLATED_TEST` guard (Playwright and CI rely on it), and the hand-rolled sanitizer and cookie sealing (security boundary, out of scope).

net: -250 lines, -1 deps possible.
