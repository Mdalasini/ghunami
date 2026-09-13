# User-field cleanup (audit 1–4, 11)

This is the **transitional deployment**, not the final strict schema. `role`,
`pictureUrl`, `createdAt`, and `updatedAt` remain optional validators so existing
rows pass schema validation. New writes omit them. The unused `by_email` index
is removed immediately; no document migration is needed for an index.

## Deployment order

1. Export/back up the target deployment before cleanup, especially if historical
   admin roles or timestamps need retaining outside this application.
2. Deploy this backend and the updated client. The backend accepts old documents
   but no longer writes the deprecated fields. Do not deploy the old writers
   again during cleanup. Already-open old clients can attempt the removed
   `storeUser` mutation until reloaded; coordinate rollout/reload accordingly.
3. Run the internal migration on the intended deployment, starting with:

   ```sh
   npx convex run migrations:removeLegacyUserFields '{"cursor":null}'
   ```

   For production, add `--prod` explicitly. Repeat with the returned `cursor`
   until `isDone` is `true`. Each call handles at most 100 users transactionally;
   retain the last successful cursor to resume after interruption. Restarting
   from null is safe and idempotent. No scheduler or public mutation is exposed.
4. Verify completion on every deployment that will receive the strict schema.
   The migration preserves `_id`, `_creationTime`, identity, name, and email.
   `_creationTime` replaces the redundant application `createdAt`; historical
   values are not copied and may differ slightly from native creation time.
5. Only then, in a follow-up deployment, remove the four optional validators
   from `schema.ts`, remove `migrations.ts` and its migration tests, and regenerate
   the Convex API. Keep schema validation enabled: it guards against any missed
   legacy documents. Do not remove validators in the initial deployment.

## Session compatibility

`verifyCode` and `exchangeCode` persist the verified user before returning a
session. Refresh remains read-only with respect to users. Existing sessions
with a user row continue working. A session from before login-time persistence
that has **no row** now gets `null` from `users.me`; require those users to sign
out and sign in again (or invalidate old sessions as part of rollout). There is
no verified-email backfill from access-token claims. Check whether such sessions
exist before rollout if uninterrupted support is required.

## Dependencies

The unused `convex-helpers` dependency and its lockfile entry have been removed.
No replacement dependency is needed.
