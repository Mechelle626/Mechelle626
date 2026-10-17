# BrainCraze onboarding enhancement

This extends the existing authentication, school verification, membership, settings, and administrator systems. Those routes and services remain in place.

**Historical delivery note (superseded by [the localization extension](localization.md)):** the internationalization infrastructure supports the 18 requested languages, but the non-English catalogs currently contain **core-label drafts**, not a fully translated interface. Each has 58 draft entries, covering 54 of the 975 collected source keys; remaining copy falls back to English. None of the drafts has had native-language review. See `translation-review.json` for the exact missing entries. Do not describe this as a complete translated UI.

## New experience

1. `/` is a dedicated landing page with BrainCraze branding, overview, Login, Create Account, language selection, and a searchable country/territory preference. Preferences persist in browser cookies; language also persists to an authenticated account.
2. Signup and social-account profile completion require country/territory, state/province/region, institution name, and preferred language. Educational email is required unless the user explicitly selects **I do not have an educational email address**. The regular account email still receives the ownership proof. The educational email is declared contact data, not automatically verified academic affiliation.
3. Country/territory, administrative region, and institution inputs provide directory suggestions and explicit manual-entry options. Manual text does not grant residence or affiliation verification. The existing `school` field remains as a compatibility alias of the declared institution name.
4. New accounts continue through email verification → human verification → `/identity-verification`. That screen requests camera permission, captures a selfie, supports preview/retake, then requires an institution ID or an alternative ID. JPG, PNG, and PDF evidence uses the existing size/content safeguards. Selfies and camera evidence must decode as images.
5. Uploaded pairs enter **Pending Review**. Administrators can mark **Under Review**, approve **Verified**, request **Additional Information Required**, or mark **Rejected**. Status and reviewer notes appear in account settings. Resubmission starts a new selfie/document pair and supersedes the previous request, preventing stale approval.
6. New-account activation requires identity approval. New accounts cannot read/create community content, view other profiles/media, use Premium features, or enter the account dashboard before this gate passes. Own-profile editing, security settings, billing, and the locked feature preview remain available at their appropriate email/session gates. Backend authorization independently enforces this policy.
7. `/discover` previews availability by academic account type, subscription, identity status, and approved school affiliation. It is available to a signed-in newly created account even before email verification, with locked features pointing to the correct next check. `/verify-email` links to this preview. Reading a preview does not unlock the underlying APIs.
8. After activation, `/tutorial` introduces Dashboard, Profile Customization, Study Buddy, Note Sharing, Communities, Messaging, Study Partner Matching, Marketplace, GPA Tools, Settings, and Subscription Features. It persists progress, supports Continue, Back, Skip, and replay from settings/discovery. New-account account/discovery entry redirects to the tutorial until it is started/skipped/completed.

Existing accounts retain their earlier school-verification flow: the migration defaults `onboarding_required=false` for existing rows. Password registration and new social-account completion explicitly set it to true. No existing account was silently forced to upload a selfie or government ID. Authentication regression fixtures were updated explicitly to simulate approved identity/tutorial state where downstream account access is under test.

### Identity and academic affiliation remain separate

A passport, driver's license, national identity card, or other government ID is flagged as alternative evidence for manual review. It can support **personal identity** approval; it cannot automatically award a Verified Student/Faculty/TA/Tutor/Staff badge or satisfy school-only access controls.

For an institution-issued ID linked to a curated institution, an administrator may explicitly select **Also approve the institution affiliation for the selected school and role**. This requires both documents, clean security scans, an active eligible account, the stored institution/role snapshot, and an explicit review decision. It creates approval through the existing school-verification schema and badge system. The linked school request reuses the same encrypted document and owner/document binding, rather than creating a public copy. Manual institution names cannot automatically receive a curated school badge; the prior school verification workflow remains available.

## Location data

The server uses `country-region-data` 4.1.0 (MIT), from https://github.com/country-regions/country-region-data. The bundled dataset has 249 country/territory records and administrative-region data. Region coverage and names vary by jurisdiction; this is not a guarantee of complete or current political/administrative recognition. Users can always enter missing countries, territories, institutions, or administrative areas manually. No real institution directory was invented or seeded. Only active, operator-curated schools appear in institution suggestions.

## Additive database schema

`packages/database/onboarding.sql` is included by `npm run db:migrate` after the existing auth, school, and platform migrations. Repeat migration was validated.

New `braincraze.users` columns:

- `country`, `country_code`, `region`, `region_code`
- `institution_name`, `institution_email`, `institution_id`
- `preferred_language`
- `selfie_verification_status`, `identity_verification_status`
- `onboarding_required`

New tables:

| Table | Purpose |
| --- | --- |
| `identity_verifications` | Owner, institution/role snapshot, review state, timestamps, reviewer, notes |
| `"VerificationDocuments"` | id, user_id, document_type, document_url, verification_status, reviewer_notes, uploaded_at, request link, private key, MIME, byte size, scan status, capture method |
| `identity_review_logs` | Administrator downloads/decisions and operator scan events |
| `onboarding_progress` | Persisted tutorial step and status |

`document_url` stores an opaque `private://UUID` reference, **not a public URL**. Owner status responses omit it and the storage key. The existing badge view also requires approved personal identity for new-flow accounts. Existing school/email/subscription flags are not replaced with a government-ID flag.

The moderation field `account_status` remains separate from onboarding readiness. Identity approval cannot restore a suspended/banned account. The local backend uses its existing schema-owner database connection; application predicates enforce access, and this is not a claim that new tables are protected by owner-bypassing RLS. See the existing membership/access guide for deployment permission limits.

## API endpoints

All routes are under `/api/onboarding/` and return `no-store` responses. POSTs require the exact application origin and bounded request bodies.

| Method and endpoint | Behavior |
| --- | --- |
| GET `options?kind=countries|regions|institutions&q=...&country=...` | Rate-limited directory suggestions; no authentication required |
| GET `messages?language=CODE` | Whitelisted locale catalog; static interface copy only |
| GET / POST `preferences` | Read browser preferences; save validated language/region preference, updating authenticated user's language |
| GET / POST `registration` | Owner's residence details; validate/update residence and institution declarations |
| GET `identity/status` | Owner's safe status, document types, scan/review states; never file contents/keys |
| POST `identity/document` | One multipart document with `type`, `method`, optional `requestId`, and `document` |
| GET `discovery` | Signed-in feature availability, including pending-verification preview |
| GET / POST `tutorial` | Authorized persisted tutorial state; final-step validation for completion |
| GET `admin/identity?status=...&page=...` | Administrator queue, 50 rows per page |
| GET `admin/document/:documentId` | Administrator-only private attachment, clean scan required, audited |
| POST `admin/identity/review` | Administrator state transition, mandatory notes, optional institution-affiliation approval |

Document types are `selfie`, `institution_id`, `passport`, `drivers_license`, `national_id`, and `government_id`. A selfie must have `method=camera`. A non-selfie requires the current collecting request and a saved selfie. Duplicate/unknown multipart fields, missing or duplicate evidence, unsupported content, oversize bodies, invalid roles/locations/languages, stale requests, self-review, missing admin permission/2FA, unclean scans, and government-ID affiliation attempts fail closed.

Registration's existing `/api/auth/register` and `/api/auth/complete-profile` endpoints now also validate the residence fields. New-account field persistence happens inside account-creation transactions. A chosen educational-email declaration does not bypass verification of the actual login email.

## Private document review and operations

The existing `SCHOOL_DOCUMENT_KEY` and absolute `SCHOOL_DOCUMENT_DIR` store both school and identity evidence. Keep the directory outside public/static serving. Files use AES-256-GCM with authenticated owner/document IDs, random object keys, directory mode 0700, and file mode 0600. Images are decoded within pixel limits and re-encoded without original metadata. PDFs remain untrusted, signature-identified bytes; there is no claim of complete PDF structural validation or automatic identity recognition.

There is no public selfie/ID download route. An owner sees a local preview before submission and metadata/status afterward. A reviewer must be an authorized administrator with a second-factor check in the last 15 minutes. Documents are attachment-only, `no-store`, `nosniff`, and sandboxed. Self-review is forbidden. Downloads and decisions are audited. No administrator role is granted automatically; the existing operator/admin setup remains in place.

Use a real configured ClamAV executable/signature database through the trusted operator command:

```sh
npm run identity:admin -- scan DOCUMENT_UUID
```

Scan the selfie and the identity document separately. Failure records `error` and leaves opening/approval blocked. Successful scanning still does not approve identity: an authorized human reviewer must decide. `pending` evidence cannot be opened/approved in the admin UI.

**Camera capture is not automated liveness detection, face matching, or government-document authenticity verification.** Browsers supply image bytes; a client-provided camera marker is not trusted hardware attestation. The UI requires a camera for selfies, but the backend cannot prove that a hostile client used a physical live camera. Reviewers must assess the evidence under the operator's policy. No biometric/liveness provider is integrated.

Persistent private storage, key backup/protection, access monitoring, retention/deletion procedures, and physical device testing remain deployment work. The application does not automatically purge old superseded evidence. Any deletion job must account for institution documents shared with existing school requests. Do not delete the encryption key while retained evidence needs to remain readable.

## Original language infrastructure and translation review

The database-backed localization module, keyed source extraction, administrator editor, feedback and email templates are documented in [localization.md](localization.md). The counts and implementation description below describe the earlier delivery. Use the current database coverage report for present counts.

Supported locale choices: English (`en`), French (`fr`), Burmese (`my`), Indonesian (`id`), Malay (`ms`), Lingala (`ln`), Amharic (`am`), Tigrinya (`ti`), Arabic (`ar`), Persian (`fa`), Hindi (`hi`), Hebrew (`he`), Yiddish (`yi`), Chinese (`zh`), Japanese (`ja`), Korean (`ko`), Dutch (`nl`), and Spanish (`es`). Arabic, Persian, Hebrew, and Yiddish use RTL document direction. Locale preference resolves from the account, browser cookie, then browser language, with English fallback.

`LocalizationProvider`, `Localized`, and `useT` make existing application copy and attributes translatable without replacing the forms or their handlers. Canonical option values stay stable: a translated Student label still submits `Student`. Interface translation never uses an external runtime translation service. User posts, secret codes, filenames, identifiers, and marked user content are excluded. Dynamic source-message placeholders preserve inserted values literally. Explicit `Intl` formatting handles dates, times, currencies, file sizes, counters, and analytics numbers. USD amounts are formatted, not converted into another currency. Node's installed ICU reports date and number support for all 18 selected locales.

Language changes update the current interface without reloading/resetting entered form values and persist for the next full request. Settings includes a language selector. Catalogs are in `apps/web/messages/`; template extraction and coverage reports are reproducible:

```sh
npm run i18n:extract
npm run i18n:audit
```

The non-English draft catalogs are AI-authored and unreviewed. They currently cover common registration labels, roles, identity actions/statuses, navigation, and the draft-language notice. They do **not** translate all paragraphs, errors, or existing application copy. Missing entries deliberately display English instead of fabricated translations. `docs/translation-review.json` lists missing keys per locale. Complete those catalogs and obtain language review before advertising full translated UI support. Native browser permission dialogs, form validation, vendor CAPTCHA widgets, Stripe-hosted pages, and user-authored content are outside the application catalog's translation control. Live vendor locale behavior has not been validated.

## Tutorial and feature honesty

Tutorial and discovery describe implemented features at their actual scope. There is a persisted post/message/listing surface, profile customization, a profile mascot with Premium skins, content-count analytics, and eligible schoolmate/tutor directories. Dedicated note-file sharing, community groups, GPA tools, and club finder are not implemented; the new UI labels them coming soon or explains the available text-post alternative. This enhancement does not fabricate those services or unlock paid/verified tools through the tutorial.

## Local validation

Production build, TypeScript, repeat migration, **48 backend tests**, and **28 browser tests** passed. New checks cover:

- Manual and directory-backed residence, territories, canonical codes, and required/alternate educational-email registration.
- Selfie-first evidence, authenticated encryption binding, non-public routes, scan gates, ownership/admin/MFA restrictions, alternate-ID separation, explicit affiliation approval, resubmission, and stale-decision rejection.
- Conditional identity gates on new accounts, preview access without activation, and unchanged legacy paths.
- All 18 locale choices/directions, persistence, formatted numbers/currencies/dates, canonical role values, and untranslated-copy fallback.
- Synthetic mobile camera capture/retake, denied permissions, alternative-ID review, tutorial persistence/skip/replay/completion, feature discovery, and preserving member-authored content during translation.

Camera streams, prerequisite approval flags, document images, scan results, and reviewer decisions in tests are explicit fixtures. No real identity, real malware scan, live CAPTCHA/social flow, SMTP inbox delivery, or live Stripe transaction was verified. No native mobile application was built; the mobile experience is responsive browser UI. The real institution directory remains empty after fixture cleanup. External provider credentials and scanning configuration from prior guides are still required.
