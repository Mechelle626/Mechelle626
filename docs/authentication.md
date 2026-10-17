# BrainCraze authentication implementation

## Scope and structure

Next.js App Router provides pages and API routes in one application. No separate Express server or Auth0 tenant is used in this implementation. Steps 3–4 add provider-backed human verification and school affiliation approval after the email gate; see `docs/human-verification.md`. Password authentication uses Node's scrypt and opaque database-backed sessions. Earlier BrainCraze scaffold files are retained, and all new authentication tables live in the separate `braincraze` schema.

| Location | Purpose |
| --- | --- |
| `apps/web/app/signup`, `login`, `forgot-password`, `reset-password` | Requested authentication pages |
| `apps/web/app/verify-email` | Six-digit email verification |
| `apps/web/app/complete-profile` | Required school/role/profile details after first social sign-in |
| `apps/web/app/account` | Verified account details and session management |
| `apps/web/components` | Responsive shell, accessible form controls, session controls |
| `apps/web/lib/auth` | Validation, password cryptography, sessions, mail, OAuth and API handlers |
| `apps/web/app/api/auth/[...action]/route.ts` | Next.js API routing, Node runtime |
| `apps/web/proxy.ts` | Next.js 16 authentication middleware convention |
| `packages/database/auth.sql` | Idempotent initial schema, constraints and indexes |
| `scripts/migrate-auth.ts` | Transactional schema installer |
| `tests/auth.test.ts`, `tests/browser/auth.spec.ts` | Real HTTP/PostgreSQL and browser tests |

## API

All responses containing authentication data have `Cache-Control: no-store`. JSON mutation requests require an exact `Origin` match to configured `APP_BASE_URL`, `application/json`, and at most 16 KiB of JSON. Error responses carry `error` and optional field errors. OAuth callbacks have their own state/nonce protection and provider-specific response methods.

| Method | Path under `/api/auth` | Behavior |
| --- | --- | --- |
| GET | `/config` | Public enablement flags and mail mode; never credentials |
| POST | `/register` | Required profile/password fields; creates an unverified session and requests a verification email; 409 on email/username conflict |
| POST | `/login` | `email`, `password`, `remember`; generic invalid-credentials response |
| GET | `/me` | Current signed-in user's public account fields and current session ID |
| GET | `/verification-status` | Owned verification state, server time, expiry, resend cooldown and remaining attempts; no code or digest |
| POST | `/verify-email` | `code`; requires a session; consumes a valid code and rotates that session |
| POST | `/resend-verification` | Requires a session; rate-limited resend |
| POST | `/forgot-password` | `email`; same public response for a matching password account and unknown address |
| POST | `/reset-password` | `token`, `password`, `confirmPassword`; expires in 30 minutes; atomically consumes token, changes password and revokes all sessions |
| POST | `/logout` | Revokes current session and clears cookie |
| GET | `/sessions` | Requires verified email; lists unexpired, non-idle owned sessions |
| POST | `/revoke-session` | `id`; deletes only the signed-in user's specified session |
| POST | `/revoke-other-sessions` | Signs out every other session for the same user |
| GET | `/oauth/google`, `/oauth/microsoft`, `/oauth/apple` | Begin configured provider login |
| GET | `/oauth/google/callback`, `/oauth/microsoft/callback` | Code exchange and verified provider identity |
| POST | `/oauth/apple/callback` | Apple form-post callback with state-cookie and nonce checks |
| GET | `/oauth-profile` | Safe profile fields for the short-lived pending signup cookie |
| POST | `/complete-profile` | Required profile details; provider email/identity cannot be overridden by request body |

A reset link carries its token in the URL fragment, avoiding normal server URL logs and referrers. The browser removes that fragment and submits the token in JSON. After refresh, reopening the original email link is necessary. Reset tokens never appear in the API response. API field names are camelCase (`firstName`, `lastName`, `confirmPassword`); database column names are snake_case.

## Data and cryptography

- `users`: UUID, names, unique normalized email/username, password hash nullable for social-only accounts, school, constrained academic role, email-verification timestamp, timestamps.
- `sessions`: hashed random token, owned user, user-agent description, creation/activity/absolute expiry, remember flag. No token is stored in browser JavaScript or localStorage.
- `challenges`: password-reset challenges; email ownership proofs now use the dedicated `EmailVerification` table.
- `EmailVerification`: UUID, unique user ID, HMAC proof in `code`, expiry, verified flag, failed-attempt count, issuance/verification timestamps, and mail-delivery status.
- `identities`: unique provider/subject → user. Microsoft subjects include the verified tenant ID. Existing same-email accounts are deliberately not linked automatically.
- `oauth_flows`: short-lived state hash, nonce and PKCE verifier, consumed on callback.
- `oauth_profiles`: short-lived pending identity claims, addressed through a hashed random cookie token.
- `rate_limits`: database-backed fixed-window counters using HMAC-derived keys.

Passwords are 12–128 characters, preserved exactly, salted individually with 16 random bytes, and derived with scrypt N=32768, r=8, p=3, 64-byte output. Comparisons use constant-time buffer comparison. The strength indicator is length/character-variety guidance, not a guarantee or a breached-password check.

Session tokens use 32 random bytes and are stored only as SHA-256 hashes. Cookies are HttpOnly, SameSite=Lax, and Secure with the `__Host-` prefix when `APP_BASE_URL` is HTTPS. Standard sessions have a 12-hour absolute lifetime and 30-minute inactivity limit; their cookies have no persistent Max-Age. Remembered sessions have a 30-day absolute lifetime, seven-day inactivity limit, and 30-day cookie. Browser session restoration behavior varies, so the server always enforces expiry. Session activity writes are limited to once a minute.

Verification codes expire after fifteen minutes, permit five failed attempts, and use HMAC with `AUTH_SECRET` and the account ID. Resends invalidate the previous code, have a 60-second cooldown, and are additionally limited to ten requests per hour. The status API supplies server time, expiry, cooldown and remaining attempts to the countdown screen. Password resets use a 32-byte random token hashed in the database, expire after 30 minutes, and are consumed transactionally. Email, human and school verification now gate both `/account` and the session-management API; mailbox verification does not verify school affiliation.

Rate limits include per-email login (10 attempts/15 minutes), reset requests (3/hour), registration (5/hour), code checks and resends, global authentication traffic, and an optional trusted-proxy network key. Without a configured trusted proxy, a shared network bucket protects the instance; do not enable `TRUST_PROXY` unless your reverse proxy removes user-supplied forwarding headers. Tune these values against expected traffic before deployment. The SQL-backed counters work across application processes sharing the database.

## Real email setup

Use `MAIL_MODE=smtp`, a verified `MAIL_FROM`, and your SMTP provider's host/port/auth settings. Port 465 uses implicit TLS; other ports require STARTTLS. Certificate verification is not disabled. Store SMTP credentials securely outside Git. Register and configure the sender domain with the provider, and verify actual delivery and spam handling.

Local outbox mode is explicit and hostname-limited. It writes private JSON files containing email contents; these contain sensitive one-time proofs and must never be published. This mode is useful for local automated testing and does not deliver email. No SMTP server was configured or exercised during local development.

Registration survives a mail-send failure: it returns `emailSent: false`, navigates to a visible delivery warning, and lets the signed-in user request a resend. Forgot-password intentionally does not disclose whether the address matches an account or whether a matching delivery failed. Mail failures produce a sanitized server log; an operator must monitor these failures. SMTP delivery is synchronous here, not a durable background email queue.

## Social-provider configuration

Create your own provider applications. These routes are implemented but not live-tested because credentials have not been supplied. Disabled buttons reflect that condition; there are no mock social logins.

1. **Google:** set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; register `${APP_BASE_URL}/api/auth/oauth/google/callback` as an authorized redirect URI. Configure the consent screen and test users/publishing as required by your Google app.
2. **Microsoft:** set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`; configure the web redirect `${APP_BASE_URL}/api/auth/oauth/microsoft/callback` and the account types your application supports. The current adapter uses the common v2 endpoint; validate tenant/account-type policy in your registration. An institutional mailbox is not proof of role or school membership in this step.
3. **Apple:** set Services ID in `APPLE_CLIENT_ID`, plus `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and the matching private PKCS8 signing key in `APPLE_PRIVATE_KEY`. Configure Sign in with Apple and the HTTPS return URL `${APP_BASE_URL}/api/auth/oauth/apple/callback`. Apple requires an appropriate real domain configuration; localhost cannot complete this integration. The adapter generates short-lived ES256 client secrets and verifies Apple's RS256 identity token. The form-post flow requires a Secure SameSite=None state cookie, so the button is disabled for HTTP local origins.

Every provider response is verified with the provider's published JWKS, expected audience, issuer policy, expiry, issuance time and nonce. Google/Microsoft use PKCE. OAuth flow records expire after ten minutes and are consumed once. First social sign-in gathers required profile fields before creating an application account. A trusted `email_verified` claim can satisfy email verification; otherwise BrainCraze requests its own email code. A Microsoft response without a usable email is rejected with an instruction to use email signup. Apple names may not be returned on repeat authorization; the complete-profile form allows names to be entered.

Required outbound destinations for this implementation are your database, your SMTP provider, and the configured identity providers' authorization/token/JWKS hosts. Review provider app configuration and actual token claims in staging before enabling users. No production social success is claimed by the presence of these adapters.

## Deployment and limitations

Before deployment, configure authenticated PostgreSQL with the supported TLS/trust settings for your host; use a non-owner application role and a separate migration role. The included development database is not a production deployment. Supply a real HTTPS `APP_BASE_URL`, long random `AUTH_SECRET`, trusted-proxy policy if applicable, SMTP credentials, registered social callbacks and secrets, and network access. Restart after changing server configuration. Never print `.env` files or commit them.

Maintain database backups, a tested restore procedure, dependency/security monitoring, secret rotation, email-failure alerts and database capacity controls. Periodically delete expired sessions, challenges, OAuth flows/profiles and rate-limit rows. A sample maintenance command is provided as `npm run db:cleanup`; schedule it externally. Assess provider token/claim policies, email reputation, abuse resistance, logging redaction, and rate limits under actual traffic. Run an independent security and accessibility review; automated browser checks do not establish WCAG conformance or production readiness.

Beyond the implemented Steps 1–4: subscriptions, MFA, identity-provider account linking, profile editing, account deletion, native mobile apps, or administrator privileges. The only allowed account roles are Student, Faculty, Teaching Assistant, Tutor, and Staff.

## Validation performed in this workspace

- Optimized Next.js production build: passed.
- TypeScript check: passed.
- PostgreSQL schema application and a second idempotent application: passed.
- Expired-record cleanup command: passed.
- Twenty-six backend test cases: passed, zero skipped. They cover hashing/salting, normalization and duplicate registration, email verification gates and attempt limits, cookie/session behavior, session ownership/revocation, reset expiry/replay/session invalidation, CSRF, payload bounds, academic-role restrictions and login throttling.
- Fourteen Chromium browser test cases: passed, zero skipped. One exercises signup → verify → fixture human/school approval → account → logout → remembered login → forgot → reset; another checks the four requested screens at 375px, keyboard focus, disabled unconfigured social login and reset-without-token behavior. The third checks verification countdown persistence, expiry, wrong-code feedback, resend invalidation, timer reset, and success persistence on mobile. Additional human-verification tests cover email-first gating, unconfigured blocking, all three provider UI fixtures, and blocked script loading. School tests cover the three selectable methods, policy-approved email proofs, encrypted uploads, fixture scanning/review, captured frames, camera denial and route ordering. Desktop/mobile screenshots were inspected.
- Test users were removed; the application database had zero BrainCraze accounts after cleanup. Configuration/outbox/screenshots are ignored by Git.

These are local checks with real PostgreSQL and local-file email output. Human-verification checks use explicitly labeled service/browser fixtures, not live CAPTCHA. SMTP delivery and live Google, Microsoft and Apple flows remain unrun. No deployment, penetration test, exhaustive accessibility audit or native-mobile validation has been performed.
