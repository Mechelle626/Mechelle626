# BrainCraze · Step 3: human verification

## What is implemented

The `/human-verification` screen follows email ownership verification. It has the requested **Verify you are human** title, a provider CAPTCHA component, loading/retry/expiry/error feedback, an explicit **✓ Human Verified** success screen, and a Continue to school verification action. It uses the existing responsive BrainCraze design.

Three provider adapters are implemented: **Google reCAPTCHA v2 checkbox**, **hCaptcha**, and **Cloudflare Turnstile**. One provider is active per environment. Turnstile is the default selection; it is not enabled without keys. There are no fallback approvals or mock CAPTCHA modes in the running application.

The backend, rather than the widget, decides whether a response passes. Step 4 is a separate school-affiliation gate after this check. Only a provider-accepted response with the expected hostname and valid timestamp can set `human_verified = true`. Turnstile additionally must echo the expected `braincraze_human` action and session challenge ID in `cdata`. hCaptcha verification includes the configured site key. Invalid, malformed, expired, wrong-site and unavailable-provider results do not mark the account verified.

This check helps reduce automated account abuse; it does not guarantee that an account is operated by a person or verify school identity.

## Gate order

1. Anonymous → `/login`.
2. Signed in, email unverified → `/verify-email`.
3. Email verified, human unverified → `/human-verification`.
4. Both checks passed → `/school-verification` (Step 4).
5. Approved school affiliation → `/account`.

Middleware (`apps/web/proxy.ts`) and the server account page enforce this order independently. Protected session-management API routes now require email, human and school verification. Authentication state, verification endpoints and logout remain available as appropriate so a user can complete verification or leave the session. Human-verification APIs require email verification first. Password/social login routes lead to the next applicable step; an account redirect cannot bypass server gates.

Human verification is account state, as requested. It remains true across sign-ins unless an authorized future operational policy resets it; this implementation does not rerun CAPTCHA on every login. This is an onboarding gate after registration, so it does not itself prevent bots from submitting registration requests; the existing rate limits still apply there.

## Database updates

The idempotent `packages/database/auth.sql` migration adds:

- `braincraze.users.human_verified`: non-null boolean, defaults to false for new and existing accounts.
- `human_verified_at`: server timestamp of approval.
- `human_verification_provider`: constrained provider name, set server-side.
- `braincraze.human_verification_challenges`: UUID, user/session ownership, provider, creation/expiry timestamps, consumed timestamp. Challenges expire after ten minutes and are consumed once. Requesting a fresh challenge invalidates older unused challenges in that session.
- `braincraze.human_verification_tokens`: a unique SHA-256 digest of provider plus token, user ownership and timestamp. Raw CAPTCHA tokens are never saved. This table prevents concurrent/cross-account replay even before a provider call finishes.

Run `npm run db:migrate`. Existing account data is preserved; existing accounts must complete the new gate. Cleanup removes expired challenges and token digests older than 24 hours with `npm run db:cleanup`. Vendor-side token expiry and single-use validation remain required after local cleanup.

The verification service rechecks the session and verified email when claiming a challenge and after the provider request. Session revocation or expiry during a slow request prevents approval. Provider failures consume that challenge/token attempt; retry requires a fresh widget challenge. No `human_verified` value supplied by a client is accepted as authority.

## API endpoints

All endpoints use the existing HttpOnly session cookie. POST endpoints require same-origin JSON and retain existing CSRF, payload-size and network/global rate limits. Challenge creation is limited to 20 requests per ten minutes per account; verification submission to ten per ten minutes per account.

| Endpoint | Input | Behavior |
| --- | --- | --- |
| `GET /api/auth/human-status` | Session cookie | Requires verified email. Returns `humanVerified`, selected `provider`, public `siteKey` when configured, `configured`, and `next`. Never returns a secret. |
| `POST /api/auth/human-challenge` | `{}` | Issues an owned, session-bound, expiring `challengeId`, or reports already verified. Missing configuration returns 503. |
| `POST /api/auth/verify-human` | `{ "token": "provider-issued-response", "challengeId": "challenge-uuid" }` | Checks schema, session/email, challenge ownership/expiry, duplicate tokens and provider result. On success, persists state and returns `{ humanVerified: true, message: "Human Verified", next: "/school-verification" }`. |

The response-token example above is illustrative, not a usable token. Additional client fields such as `human_verified` or `user_id` are rejected by the verification input schema. Anonymous access returns 401, missing email verification/CSRF failures 403, invalid proofs 400, throttling 429, and unavailable configuration or provider transport 503. Invalid inputs never default to success.

## Provider configuration

Configure **one** real provider registration for the hostname in `APP_BASE_URL`, supply its public site key and server secret securely, then restart Next.js:

| `CAPTCHA_PROVIDER` | Required variables | Widget | Server verification endpoint |
| --- | --- | --- | --- |
| `turnstile` (default) | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile | `https://challenges.cloudflare.com/turnstile/v0/siteverify` |
| `recaptcha` | `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA **v2 checkbox** | `https://www.google.com/recaptcha/api/siteverify` |
| `hcaptcha` | `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY` | hCaptcha | `https://api.hcaptcha.com/siteverify` |

See `.env.example` for names without credential values. Keep secrets out of source control and chat. Public site keys are intentionally sent to the browser; secret keys are used only in the server's form-encoded HTTPS request. Verification destinations are fixed in code, redirects are refused, TLS verification is retained, and requests time out after ten seconds. The application validates a returned challenge timestamp with an application freshness limit of five minutes for Turnstile or two minutes for the other adapters, and allows up to one minute of future clock skew. The provider's own token validation is still mandatory.

Register the correct domains/site settings in the provider dashboard. This implementation is reCAPTCHA v2, not reCAPTCHA v3 or Enterprise. Turnstile widget options attach the action and challenge ID so the backend can check both. Switching providers requires a fresh challenge. Do not use provider test keys to claim a production human check.

Required network access depends on the selected provider. The server needs the exact verification host above. Browsers need provider scripts/frames/assets: Turnstile uses `challenges.cloudflare.com`; Google uses `www.google.com` and `www.gstatic.com`; hCaptcha uses `hcaptcha.com` and its required subdomains (including `js.hcaptcha.com` and `api.hcaptcha.com`). Add the required destinations to your deployment's egress/CSP settings where applicable and validate actual widget loading in your target browsers. This change does not replace the environment's network allowlist.

Official provider references for configuration review:

- [Google reCAPTCHA server verification](https://developers.google.com/recaptcha/docs/verify)
- [hCaptcha developer guide](https://docs.hcaptcha.com/)
- [Cloudflare Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

## Validation and current limitations

The current local environment has **no CAPTCHA provider keys configured**. The live screen reports that verification is unavailable, disables continuation, and the server gate remains closed. Live widgets and real provider verification have not been validated. Provider keys and appropriate network access are prerequisites for that work.

Backend tests use injected **fixture responses**, not live provider responses. They exercise all three HTTPS request contracts, response validation, missing keys, failure/timeout paths, email-first gating, database approval, replay prevention, ownership/expiry checks and in-flight session revocation. There is no HTTP parameter or environment switch that can inject a passing verifier into the running application.

Browser tests use explicitly labeled widget/API fixtures to exercise each provider callback path: expiry, widget errors, retry, provider rejection and success rendering. They also confirm that a browser-mocked success does **not** set the real database flag or unlock the real protected API. Existing account regression tests use explicit database approval fixtures to isolate unrelated account/session behavior from unavailable live providers. These fixture checks must not be reported as live CAPTCHA completion.

Run `npm run typecheck`, `npm run build`, `npm test`, and `npm run test:e2e` against the dedicated local development configuration. A staging run with real keys, actual browser widgets, successful/unsuccessful provider calls and deployment-specific network settings is still required before enabling this for users.
