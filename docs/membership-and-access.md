# BrainCraze Steps 7–12

The later [onboarding enhancement](onboarding-enhancements.md) adds residence/language fields and a personal-identity gate for new accounts without replacing these systems. Its guide describes the current new-account flow and language coverage.

Implemented account, membership, and access-control code builds on Steps 1–6. Run `npm run db:migrate` to apply `packages/database/platform.sql` after the auth and school schemas. The migration is repeatable and does not grant administrator or Premium status to existing accounts.

## Screens and APIs

| Screen | Purpose |
| --- | --- |
| `/pricing` | Public Free/Premium plans; monthly/yearly selection |
| `/subscription` | Authenticated membership selection; hosted Stripe Checkout |
| `/billing` | Plan, status, renewal/end date, payment method, most recent 30 invoices; cancellation, renewal, invoice download, Billing Portal |
| `/settings` | Profile picture/banner/bio, privacy, password, authenticator 2FA, sessions, verification, membership, friends |
| `/two-factor` | Completes password or existing social-account sign-in after 2FA is enabled |
| `/profiles/[username]` | Profile with current approved-role and Premium badges |
| `/posts`, `/messages`, `/marketplace` | Persisted basic content surfaces displaying author badges |
| `/features/themes`, `/features/study-buddies` | Premium theme/skin settings and preview |
| `/features/analytics` | Premium counts of the owner's posts, sent messages, and listings |
| `/features/matching`, `/features/tutors` | Eligible verified schoolmate/tutor directories |
| `/admin/verifications` | Permission-gated review queue, evidence review, decisions, account moderation |

Application APIs are under `/api/platform/`. GET endpoints include `access`, `settings`, `friends`, `profile/:username`, `media/:username/picture|banner`, `posts`, `messages`, `listings`, `features/:feature`, `billing`, `admin/verifications`, `admin/users`, and `admin/document/:requestId`. Admin verification lists support a status filter and pages of 50; account search returns up to 50 usernames.

POST endpoints include `settings/profile`, `settings/image`, `settings/remove-image`, `settings/appearance`, `security/password`, `security/mfa/setup|enable|disable`, `friends/request|respond|remove`, `posts`, `messages`, `listings`, `billing/checkout|portal|cancel|renew|invoice`, and `admin/action`. Except for multipart profile images, bodies are bounded JSON. All mutations require a session and exact application origin; sensitive actions have additional gates and rate limits. The signed Stripe webhook is the external-origin exception.

### Badges

`braincraze.verification_badges` is a database view derived from a current approved affiliation, active school/account, verified email, human check, and the matching approved school/role record. It does not use the self-reported academic role. The server's `badgeFor` and author queries supply `VerificationBadge`; `accessFor` supplies verification middleware. No user-editable badge award API exists.

Labels are 🎓 Verified Student, 👩‍🏫 Verified Faculty, 📚 Verified Teaching Assistant, 🎯 Verified Tutor, and 🏢 Verified Staff. Teaching Assistant is the stored name for TA. Revoking approval, submitting new evidence, or suspending an account removes its badge on the next server read. Review approval is required for ID evidence. The earlier reviewed school-domain email proof can also create an approved affiliation under the configured role policy.

Premium membership has a separate **Premium member** badge. Buying Premium does not approve school identity. Previously rendered pages update on refresh/refetch; there is no push notification or real-time badge transport.

## Stripe setup and billing behavior

The Stripe Node SDK is installed. The current environment has **none** of these configured variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_YEARLY`
- `STRIPE_WEBHOOK_SECRET`

Set real values securely in environment settings or the ignored local configuration; do not put secrets in chat or commit them. Create USD licensed recurring per-unit prices with quantity one: **799 cents/month** and **6999 cents/year**, interval count one. New checkout verifies price ID, amount, currency, recurrence, and availability server-side. Trial/free prices or client-supplied price IDs cannot grant Premium.

Configure Stripe's hosted Billing Portal for the product/prices and desired payment-method/subscription updates. Configure a webhook at `/api/stripe/webhook`, using the API version expected by the installed Stripe SDK. Subscribe to:

- `customer.subscription.created`, `.updated`, `.deleted`
- `checkout.session.completed`, `.async_payment_succeeded`
- `invoice.paid`, `.payment_failed`

Use Stripe test-mode keys/prices/webhook signing secrets together before enabling real payments. Validate Checkout, authentication challenges, failure paths, refunds/disputes policy, tax requirements, portal behavior, cancellation, renewal, and invoice downloads with a real Stripe test account. No live or Stripe test-account transaction has been performed here.

Checkout creates an account-bound customer, uses idempotency keys and a per-user transaction lock, reuses pending sessions, and blocks duplicate active/incomplete subscriptions. Success/cancel return URLs do not grant access. Webhooks verify the raw-body signature and deduplicate processed event IDs. Reconciliation reads current subscriptions from Stripe under the same account lock instead of trusting event arrival order or browser state. Billing-page refresh also reconciles current state.

Premium requires a recognized subscription with status `active` and a future period end. `past_due`, `unpaid`, `incomplete`, `trialing`, expired, and canceled subscriptions cannot grant new Premium access. An active subscription scheduled to cancel retains access through its paid period. Renewal restores automatic renewal before cancellation takes effect; after cancellation, the user starts a new checkout. Archived recognized prices remain valid for existing subscribers. Payment-method responses expose only type/brand/last four/expiry; Stripe handles card data.

Invoice download retrieves the invoice from Stripe, checks its customer against the session owner, and returns its HTTPS Stripe-hosted PDF URL. URLs can contain sensitive bearer tokens and should be treated as private. No invoice ID in a request grants ownership. Billing history is fetched from Stripe, not fabricated locally. A missing Stripe configuration leaves checkout unavailable and displays the actual unconfigured state.

Membership entitlements include the requested Free and Premium features. This delivery does not build a GPA calculator or club finder; the pricing UI marks them coming soon. The study buddy is a profile mascot with skins. Analytics currently provides all-time content counts. Matching is an eligible same-school directory, not a recommendation algorithm. Marketplace listings have no purchasing, fulfillment, or escrow flow.

## Settings and 2FA

Profile images accept JPG/PNG up to 5 MiB, decode within pixel limits, re-encode without original metadata, and store as PostgreSQL bytes. Media endpoints recheck visibility and use `no-store`; there are no public object URLs. Public means signed-in BrainCraze community. Private allows the owner; Friends Only allows the owner and accepted friends. That visibility also applies to posts/listings and directory entries. Existing direct messages remain visible to their participants even when a profile becomes private. Sending a message requires that the sender can view the recipient profile. This is a basic persisted messaging surface, not a real-time chat system.

Security changes require the current password. Social-only users can use the existing reset flow to establish an email password without disabling 2FA. Password changes require a fresh second factor when enabled, invalidate pending reset tokens, and revoke other sessions. Password reset revokes all sessions and leaves 2FA enabled.

2FA uses a six-digit, 30-second TOTP authenticator with a one-step clock window and counter replay protection. Setup expires after ten minutes. Secrets are AES-GCM encrypted with an account-bound key derived from `AUTH_SECRET`; ten recovery codes are shown once and stored as hashes. Each recovery code works once. Login challenges use separate HttpOnly cookies, expire in five minutes, and permit at most five failed attempts. A password or social sign-in cannot create a full session until its enabled second factor passes. Enabling/disabling 2FA revokes other sessions. Keep `AUTH_SECRET` stable and protected; changing it without migration makes encrypted authenticator secrets unusable. There is no unauthenticated 2FA recovery bypass; lost authenticator and recovery codes need a separately designed operator recovery process.

Email-verified owners can manage sessions in settings before finishing human/school verification. This intentionally changes the earlier blanket session-page gate. Community creation and premium/verified feature actions retain their own gates. Schedule `npm run db:cleanup` for expired auth and MFA challenge/setup cleanup.

## Administration and permission rules

Academic roles remain the five requested roles. Administrator permission is a separate, default-false `users.is_admin`; it cannot be selected during signup or changed through settings. An authorized database operator grants/revokes it with:

```sh
npm run platform:admin -- grant username
npm run platform:admin -- revoke username
```

No administrator account was created by this implementation. An admin must have email/human verification, enabled 2FA, and a session second-factor check within the past 15 minutes. Otherwise admin pages/APIs fail closed and direct the user to security settings/sign-in. Server decisions use the authenticated actor ID and a mandatory reason. Self-review and self-moderation are blocked. Other administrator accounts require an operator.

Uploaded evidence must pass the existing real malware scanner before an admin can download it or approve it. See [school verification operations](school-verification.md). Documents are attachment-only, encrypted at rest, and downloads/decisions are audited. Approve, reject, and request-more-information decisions apply to pending review requests. Suspension/bans revoke all sessions and pending MFA logins; all subsequent session reads reject unavailable accounts. Moderation is recorded in `admin_audit`. Restoration is available but does not resurrect old sessions. Account moderation does not automatically cancel a Stripe subscription; operators must handle paid-account billing obligations separately.

| Feature | Premium | Approved school verification |
| --- | --- | --- |
| Marketplace browsing | Required | No |
| Themes / study buddy skins / analytics | Required | No |
| Study matching / tutor directory | No | Required |
| Marketplace selling | Required | Required |
| Admin review/moderation | No | Separate administrator + recent 2FA |

`lib/platform/access.ts` provides `authorize`, `allowed`, `accessFor`, and `requireAdmin`. Server-rendered feature guards improve navigation; APIs independently enforce access. Expiry, suspension, and approval revocation are checked from the database on subsequent requests. Expired Premium themes/skins render as Classic even if the saved preference remains.

## Database ownership and limits

`platform.sql` adds profile/privacy/media, friendships, encrypted MFA state, pending MFA logins, Stripe customer/subscription/event records, moderation audit, and basic posts/messages/listings. Foreign keys, enums/checks, uniqueness, and the derived badge view constrain state. Default Free is the absence of an active paid entitlement; no client can set it to Premium.

The schema revokes PUBLIC access to security/billing/admin tables and defines participant RLS for messages and owner RLS for authenticator state. A non-owner SQL role must receive explicit grants and the trusted server must set `app.user_id` transaction-locally. The database test creates a temporary non-owner role and verifies participant-only reads and rejected sender spoofing. The current local backend connection is the schema owner and therefore bypasses RLS; its mandatory API predicates enforce application isolation. Do not claim that this owner connection is protected by RLS. Do not expose database credentials or arbitrary SQL to browsers. A production least-privilege service-role rollout requires separate reviewed grants/context propagation for every auth/internal operation, not merely enabling RLS on the local owner connection.

## Verified locally

- Repeat migration, production build, and TypeScript check passed.
- 39 backend tests and 24 browser tests passed, with no skipped tests.
- Coverage includes all five badge roles, removal/forged grants, expired and failed subscriptions, Checkout idempotency, webhook signature/deduplication/current-state reconciliation, invoice ownership, renewal/cancellation ownership, privacy/friends/media, message isolation, 2FA, admin review/scan gates, suspension, and PostgreSQL message RLS.
- Stripe tests inject adapter fixtures and use the SDK's signature-test helper. Browser verification/admin fixtures use synthetic data and explicitly seeded prerequisite/scan state. These are not real transactions, malware scans, school identity checks, or live social/CAPTCHA provider tests.

SMTP, real CAPTCHA/social credentials, curated real schools, malware signatures/scanner, Stripe configuration, deployment HTTPS/private storage, monitoring/recovery, and a production security/accessibility review remain external deployment requirements.
