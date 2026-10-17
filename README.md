# BrainCraze · Accounts, verification, and membership

Responsive Next.js/React pages with PostgreSQL-backed authentication, verification, membership, settings, administrator review, and feature access control. Implemented scope covers Steps 1–12 and the additive identity/onboarding enhancement described below; it is not a complete campus platform.

## Implemented

- Sign up with first name, last name, username, email, password/confirmation, school, and one of the five requested academic roles.
- Password strength guidance, server validation, case-normalized email/username uniqueness, and salted scrypt password hashing.
- Email/password login, remember me, email verification by six-digit code expiring after 15 minutes, forgot password, and single-use password reset links.
- HttpOnly cookie sessions, verified-email route/API protection, session listing, individual revocation, sign out other sessions, and logout. Password reset revokes all sessions.
- Google, Microsoft, and Apple OAuth/OIDC route implementations with state/nonce checks, provider JWT verification, Google/Microsoft PKCE, and a complete-profile step. Buttons remain disabled until configured. Live provider flows have **not** been tested.

- Human-verification page and backend adapters for reCAPTCHA v2, hCaptcha, and Turnstile; server-owned `human_verified` state gates account access after email verification. The active provider needs real keys; no live provider has been tested.

The local instance uses a **development outbox**. Emails are written to private local files, not delivered to a real inbox. This is labeled in the UI. SMTP credentials are needed for actual delivery. School and role remain self-reported until reviewed school-email policy or authorized institution-evidence review approves academic affiliation.

- School verification screen with a curated school search, role selection, school-email codes, private ID upload, camera capture, and operator review tools. No real schools have been configured; IDs remain pending until scanning and explicit review.

- Approved-role badges on profiles, posts, messages, and marketplace listings; separate Premium membership badges.
- Pricing and membership selection, Stripe Checkout/webhooks/Billing Portal implementation, billing dashboard, cancellation/renewal, and owner-checked invoices. Stripe credentials are absent; no real payment flow has been validated.
- Profile picture/banner/bio, public/private/friends privacy, password changes, authenticator 2FA and recovery codes, sessions, verification, and membership settings.
- Administrator verification review/moderation with recent 2FA, audited decisions, clean-scan approval gates, and suspension/ban session revocation.
- Server/API verification and Premium guards, basic persisted community surfaces, theme/mascot skins, content-count analytics, and eligible schoolmate/tutor directories. GPA calculator and club finder are not built.

See [Steps 7–12 implementation and configuration](docs/membership-and-access.md) for the exact scope, schema, endpoints, permission model, Stripe setup, and verified limitations. Current checks: production build, TypeScript, **52 backend tests and 30 browser tests passed**. Payment tests use fixtures, not a Stripe account.

## Identity and onboarding extension

- Landing page before authentication, persistent language/region preferences, and residence/institution registration fields with directory search and manual entry.
- New-account selfie → institution or alternative ID → private administrator review; personal identity remains separate from school affiliation and its badges.
- Feature discovery, an interactive resumable/skippable/replayable tutorial, and identity-aware server/API access gates for new accounts. Existing accounts keep their earlier flow.
- 18 locale choices, RTL support, localized dates/times/numbers/currencies, and draft core-label catalogs. **Full translated copy is unfinished:** each non-English locale has 58 draft entries covering 54 of 975 collected source keys; other copy falls back to English. Drafts need language review.

See [onboarding enhancement](docs/onboarding-enhancements.md) and the [translation review report](docs/translation-review.json) for current scope, schema, routes, security, and missing translation entries. Camera capture is implemented; automated liveness/face matching is not. Test images and approvals do not establish real identity.

## Run locally

Requires Node.js 24, npm, and PostgreSQL 17 (the versions used for this implementation).

```sh
npm ci --cache /tmp/braincraze-npm
cp .env.example apps/web/.env.local
# Edit DATABASE_URL, APP_BASE_URL, AUTH_SECRET and mail settings in that file.
npm run db:migrate
npm run dev
```

Create a long random `AUTH_SECRET` locally; never commit it. The example file lists the configuration keys without credential values. Use your normal authenticated PostgreSQL connection. The current isolated workspace already has a local database and an ignored configuration file. Its database container is called `braincraze-postgres`, used for local development. That local container uses loopback-bound trust authentication for development only; it is not a deployment configuration.

The current workspace has no CAPTCHA keys configured, so users cannot continue past the human-verification gate until a provider is configured and passes. See the Step 3 guide for provider variables. Automated fixture approvals are confined to test code.

To use local email files, set `MAIL_MODE=outbox`, `ALLOW_LOCAL_OUTBOX=true`, and an absolute `MAIL_OUTBOX_DIR`. `APP_BASE_URL` must use `localhost` or `127.0.0.1`. Set directory permissions to restrict access. Open the generated JSON email locally to obtain a verification code or reset link. Never expose this directory through a web route. Without `MAIL_OUTBOX_DIR`, files go to `.local/mail` relative to the command's working directory.

```sh
npm run build
npm run start
# In a separate terminal, against this running local-outbox instance:
npm test
npm run test:e2e
npm run typecheck
```

Integration and browser tests require the dedicated local-outbox configuration and a running application at `APP_BASE_URL`. They create isolated fixture users and delete those users and their generated messages afterward. Do not target a production database. Playwright uses installed `/usr/bin/chromium` when available, or its downloaded browser. Set `CHROMIUM_PATH` to override the executable. Browser screenshots are generated under ignored `test-results/`.

## Configuration and architecture

See [onboarding enhancement](docs/onboarding-enhancements.md), [Steps 7–12 membership and access](docs/membership-and-access.md), [Step 6 camera school ID](docs/camera-school-id.md), [Step 5 school ID upload](docs/upload-school-id.md), [Step 4 school verification](docs/school-verification.md), [Step 3 human verification](docs/human-verification.md), [Step 2 email verification](docs/email-verification.md) and [authentication documentation](docs/authentication.md) for routes, schema, security behavior, OAuth setup, and deployment limitations. The old [BrainCraze design](docs/implementation-plan.md) is historical planning material and does not describe this Step 1 implementation.

Production build and local testing do not establish production readiness. External email/social integrations, deployment configuration, operational monitoring, recovery procedures, and an independent security/accessibility review still need validation.


### Localization management extension

The existing i18n provider now uses database-backed language definitions and editable translation catalogs. Administrators with recent 2FA can use **Admin → Localization Dashboard** for translation edits, review states, missing-key filters, language definitions, coverage, and member feedback. First visitors receive a device-language suggestion; English remains the default until a choice is made. Transactional emails use the account language. Subscription and direct-message notices are queued for a separately scheduled delivery worker.

Run `npm run db:migrate` and `npm run i18n:seed` before starting this version. See [localization architecture, APIs, commands, and rollout plan](docs/localization.md).

**Still blocked:** complete non-English draft generation requires the selected compatible provider's endpoint, model and API key in secure environment settings. No live generation or native-language review is claimed. `npm run i18n:audit` reports actual database coverage; `npm run i18n:audit -- --require-complete` fails while translations are missing. A populated draft is not an approved translation.
