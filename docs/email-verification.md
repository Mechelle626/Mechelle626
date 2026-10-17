# BrainCraze · Step 2: email ownership verification

## Implemented behavior

After email/password registration, the backend generates a cryptographically random six-digit code and requests its delivery to the registered email address. It stores an account-bound HMAC-SHA256 digest, never the plaintext code, and expires newly issued codes after **15 minutes**. `AUTH_SECRET` supplies the HMAC key; rotating it requires affected users to request a new code.

The signed-in user opens `/verify-email`. The responsive screen includes a single labeled six-digit input (supports pasting and one-time-code autocomplete), a countdown, remaining incorrect attempts, resend controls with a persistent cooldown, delivery feedback, expired/incorrect/locked states, and an explicit **✓ Email Verified** success screen. The success screen has a Continue to human verification action and persists after refresh. Step 3 now gates protected account access after mailbox verification.

Countdowns are computed from server-provided timestamps using elapsed browser time. Refreshing does not restart either countdown. The database remains authoritative: setting or bypassing the browser timer cannot make an expired code valid. Background tabs refresh their state when visible again.

A new code replaces the previous proof and resets the expiry and failed-attempt counter. The generator avoids immediately repeating the previous code. Resend is limited to once per 60 seconds, with an additional ten-request hourly limit. Five incorrect attempts lock the current code until a new one is issued. Expired, replaced, used, undelivered and cross-account proofs do not grant verification. The user ID always comes from the authenticated session.

Successful verification atomically updates the verification record and `users.email_verified_at`, then rotates the current session. Protected account access still depends on server verification state. Other application verification, school affiliation and subscriptions are outside Step 2.

## PostgreSQL schema

`packages/database/auth.sql` creates **`braincraze."EmailVerification"`**:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | uuid, primary key | Verification record identifier |
| `user_id` | uuid, unique foreign key | Account owning this proof |
| `code` | text, 64 hex characters | Account-bound HMAC digest, not the six digits |
| `expires_at` | timestamptz | Server-enforced expiration |
| `verified` | boolean | Successful confirmation recorded |
| `attempts` | integer, 0–5 | Persisted incorrect-attempt count |
| `created_at` | timestamptz | Latest code issuance; used for resend cooldown |
| `verified_at` | nullable timestamptz | Confirmation timestamp, consistent with `verified` |
| `delivery_status` | pending/sent/failed | Whether the configured mail transport accepted the request |

There is one record per account; resending replaces its current proof. A successful record remains marked verified for status checks. Expired unverified records can be removed by `npm run db:cleanup`; account verification remains in the user row. The idempotent schema script migrates any Step 1 verification challenge into this table without changing its existing expiry. Newly issued/resend codes get 15 minutes. Password reset tokens remain in `challenges`.

Apply with `npm run db:migrate`. Changes run inside a transaction. No school data, passwords, or user accounts are deleted by this migration.

## API endpoints

All endpoints are under `/api/auth`. A valid session is required. Mutations additionally require same-origin JSON requests. Existing CSRF protection, payload bounds and distributed rate limits apply.

| Method and endpoint | Input | Response |
| --- | --- | --- |
| `GET /verification-status` | Session cookie | `email`, `verified`, `expiresAt`, `resendAvailableAt`, `remainingAttempts`, `deliveryStatus`, `serverNow` |
| `POST /verify-email` | `{ "code": "123456" }` | On success: `verified: true`, `message: "Email Verified"`, `verification` snapshot, `next: "/human-verification"`; rotates session cookie |
| `POST /resend-verification` | `{}` | On successful transport acceptance: safe message and updated `verification` snapshot |
| `POST /register` | Existing registration contract | Automatically requests the initial verification email; returns `emailSent` and the verification screen path |

The sample code above is an example input, not a usable login bypass. Responses never contain the plaintext code or its digest. Unauthenticated requests return 401; malformed/incorrect/expired/locked codes return 400; CSRF failures return 403; throttling returns 429; unavailable mail service returns 503. Incorrect attempts commit before returning errors so retries cannot bypass the limit.

`deliveryStatus: sent` means the configured transport accepted the message. It does not prove arrival at an external inbox. If delivery fails, the record is marked failed and cannot verify the account; the user can request a replacement after the cooldown. Registration remains recoverable through login and resend. Row locks serialize verification/resend operations, and delivery updates are bound to their exact proof so an older request cannot overwrite a newer delivery state.

## Delivery configuration and evidence

The current local environment uses an explicitly labeled **development outbox**. Messages are written to private ignored JSON files, not sent to real inboxes. These files contain one-time codes and must never be served publicly or committed. The screen states this. Configure `MAIL_MODE=smtp`, sender, host, TLS-capable port and credentials for real delivery as described in `.env.example` and `docs/authentication.md`.

No SMTP credentials have been supplied and no external mailbox delivery has been verified. A controlled filesystem transport failure is tested locally; it is not a live SMTP test.

Validation commands: `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`. The backend tests check the 900-second lifetime, hashed storage, response redaction, ownership, expiry, failed-attempt persistence, replay rejection, resend replacement/concurrency and simulated delivery failure. Browser checks exercise the visible countdown, reload persistence, expired/failure states, resend reset and final verified state on mobile, along with the existing desktop authentication flow.
