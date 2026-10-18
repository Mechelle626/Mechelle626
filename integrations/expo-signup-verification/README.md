# Apply-ready Expo integration

This package contains the tested **Expo/Supabase port** of the signup and verification-flow improvements. It is intended for `danieog/braincraze`, not the Next.js app in this repository.

**Status: implemented and tested locally; NOT pushed or merged into `danieog/braincraze`.** GitHub rejected the push with `Permission to danieog/braincraze.git denied to Mechelle626` (HTTP 403). The repository owner must grant `Mechelle626` write access, or a maintainer with access can apply this patch.

- Target base: `04c7fc125e975c726741401135b3b13305cad623` on `danieog/braincraze` main.
- Prepared branch: `feat/expo-signup-verification-flow`.
- Prepared commit: `a06971a` (`feat(auth): port signup and saved verification flow to Expo`).
- [Apply-ready commit patch](a06971a.patch).
- PR #3 is already merged; this change needs a new PR against main.

## What is included

Password confirmation and guidance, confirmation-email resend, email-confirmed route guards, restoration of saved ID-review progress, actionable rejection/reupload states, and explicit reporting when an upload succeeds but the optional automated-check invocation fails. Existing Supabase storage and manual approval remain authoritative. No files under `export/` are added or deleted.

The patch adds `supabase/migrations/004_verification_progress.sql`, a read-only owner-selected status RPC. It must be applied to the intended Supabase project after migrations 001–003. It does not grant verification or alter existing RLS policies.

The patch also includes a detailed audit in `docs/expo-signup-verification-port.md`. It identifies unported features and a pre-existing issue: migration 002 labels email confirmation as human verification. This port does not claim that marker proves CAPTCHA completion. The full Next.js platform has not been ported.

## Applying it as a maintainer

Download `a06971a.patch` using GitHub's raw/download option. In a clean checkout of `danieog/braincraze`:

```sh
git switch main
git pull --ff-only
git switch -c feat/expo-signup-verification-flow
git am --3way /path/to/a06971a.patch
```

If main changed incompatibly, resolve the conflicts and rerun the checks before merging. The patch was checked against the target base with an isolated Git index.

```sh
npm ci
EXPO_NO_TELEMETRY=1 npm run lint
./node_modules/.bin/tsc --noEmit
npm test -- --runInBand
EXPO_NO_TELEMETRY=1 npm run export:web
```

Open a new pull request in `danieog/braincraze` and review the required migration/deployment steps. A code merge does not deploy the migration or establish that email, storage, CAPTCHA or ID services work live.

## Recorded validation

- 107 tests passed across 15 Jest suites; zero failed/skipped/todo tests.
- TypeScript passed.
- Expo lint passed with five existing warnings, zero errors.
- Expo web export passed.
- Disposable PostgreSQL fixture checks passed for owner isolation, permissions and latest-request selection.
- Live Supabase migration, real email delivery, native-camera acceptance, auxiliary ID check and production deployment remain unverified.

No application dependencies or lockfiles were changed. The Next.js application on this repository's main branch is unchanged by this integration package.
