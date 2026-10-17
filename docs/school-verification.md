# BrainCraze · Step 4: school identity verification

## Implemented UI and workflow

`/school-verification` follows account email and human verification. It includes the five requested academic roles, a searchable school dropdown, university email, and three selectable methods:

- **University email**: request and enter a six-digit code for a mailbox on an explicitly approved school-domain/role policy.
- **Upload school ID**: submit one JPG, PNG, or PDF, up to 10 MiB, for private security scanning and manual review.
- **Scan school ID**: open the device camera, position/capture the front of the ID, retake if necessary, and submit through the same private review pipeline. This captures an image; it does not perform OCR, automatic authenticity checks, or biometric verification.

The screen shows email expiry, resend cooldown, incorrect-code feedback, pending review, requests for more information, rejection feedback, and approved affiliation. A camera denial or unsupported/insecure context offers the upload alternative. Camera tracks stop on capture, closing, method changes and unmount; browser previews are temporary local object URLs.

Email and human verification are prerequisites for every school endpoint. The account page and protected session-management APIs now also require `school_verified = true`. Pending/rejected submissions do not unlock access. Login follows email → human → school → account. Logout and the verification workflows remain accessible as needed.

School and role supplied at signup remain self-reported until approval. Approval updates the user's verified school, verified academic role, profile school/role and timestamp. Submitting different evidence supersedes previous proofs and revokes the prior school grant while the new request is pending. Verification is a point-in-time platform decision; continuous enrollment checks and scheduled re-verification are not implemented.

## Curated school directory and role policy

No real schools/domains were supplied, so the initial directory is **empty**. No real institution, email domain, university integration or school partnership has been invented. Tests temporarily insert clearly labeled fixtures under `.example.test` and remove them afterward.

Only a trusted operator with server/database access can import schools. There is no public school-creation or approval endpoint. Register reviewed names and exact email domains through a JSON file:

```json
[
  {
    "name": "REPLACE_WITH_REVIEWED_SCHOOL_NAME",
    "active": true,
    "domains": [
      {
        "domain": "replace-with-reviewed-domain.example",
        "emailRoles": ["Student"],
        "policyReference": "https://school.example/replace-with-authoritative-policy"
      }
    ]
  }
]
```

This is a placeholder template, not an approved institution. Replace it with information independently reviewed against authoritative school sources before importing. Do not infer trust from `.edu`, a display name, a guessed subdomain, or text such as “faculty” in an address.

```sh
npm run school:admin -- import /absolute/path/reviewed-schools.json --reviewer operator-name
```

Email roles default to **none**. A domain must explicitly authorize the selected role. General campus mail may include students, faculty, staff and alumni; mailbox possession alone must not be treated as proof of a particular role unless the institution's reviewed policy supports that inference. Use ID review for roles without a suitable email policy.

Domain matching is exact after normalization; arbitrary subdomains, suffix lookalikes and domains assigned to another school fail. Each domain maps to only one school. Imports are additive: omitted schools/domains are preserved, not deleted. To withdraw email approval for a domain, import it with `emailRoles: []`; to stop new verification for a school, set its `active` value to false. Already issued email proofs are checked against current policy again when confirmed. Directory changes do not automatically revoke every previously approved account; that would require an explicit operational policy.

## Email evidence

A new school-email request is bound to user, school, academic role and the policy domain. Six-digit codes are generated with Node cryptography; only an account/request-bound HMAC is stored. Codes expire in 15 minutes, allow five incorrect attempts, and are replaced on resend. A persistent 60-second send cooldown plus API rate limits restrict abuse. Superseded, expired, used, undelivered or cross-account proofs cannot approve affiliation.

Successful confirmation transactionally marks the request approved and updates the user. The response contains safe status fields, never code hashes or private document keys. Local development uses the existing **outbox**, so mail is not delivered to a university inbox. SMTP setup and actual mailbox delivery remain untested.

## Private ID evidence and review

The current implementation uses a **private encrypted local filesystem store**, not AWS S3. Configure a dedicated absolute directory outside `public/` and a stable 32-byte AES key in base64:

- `SCHOOL_DOCUMENT_DIR`
- `SCHOOL_DOCUMENT_KEY`

An ignored private key and directory have been generated for this local workspace. The key is not in source control or printed in logs. Preserve it securely: rotating/loss of the key without migration makes existing encrypted documents unreadable. For deployment, provide persistent private storage and key management; a writable ephemeral application directory is not a complete production storage system.

Uploads are size bounded and validated by detected content type. Declared MIME mismatches and unsupported formats are rejected. Images are decoded with a pixel limit and re-encoded as JPEG to strip metadata and appended content; PDFs are held as untrusted documents pending scanning/review. Original filenames are not used as storage paths. Documents use random UUID names, AES-256-GCM, per-file nonces and account/request-bound authenticated metadata, with private directory/file permissions. There is no public or owner-facing document download/preview endpoint, and request status responses omit object keys and raw files.

Every ID submission remains `pending_review` with scan status `pending`. Approval requires a **clean security scan and an explicit operator decision**. ClamAV integration is provided through `clamscan` (or an operator-configured `SCHOOL_SCANNER_EXECUTABLE`). The local environment does not currently have a working ClamAV installation/signature database. Missing scanner, scanner errors and infected results block approval. Injected clean results exist only in test code; no HTTP field or application setting disables scanning to grant approval.

Operational commands:

```sh
# Requires a real ClamAV binary and up-to-date, trusted signatures.
npm run school:admin -- scan REQUEST_UUID --reviewer operator-name

# Only clean-scanned documents can be exported, with a new private file (no overwrite).
npm run school:admin -- document REQUEST_UUID /private/path/review-copy.jpg --reviewer operator-name

# Examine the actual evidence and compare the person's identity, school and requested role.
npm run school:admin -- review REQUEST_UUID approve --reviewer operator-name --reason "Reviewed current role and affiliation evidence"
npm run school:admin -- review REQUEST_UUID reject --reviewer operator-name --reason "Please supply current identification"
npm run school:admin -- review REQUEST_UUID needs_information --reviewer operator-name --reason "Please supply evidence of the requested role"
```

Use an extension appropriate to the stored media type for exported review copies. Reviewer labels are audit metadata, not an authentication system: these are privileged **server/operator CLI tools**, protected by shell/database permissions. A web administrator dashboard and application administrator authorization are outside this step. Obtain request IDs/metadata using authorized database operations; the user's status endpoint also exposes their own request ID. An ordinary app role such as Staff cannot invoke an approval API because no such public route exists.

A security scan is not proof of document authenticity or ownership. Reviewers must inspect valid current affiliation evidence, match the account identity and requested role, and reject ambiguous documents. CLI decisions and exports are audited. Review copies should be removed after review. Establish retention, deletion, reviewer access, backups, key recovery and incident-handling policies before production use. Automatic ID-file retention/deletion scheduling is not implemented in this step; resubmitted/superseded evidence remains encrypted until an authorized retention process removes it. No regulatory or production security certification is claimed.

## API

All routes are under `/api/school`, require a valid session with account email and human verification, and return `Cache-Control: no-store`. Mutations additionally require an exact same-origin `Origin`. JSON bodies are bounded to 16 KiB; multipart uploads are bounded to 10 MiB plus a small envelope allowance. Database operations use parameters and transactions.

| Method and endpoint | Request | Result |
| --- | --- | --- |
| `GET /schools?q=...` | Search string, at most 100 characters | Up to 20 active schools, IDs, names and email-eligible roles; no fabricated results |
| `GET /status` | Session | Owned latest request, verified school/role, cooldown/expiry, safe feedback, scan state, storage configuration and mail mode |
| `POST /email/start` | `{ schoolId, role, universityEmail }` | Policy validation and a new code request; response includes `emailSent` and verification status |
| `POST /email/resend` | `{ requestId }` | Owned active email request, cooldown/policy recheck, replacement code |
| `POST /email/confirm` | `{ requestId, code }` | Owned single-use proof; approval only after valid mailbox code and current school/role policy |
| `POST /submit-document` | Multipart `schoolId`, `role`, `method` (`upload` or `camera`), one `document` file | Encrypted private submission; pending scan/review, never immediate approval |

School IDs must come from the directory; academic roles are constrained to Student, Faculty, Teaching Assistant, Tutor and Staff. Client fields such as `school_verified` are rejected in JSON contracts. Camera/upload provenance is a client-selected capture method, not an authenticity guarantee. The optional university-email field shown for ID methods is not submitted or used as evidence.

Submission rate limits are five per hour per account, resends ten per hour, email-code attempts ten per ten minutes, and searches 120 per minute. Errors distinguish missing authentication (401), unmet earlier gates/CSRF (403), invalid evidence (400), conflicts (409), oversize bodies (413), throttling (429) and unavailable storage/mail service (503), without exposing document contents or secrets.

## Evidence and limits

Passed: optimized build, TypeScript, 26 backend test cases and all 14 browser cases across the validation runs. Schema installation was repeated successfully. Tests cover domain/role matching, hashed 900-second proofs, expiry, incorrect-attempt persistence, resend invalidation, ownership, encryption and authenticated decryption, file validation, scanner failures, explicit review, resubmission revocation, route/API gates, selectable methods, camera denial, captured-frame submission and stopping camera tracks.

A separate temporary CLI fixture exercised directory import, scan failure blocking, private export and an explicit review decision after an **injected** clean scan. These checks used synthetic images and fictional test-only domains, not real ID review. Camera automation used a canvas media-stream fixture, not physical camera hardware. Test users, directory entries, mail and document fixtures were removed. Desktop pending-review and mobile form screenshots were inspected.

Still unverified/unconfigured: real institutional directory/domain policies, real university email delivery, real ID authenticity decisions, working malware scanning/signatures, physical-device camera behavior, live CAPTCHA, production storage/recovery and deployment. This is implemented application logic with local validation, not a claim that any actual person's school identity has been verified.
