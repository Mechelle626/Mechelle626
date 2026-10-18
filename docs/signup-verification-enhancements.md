# Signup and verification flow branch

Target repository: `Mechelle626/Mechelle626`. Branch: `feat/signup-verification-flow`.
Base: `1a173b3a35c6dd32d4109824017dbac4d15dde27`.

## Reference evidence

The supplied reference is [danieog/braincraze PR #3](https://github.com/danieog/braincraze/pull/3). Its fetched head is `d15d96fe0565116da3fa86050359936b7613ef3b`; merge commit `acce7c60d499d0d5d1bb8ee58d075dff1d4425e9` has first parent `a332f832fc7411933895d7f7471337cf7a83f5d1`. Comparing those merge parents shows ID upload, review, and auxiliary document-check additions. The PR title alone does not establish that it added login and signup screens.

Later reference main, inspected at `b2d4b4ee69d7c8b09cec6f339d3b4c95ebce488d`, contains `src/components/AuthForm.tsx` and `src/lib/auth.ts`: email/password signup and login with a confirmation message. These are later-main evidence, not PR-head features. GitHub API metadata could not be retrieved in this environment; the source evidence above comes from fetched Git objects.

The reference uses Expo/React Native and Supabase. This branch contains original Next.js components adapted to the existing BrainCraze architecture; no reference application files, dependencies, credentials, or database migrations were imported. Useful concepts retained are explicit confirmation steps and a clear distinction between an ID submission and a human review decision. The reference's optional AI checks, school-specific image-background rules, and post-review deletion claim are not implemented here. Existing encrypted evidence retention remains as described in the project audit.

## Completed changes

- A shared, accessible four-step progress navigation on signup, email verification, human verification, identity verification, and legacy school verification pages.
- Status comes from the authenticated server session. A server wrapper passes only verification flags to the client, excluding email and session identifiers. Only the first unfinished step is linked; subsequent steps remain labeled as locked. The guide is informational; existing server/API authorization remains authoritative.
- Signed-in visitors to `/signup` resume through the existing `nextStep` function, including legacy school-affiliation and approved-account destinations.
- Anonymous visitors to `/verify-email` are redirected server-side to login before rendering verification content.
- Pending review, rejection, and requests for more information have distinct guidance and do not count as approval. Progress is a snapshot at page load; existing verification screens retain their live success/status controls. Reloading or revisiting the page refreshes the guide.
- Registration guidance explicitly separates email ownership, bot prevention, personal identity, and approved school affiliation. A self-reported role never grants a verified academic badge.
- Responsive logical CSS supports narrow screens and RTL layouts. Thirteen new English translation keys use the existing localization system; other languages fall back to English until translated. No machine translations or approvals were fabricated.

## Database and API changes

No migrations, tables, API endpoints, permissions, provider integrations, or authentication mechanisms were added or replaced. The existing session and onboarding route decisions are reused. Signup and email verification pages now perform server-side session checks.

For an existing deployment, run `npm run i18n:seed` after deployment to register new English keys without overwriting administrator edits. No new environment variables are required.

## Validation

- Production build: passed. Existing warning in `lib/operations/readiness.ts` about broad dynamic filesystem tracing remains; this branch does not resolve it.
- TypeScript check: passed.
- Backend tests: 60 passed, zero failed or skipped, including sequential progress and legacy-account tests.
- Browser tests: final full run passed all 33 tests in 35.4 seconds, zero failed or skipped. Coverage includes signup → email verification, mobile layout/keyboard controls, saved review states, CAPTCHA rejection, camera capture/denial, evidence submission, administrator review, and existing account/billing/localization flows.
- Translation extraction: zero unextracted strings detected by the existing static extractor, 1,195 English keys. This heuristic is not a linguistic or comprehensive runtime audit.
- Initial browser run: 31 passed, one failed because the old generic `h2` locator matched the added progress heading. Replaced it with the exact expected page heading. The subsequent three-test authentication run passed, as did the new saved-review-state browser test. A later full run recorded a signup navigation timeout; a diagnostic then tried to read a response body after navigation, causing a test-only protocol error. That diagnostic was corrected to assert the HTTP status without reading a navigated-away response. The final full run did not reproduce the earlier navigation timeout; its underlying cause was not established. No authorization or rate-limit controls were relaxed.

Tests use isolated accounts, synthetic camera images, explicit scan/review fixtures, and mocked external-provider responses where already documented. They do not validate real identity, an actual CAPTCHA provider, delivered email, or a payment account.

## Remaining limitations and integration status

This is a focused flow improvement, not completion of the full earlier platform brief. See [the existing project audit](project-audit.md) for the broader feature inventory and production gaps.

- Email/password and persisted flow decisions: verified in local tests.
- CAPTCHA, OAuth, SMTP delivery, Stripe, malware scanning, and translation generation: existing implementations; live operation remains unverified and requires valid external configuration/credentials. No integration is newly certified by this branch.
- Automated selfie liveness, face matching, and automated document authenticity: not implemented.
- Full non-English translation coverage and human language review: incomplete. Newly added copy currently uses English fallback outside English.
- Evidence retention/deletion policy and production infrastructure still need deployment-specific review; the reference's deletion promise is not made by this application.
