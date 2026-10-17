# BrainCraze localization extension

This extends the existing LocalizationProvider, Localized, useT, English fallback, cookies, and profile preference. It does not replace the rendering or account systems.

## Architecture and source files

- `apps/web/messages/en.json` holds stable source keys (`ui.<source hash>` and named `email.*` keys). Components resolve source copy with `message(key)`; the existing Localized/useT layer applies database translations, retaining compatibility through source aliases. The public catalog contains static application copy only, never profile content or secret verification codes.
- The other 17 JSON files bootstrap unreviewed drafts. Runtime edits live in PostgreSQL and take effect on the next catalog request/full page load, without a build. `i18n:seed` is additive and does not overwrite administrator edits. `i18n:export` produces review/backup artifacts from database values and review states.
- Language definitions at runtime come from PostgreSQL, including enabled state, native name and RTL/LTR direction. The original array is bootstrap data, not a runtime allowlist. Registration and preference endpoints validate against enabled database records. New valid BCP 47 language tags do not require application changes or a schema enum update.
- English is the initial default and missing-value fallback. Signed-in preference takes priority, then the browser cookie. A first visitor with a supported non-English Accept-Language receives a suggestion with Use Suggested Language / Keep English / Choose Another Language. No account is recreated when switching. Choosing a language saves the account preference and cookie.
- `useFormatLocale` combines the language with the declared country code when the language tag does not already specify a region. Dates, times, numbers and currencies use Intl formatters; amounts are formatted in their actual currency, not converted. Without a declared country, Intl language defaults apply. Client date/time formatting uses the browser's timezone; timezone preferences are not stored. Language, country and institution names are data; user-authored content is not machine translated.
- Metadata, application error/404 pages and transactional email copy use catalog sources. Third-party hosted Stripe screens, CAPTCHA widgets and browser permission dialogs are controlled by their respective providers/browser and are not certified by these tests.

## Database migration

`packages/database/localization.sql` adds:

| Table | Purpose |
|---|---|
| languages | id, code, language_name, native_name, enabled, direction |
| translation_keys | stable key and English source |
| translations | id, language_id, translation_key, translation_value, review_status, updated_at, updated_by |
| translation_reports | id, user_id, language_id, translation_key, report_type, notes, created_at, queue resolution fields |
| translation_audit | actor, action, details, timestamp |
| localized_email_queue | durable notification/subscription delivery jobs, deduplication and retries |

Existing `users.preferred_language` is retained. Its old fixed-language check is removed. English cannot be disabled. Private tables revoke PUBLIC privileges. The current owner connection can still bypass database permissions; application admin/session checks remain mandatory.

Run `npm run db:migrate` then `npm run i18n:seed` before starting the updated app. Both are repeatable. Do not run the historical one-time `key-messages.mjs` conversion again. New copy: `node scripts/extract-messages.mjs --write`, inspect the result, then seed. `npm run i18n:extract` audits without rewriting. This is a static heuristic audit, not a proof that all possible runtime/vendor messages have been identified.

## Administrator workflow

Open **Admin → Localization Dashboard** (`/admin/localization`). It requires an active admin account, verified email/human state and 2FA confirmed in the last 15 minutes, using the existing admin permission system.

Administrators can search source/key/value, filter language/review state/missing entries, edit translations, inspect timestamps, update review states, add/edit/disable languages, view populated and approved coverage, and resolve/dismiss user feedback. Changes are audited. Timestamp conflicts return 409 to prevent stale edits. Empty drafts fall back to English. Placeholder and formatting-token mismatches fail before saving.

States: **Draft**, **Pending Language Review**, **Reviewed**, **Approved**. Machine imports always use **Pending Language Review**. Only explicit administrator edits can change that status. Approval is not inferred from population or coverage percentage. Non-English interfaces retain the draft-review notice; do not advertise linguistic approval before human review.

The footer **Report Translation Issue** accepts a selected translation key, active language, type (Incorrect translation / Missing translation / Poor translation quality) and notes. Sign-in is required. Reports are rate limited, origin checked and displayed as escaped text. The admin queue shows open reports. Existing users can find the language selector in Settings as well as the global page header.

## API contracts

All responses are no-store. POST requires the configured application Origin and bounded JSON. Administrator endpoints enforce recent 2FA server-side.

| Method /api/localization/... | Access / behavior |
|---|---|
| GET languages | public enabled definitions |
| POST reports | authenticated member feedback |
| GET coverage | admin totals, translated, missing, percentage and approved counts |
| GET translations | admin language/q/status/missing/page filters, 30 per page |
| POST translations | admin language/key/value/status/updatedAt; optimistic conflict checking |
| POST languages | admin code/name/nativeName/direction/enabled |
| GET reports | admin Open/Resolved/Dismissed status, up to 100 |
| POST reports/review | admin id/status Resolved or Dismissed |

Existing `/api/onboarding/messages` and `/api/onboarding/preferences` remain, backed by the database registry/catalog. Disabling a language makes future requests use English fallback until another enabled language is selected.

## Draft generation

Configure these securely in environment settings:

- `I18N_AI_BASE_URL`: OpenAI-compatible API base including `/v1`. Suggested default: `https://api.openai.com/v1`. For another provider, update the proxy secret's allowed destination hostname too.
- `I18N_AI_MODEL`: an available model identifier from that provider; no model is assumed.
- `I18N_AI_API_KEY`: secret binding restricted to the provider destination. Never paste it into chat or commit it.

Run `npm run i18n:generate -- --language=fr` or omit the language flag for all enabled non-English languages. `--max-batches=1` limits work for a trial; `--dry-run` validates provider responses without saving (it still calls the provider). Batches contain at most 12 missing source entries, not personal/user content. Generation is an explicit operator command and never runs during a page request, build, migration or startup.

The adapter sends JSON to `/chat/completions` and requires JSON-object output support. It validates exact keys, numbered placeholders, named variables, percent tokens, tags, URLs and line breaks. Invalid batches fail without import. Successful prior batches remain committed so generation resumes on the remaining keys. Existing administrator edits are preserved, including intentional blank edits. Provider bodies and credentials are not logged. Real provider/model compatibility and linguistic quality require live validation; local synthetic adapter tests do not establish either.

`npm run i18n:audit` writes database coverage to `docs/translation-review.json`. `npm run i18n:audit -- --require-complete` fails if any language has missing values. Populated draft percentage and approved count are separate. Never fill missing rows with English merely to increase coverage.

## Email delivery

Account proof, school proof and password reset now resolve the user's preferred language before sending. All 18 bootstrap catalogs include draft verification/reset/subscription/notification templates. Numbered codes, URLs and token bytes are interpolated literally. Email includes text plus escaped HTML with lang/dir for SMTP; development outbox records include language. Actual SMTP delivery remains dependent on existing mail configuration.

Stripe subscription/invoice events enqueue a deduplicated subscription notice pointing to Billing. New direct messages enqueue a generic notification pointing to Messages; private message content is not copied into email. Database state and jobs commit atomically. Run `npm run mail:deliver` periodically in production (for example, every minute in the deployment scheduler). It processes up to 100 ready jobs, locks with SKIP LOCKED, retries failed jobs every five minutes up to ten attempts, and skips suspended users. Monitor unsent/exhausted jobs. SMTP delivery is at least once: a crash after SMTP success can duplicate a notification. No scheduler/deployment has been provisioned here.

## Implementation and rollout plan

1. Apply migrations and seed catalogs; retain the current account/session and verification data.
2. Configure the selected provider and generate remaining drafts. Check the strict coverage report, placeholders and application screens for each language.
3. Have language reviewers edit and explicitly approve translations through the dashboard. Prioritize signup, consent/security/verification, payment and recovery copy.
4. Configure and test SMTP, the email queue scheduler, provider-localized Stripe/CAPTCHA behavior and device-specific formats in the actual deployment.
5. Verify permissions, browser language suggestions, mobile/RTL layouts and fallback before claiming multilingual launch readiness.

Full draft coverage is **not completed** while provider configuration is missing. The repository report records actual populated/missing counts; it is not a claim of 18 fully translated interfaces or native-language review.


## Validation in this workspace

Production build, TypeScript checking, 58 backend tests and 32 browser tests passed, with no skips. The new checks cover admin/recent-2FA permissions, stale edit conflicts, exact placeholders, draft-only compatible-provider imports using a local synthetic HTTP server, dynamic language addition, feedback resolution, browser suggestion consent/persistence, preferred language saving, all initial email catalogs and regional formatting. Original authentication, billing and verification regressions remain included.

The extraction heuristic reports zero remaining detected literals. This does not certify arbitrary runtime or vendor copy. After fixture cleanup the database contains 18 initial languages and no users, schools, translation reports or queued mail; the private evidence directory is empty. Running the mail worker with an empty queue returned sent=0/failed=0; that is startup validation, not SMTP delivery proof.

The current database report contains 1,182 source entries. English has 1,182 populated entries. Each initial non-English language has 69 populated drafts and 1,113 missing entries, with zero approved entries. The strict coverage command correctly exits with failure. This is an outstanding delivery requirement, not a passing coverage result. All three provider variables are currently missing; no external generation call was made. Configure them securely before generating the remaining drafts, then rerun coverage and language review.

The ten-phase extension also adds draft security-notification templates and stricter formatting-tag validation; see [the final project audit](project-audit.md) for the current scope and acceptance evidence.
