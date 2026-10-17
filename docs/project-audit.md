# BrainCraze project audit

Audit date: 2026-10-17 (client date, America/New_York). Baseline commit: `d6eaf26`. This report covers the ten-phase extension committed alongside this report. It evaluates source code, the local PostgreSQL schema, local configuration presence and executed checks. It does not certify an unobserved deployment, physical-camera liveness, a live third-party service, or linguistic quality. There is no estimated overall completion percentage.

## Scope and implementation performed

The active scope is landing, registration, human verification, selfie/school/alternative-ID verification, review, email delivery, subscriptions, localization, administration and security. Working systems were extended. Previously interrupted campus-tool drafts were preserved under ignored `.local/paused-campus-draft/` and removed from active routes/migrations; they are not delivered features.

New work in this pass:

- Landing membership comparison reusing the existing pricing component, school/identity overview, factual basic-buddy preview, expandable FAQ and footer.
- Owner-only verification checklist for email, human state, selfie, identity evidence, clean scans and administrator approval. Upload is not treated as approval. Existing review notes, resubmission and status controls remain.
- Admin overview with stored platform totals, paginated/searchable subscription records, email queue counts and offline configuration diagnostics. Existing admin/recent-2FA permissions protect both UI and API.
- Durable security notices on successful password changes/resets and 2FA enable/disable. The notice and account change commit atomically; SMTP delivery stays separate.
- Expanded source-copy extraction for discovery/status labels and validation messages, catalog-backed fallback for generated validator diagnostics, drafts for security emails, stricter placeholder/format/nested-tag preservation and canonical language-tag handling.
- Configuration-only `integrations:check` command and this audit with machine-readable schema/configuration evidence.

## COMPLETED FEATURES — verified implementation, limited to the stated behavior

“Completed” here refers to the specific code behavior below. Operational blocks and incomplete broader features are listed separately.

| Area | Verified behavior | Evidence |
|---|---|---|
| Landing | Brand/overview; login/signup; global language selector; persisted region preference; membership comparison; verification overview; basic mascot preview; FAQ; footer; mobile layout | `components/landing*.tsx`; new landing browser test |
| Registration | First/last name, username, account email, password/confirmation, school role; residence/institution searches and manual entries; uniqueness and field validation; password strength | `lib/auth/handlers.ts`, `security.ts`; `lib/onboarding/registration.ts`; existing API/browser tests |
| Account access | Email/password login, remember-me, password reset, hashed opaque sessions, expiry, logout and session revocation | `lib/auth/session.ts`, `security.ts`; auth tests |
| Email ownership | Account-bound hashed six-digit proof, 15-minute expiry, attempts, resend cooldown/replacement and delivery-state tracking | `lib/auth/email-verification.ts`; email verification tests using local outbox |
| Human-verification logic | Turnstile/hCaptcha/reCAPTCHA adapters, fixed verification destinations, expiry/action/hostname checks, session binding, replay protection and server-owned state | `lib/auth/human*.ts`; isolated adapter/API tests, not live-provider tests |
| Selfie capture | Camera permission handling, capture/preview/retake, face-frame guide, track cleanup and encrypted evidence submission | `school-camera.tsx`; camera tests use synthetic browser streams |
| School/alternative ID | JPG/PNG/PDF uploads, camera images, readable previews/removal, role/institution context and passport/license/national/government ID alternatives | upload/identity components; protected upload and review tests |
| Evidence protection | Type/size validation, image re-encoding, authenticated encryption, opaque storage IDs, clean-scan gates and protected/admin-audited reads | `lib/school/documents.ts`, scanner/review modules; private-access tests |
| Verification review | Pending/under-review/additional-information/verified/rejected states; reviewer notes; resubmission/supersession; self-review rejection; school affiliation separate from personal identity | `lib/onboarding/identity.ts`; review tests |
| Badges/access rules | Badges derive from approved current school affiliation; premium and verification guards run server-side; suspension/expiry removes access | SQL badge view and `lib/platform/access.ts`; access tests |
| Billing logic | Price validation, checkout ownership/idempotency, signed webhook parsing, canonical subscription reconciliation, portal/cancellation/renewal/invoice ownership | `lib/platform/billing.ts`, Stripe webhook; synthetic Stripe-object tests only |
| Settings | Bio/picture/banner, privacy/friend controls, password changes, TOTP/recovery codes and session management | settings/profile/MFA modules and tests |
| Localization management | English default/fallback; 18 initial language definitions; switching/persistence; device-language suggestion; RTL; Intl formatting; admin language/catalog management; review states; user reports | `lib/i18n`, localization UI, PostgreSQL catalogs; localization tests |
| Security notifications | Successful password/reset/2FA mutations enqueue notices atomically without authentication secrets; failed password mutation does not | new queue module and password-change/rollback tests |
| Administration | Verification and user moderation; protected evidence review; translation/report management; stored activity counts; subscription read-only inventory; offline configuration diagnostics | admin pages and protected platform/localization/onboarding endpoints |

Source paths above are relative to `apps/web/` unless identified as SQL/scripts/tests. Exact new checks and full passing test names appear below.

## PARTIALLY IMPLEMENTED FEATURES

- **Public onboarding:** working local code, but actual email delivery, CAPTCHA and evidence scanning are not configured. A normal user cannot complete the public flow with this configuration.
- **Registration policy difference:** educational email is required unless the user explicitly selects the previously authorized no-educational-email option. It is not mandatory for every user. Social-login profile completion collects residence/role/institution data without requiring a local password.
- **Bot prevention:** CAPTCHA gates progression after account/email registration. It does not establish that bots cannot create any unverified account records.
- **Identity:** manual evidence workflow; camera bytes are not hardware attestation, face matching or automated liveness/document-authenticity proof. Those automated systems are not present or claimed.
- **School directory:** searchable curated database exists, but there are currently no real school/domain-policy entries in this local database. Manual institution text is not automatic affiliation proof.
- **Email integration:** generic SMTP transport exists. Dedicated HTTP SDK integrations for Resend/SendGrid/SES/Mailgun do not exist; their SMTP service can supply the existing transport's configuration. No valid-credential live delivery test has occurred. The delivery scheduler is not provisioned here.
- **Subscriptions:** implemented server/UI paths, but no live Stripe credentials, configured prices/portal/webhook acceptance or payment test has been verified. Premium “advanced analytics” currently means all-time content counts, not an advanced academic analytics product.
- **Localization:** runtime catalogs and management exist, but most non-English copy is missing. The static extractor reports zero detected remaining literals under its rules; this is a heuristic, not proof that every runtime, browser-generated or vendor-controlled message is translated. User-authored content is not automatically translated. No native-language review is claimed.
- **Admin analytics:** real stored activity/queue counts and subscription listing, not revenue reconciliation, study-performance analytics or an extensive business-intelligence dashboard. Trusted operator setup of a real admin with 2FA remains necessary.
- **Security:** application controls are tested locally. The current database connection is a superuser with RLS bypass; it is not a least-privilege production rollout. No independent security assessment, production restore test or deployment certification has occurred.

## BLOCKED FEATURES and INTEGRATION STATUS

Rules applied: credentials only through secure environment settings; no fabricated live responses/approvals; no authentication or verification bypass; no third-party service is called verified without valid-credential acceptance evidence. Existing tests use isolated fixtures/stubs and remove them afterward. Test approvals are not production approvals or proof of real identity/payment/service operation.

| Integration | Status | Actual blocker/evidence |
|---|---|---|
| Google Sign-In | ⚠ Implemented but Waiting for Credentials | Required client configuration missing; live OAuth not tested |
| Microsoft Sign-In | ⚠ Implemented but Waiting for Credentials | Required client configuration missing; live OAuth not tested |
| Apple Sign-In | ⚠ Implemented but Waiting for Credentials | Client/team/key/private-key configuration missing; live OAuth not tested |
| Cloudflare Turnstile | ⚠ Implemented but Waiting for Credentials | Site/secret keys missing; no live acceptance test |
| hCaptcha | ⚠ Implemented but Waiting for Credentials | Site/secret keys missing; no live acceptance test |
| Google reCAPTCHA | ⚠ Implemented but Waiting for Credentials | Site/secret keys missing; no live acceptance test |
| Production SMTP | ⚠ Implemented but Waiting for Credentials | SMTP host/sender configuration absent; development outbox active |
| Resend/SendGrid/SES/Mailgun via SMTP | ⚠ Implemented but Waiting for Credentials | Common SMTP path only; obtain and test the chosen service's SMTP credentials and verified sender |
| Dedicated email-provider HTTP/API adapters | ❌ Not Implemented | No dedicated Resend/SendGrid/SES/Mailgun API SDK adapter is present |
| Stripe | ⚠ Implemented but Waiting for Credentials | Secret, recurring-price IDs and webhook secret missing; real Checkout/portal/webhook test absent |
| OpenAI-compatible draft generator | ⚠ Implemented but Waiting for Credentials | API base, model and API key missing; no external generation call performed |
| ClamAV scan adapter | ⚠ Implemented; waiting for infrastructure | No credentials are needed: executable/signatures and a successful real scan are missing. This is an infrastructure block, not a credential block |
| Local development email outbox | ✅ Implemented and Verified — local only | Existing tests write/read isolated local mail files; this is not SMTP/provider delivery |
| Automated liveness/face matching | ❌ Not Implemented | Selfie capture and manual review only |

Machine-readable configuration evidence: [integrations.json](audit/integrations.json). All `liveTested` fields are false. “Configured” means presence only; diagnostics make no external request. Do not submit secrets in chat. For SMTP configuration and live acceptance steps, see [email-delivery.md](email-delivery.md).

Other operational blocks: public HTTPS deployment, a staffed/admin-reviewed verification process, curated school policies, scanner signatures, durable private storage/key recovery, an email-queue scheduler, backups/restoration and production monitoring have not been provisioned/validated in this workspace. There is no claim about infrastructure outside the observed workspace.

## MISSING FEATURES

Within the ten-phase scope, outstanding delivery items are full non-English draft population and human language review, real third-party acceptance tests, and the deployment/operations steps above. There is no local-code shortcut that supplies valid credentials, real school policies, live sender/payment accounts or real identity-review decisions.

From the broader earlier brief, but outside the narrowed implementation scope: GPA calculator/forecasting, Club Finder, Notes Hub/protected note sharing, study groups, course recommendations, buddy cursor tracking/reminders/streaks/animations/effects, and advanced academic analytics are not implemented. A basic profile mascot/skins exists; tutorial/discovery mentions are not evidence that those broader tools exist. Interrupted campus drafts are excluded from runtime and not counted as implementations.

## DATABASE CHANGES

### This extension

`packages/database/account-readiness.sql` expands `localized_email_queue.template`'s check constraint to accept `security` alongside `subscription` and `notification`. No campus tables or migrations were activated. No new authentication bypass/approval columns were introduced.

`i18n:seed` imports additional English source keys and non-English security-email drafts. It preserves administrator edits and uses Pending Language Review for machine-authored non-English entries. Source-copy extraction and the field-error fallback extended the English catalog. No existing user's preferences, role or approval were changed.

### Existing active schema inventory

All active migrations are called by `scripts/migrate-auth.ts`, in this order: `auth.sql`, `school.sql`, `platform.sql`, `onboarding.sql`, `localization.sql`, `account-readiness.sql`. Historical `schema.sql` is not applied by this command and is not evidence of active features.

| Migration | Tables/view and modifications |
|---|---|
| auth.sql | `users`, `sessions`, `challenges`, `identities`, `oauth_flows`, `oauth_profiles`, `rate_limits`, `EmailVerification`, `human_verification_challenges`, `human_verification_tokens`; adds human verification state/provider/timestamp to users; migrates old ownership proofs; session/challenge indexes and proof/role/expiry constraints |
| school.sql | `schools`, `school_email_domains`, `school_verification_requests`, `school_review_logs`; adds school approval/id/role/timestamp to users; one-active-request uniqueness, searchable request indexes, evidence and method/status constraints |
| platform.sql | `account_profiles`, `friendships`, `account_security`, `mfa_logins`, `billing_customers`, `subscriptions`, `stripe_events`, `admin_audit`, `posts`, `messages`, `listings`; user admin/account-status and session MFA timestamp columns; badge view; message/security RLS policies and PUBLIC revocations |
| onboarding.sql | `identity_verifications`, `VerificationDocuments`, `identity_review_logs`, `onboarding_progress`; user country/codes/region/institution/email/language/required-flow/selfie/identity fields; unique active identity request/selfie/evidence indexes; private-table revocations; badge view additionally checks new-flow identity approval |
| localization.sql | `languages`, `translation_keys`, `translations`, `translation_reports`, `translation_audit`, `localized_email_queue`; removes old fixed preferred-language check; language/tag/review/queue constraints, indexes and PUBLIC revocations |
| account-readiness.sql | Queue template check expanded for transactional security notices |

The observed `braincraze` schema has **35 base tables, 260 columns, 152 constraints, 58 indexes, one view and two RLS policies**. [database-schema.json](audit/database-schema.json) enumerates every observed table, column/default/nullability, constraint, index, view definition and policy. This is metadata, not application records. RLS is not enforced against the current superuser connection.

## API CHANGES

### New/modified in this extension

| Endpoint | Change and permission |
|---|---|
| GET `/api/platform/admin/overview` | New real counts/queue health/configuration-presence snapshot; admin plus recent 2FA required |
| GET `/api/platform/admin/subscriptions?q=&status=&page=` | New 30-row paginated/searchable/filterable read-only subscription inventory; same admin checks |
| GET `/api/onboarding/identity/status` | Adds owner-only `checklist` booleans; retains existing safe evidence metadata |
| POST `/api/platform/security/password` | Adds transactional queued security notice after successful change |
| POST `/api/auth/reset-password` | Adds transactional queued security notice after valid single-use reset |
| POST `/api/platform/security/mfa/enable` and `/disable` | Adds transactional notices through existing MFA code; existing security/session checks retained |
| POST `/api/localization/languages` | Canonicalizes a valid language tag before saving; preserves enabled-language validation |
| Auth/school/platform validation responses | Explicit catalog messages retained; unknown library-generated field messages use catalog-backed generic copy |
| GET `/api/onboarding/messages` | Database catalogs include newly extracted copy and email templates after seeding |

New UI route: `/admin/overview`. Existing landing, identity and settings screens extended. No public diagnostic endpoint, bypass route, new payment grant or public verification-file URL was added.

### Retained endpoint inventory

- **Auth GET:** `/api/auth/config`, `/me`, `/human-status`, `/verification-status`, `/oauth-profile`, `/sessions`; `/oauth/{google|microsoft|apple}` and provider `/callback` (Apple callback also accepts POST).
- **Auth POST:** `/register`, `/login`, `/two-factor`, `/forgot-password`, `/reset-password`, `/verify-email`, `/resend-verification`, `/human-challenge`, `/verify-human`, `/complete-profile`, `/logout`, `/revoke-session`, `/revoke-other-sessions` under `/api/auth`.
- **School:** GET `/api/school/schools`, `/status`; POST `/submit-document`, `/email/start`, `/email/resend`, `/email/confirm`.
- **Onboarding GET:** `/api/onboarding/preferences`, `/messages`, `/options`, `/registration`, `/identity/status`, `/discovery`, `/tutorial`, `/admin/identity`, `/admin/document/{id}`. POST `/preferences`, `/registration`, `/identity/document`, `/tutorial`, `/admin/identity/review`.
- **Platform GET:** `/api/platform/access`, `/settings`, `/billing`, `/friends`, `/profile/{username}`, `/media/{username}/{picture|banner}`, `/posts`, `/messages`, `/listings`, `/features/{feature}`, `/admin/verifications`, `/admin/users`, `/admin/document/{id}`, plus the new overview/subscriptions routes.
- **Platform POST:** `/settings/image`, `/settings/profile`, `/settings/appearance`, `/settings/remove-image`, `/security/password`, `/security/mfa/setup`, `/security/mfa/enable`, `/security/mfa/disable`, `/friends/request`, `/friends/respond`, `/friends/remove`, `/billing/checkout`, `/billing/portal`, `/billing/cancel`, `/billing/renew`, `/billing/invoice`, `/admin/action`, `/posts`, `/messages`, `/listings`.
- **Localization:** GET `/api/localization/languages`, `/coverage`, `/translations`, `/reports`; POST `/languages`, `/translations`, `/reports`, `/reports/review`. Public language definitions are distinct from admin catalog/report access.
- **Stripe:** POST `/api/stripe/webhook`, signed-payload processing and idempotent reconciliation.

GET/POST in these catch-all handlers does not mean every action accepts both methods. Mutations retain Origin checks, bounded input, applicable rate limits and server-side ownership/role/verification guards. Exact implementations are in the corresponding `lib/*/handlers.ts` files.

## TEST RESULTS

Fresh checks against the updated local production build:

| Check | Result |
|---|---|
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS: 58 passed, zero failed/skipped/cancelled |
| `npm run test:e2e` | PASS: 32 passed, zero failed/skipped |
| `npm audit --omit=dev --json` | PASS: zero known vulnerabilities reported by this advisory snapshot; not an independent security assessment |
| `npm run i18n:extract` | PASS under the heuristic's rules: zero detected unextracted literals; not a complete dynamic/vendor-copy guarantee |
| `npm run i18n:audit -- --require-complete` | **FAIL**: non-English catalogs are incomplete; exit code 1 is retained and reported |

Tests of CAPTCHA, social/provider-dependent paths, camera streams, scanner states and Stripe objects use isolated test fixtures/stubs. They do not establish real provider responses, human identity, live payment success, physical-camera capture or malware-signature health. No valid-credential third-party acceptance test was run.

Full passing test names and explicit failing/unrun checks are in [test-results.md](audit/test-results.md). The first audit baseline passed 52 backend/30 browser tests; six backend and two browser tests were added for this extension. No feature implementation was disabled to make a check pass.

## LOCALIZATION COVERAGE

See [translation-review.json](translation-review.json), regenerated after test cleanup. English has **1,182/1,182** populated entries. Each of the 17 non-English languages has **69 populated draft entries and 1,113 missing entries**. No non-English entries are approved. This measures stored population, not estimated completeness or translation quality. English fallback remains active. Full provider generation is blocked by missing base URL/model/API key; no live generation is claimed.

## PRODUCTION READINESS

Ratings apply to the requested production capability, not merely the existence of a page. A local test pass is not public-launch approval.

| Item | Rating | Verifiable reason |
|---|---|---|
| Authentication | ⚠ Partial | Password/session/MFA flows tested; real email delivery and live social sign-in unverified |
| Verification | ❌ Not Ready | CAPTCHA keys, real scans/signatures, curated school policies and production review operation unavailable |
| Payments | ❌ Not Ready | Stripe credentials/configuration and live acceptance tests absent |
| Localization | ⚠ Partial | Registry/UI/admin/reporting implemented; 1,113 missing entries per non-English language; no language review |
| Study Buddy | ⚠ Partial | Basic mascot/skins exist; broader companion functionality remains outside this scope and unimplemented |
| Notes Hub | ❌ Not Ready | Dedicated sharing/permission/file workflow not implemented in active app |
| Study Groups | ❌ Not Ready | Group creation/discussion/study-session functionality not implemented in active app |
| GPA Tools | ❌ Not Ready | Calculator/forecasting not implemented in active app |
| Security | ⚠ Partial | Tested application controls/encrypted evidence; local DB superuser bypasses RLS; production hardening, operational recovery and independent assessment unverified |
| Infrastructure | ❌ Not Ready | Loopback development URL/outbox, absent scanner and unprovisioned/unverified public hosting, worker scheduler, monitoring and backup/restore |
| Admin operation | ⚠ Partial | Protected UI/APIs tested; real admin/review staffing and deployment operation not configured/verified |

**BrainCraze is not ready for an unrestricted public launch with the observed configuration.** The new landing/admin/checklist/security-notification implementation is locally tested; external services, multilingual population and production operations remain explicit blockers. No working authentication or verification requirement was bypassed.
