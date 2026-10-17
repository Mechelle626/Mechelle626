# Step 5: Upload School ID

BrainCraze provides `/school-verification/upload` after login, email verification, and human verification. The Step 4 upload method also uses the same file selector.

Choose your role and a curated school, then choose or drag and drop one JPG, PNG, or PDF, up to 10 MiB. Instructions ask for the front of the ID, readable and not blurry. These are user instructions; the application does not claim to detect blur or prove identity from an image.

Image previews use temporary browser object URLs, revoked on replacement, removal, or leaving the screen. PDFs show a filename and size without embedding potentially active content. Remove upload clears the local selection before submission; it does not delete previously submitted evidence. No selected file is sent until submission. A failed request can have an uncertain outcome; check current verification status before retrying.

## Backend and storage

`POST /api/school/submit-document` accepts multipart fields `schoolId`, `role`, `method=upload`, and `document`, exactly once each. The camera method also uses this endpoint. Duplicate and unknown fields are rejected. The server requires a live session, verified email, passed human verification, same-origin request, and an active curated school. Upload attempts are limited to five per hour per user. Request bytes are bounded before multipart parsing.

File signatures, MIME consistency, and size are checked server-side. Images must decode within pixel limits and are re-encoded as JPEG without original metadata. PDFs are signature-identified and retained as untrusted evidence; this is not complete PDF structural validation or malware detection. No PDF is embedded in the web interface.

`apps/web/lib/school/documents.ts` encrypts files with AES-256-GCM and binds authentication to the owner and request IDs. Random object identifiers replace original filenames. The absolute `SCHOOL_DOCUMENT_DIR` must be private and outside any publicly served directory; it uses mode 0700 and ciphertext files use 0600. `SCHOOL_DOCUMENT_KEY` must decode to 32 bytes and stay outside source control. Deployments need persistent private storage, key protection, encrypted backups, capacity controls, retention/deletion procedures, and HTTPS. The local filesystem adapter is not a managed cloud storage service.

There is no public document URL or web download endpoint. If the database transaction fails after file creation, the new ciphertext is removed. New evidence supersedes previous active requests and revokes prior school approval until reviewed again.

## PostgreSQL schema

The feature reuses `packages/database/school.sql`, installed by `npm run db:migrate`; no duplicate upload table or additional migration is needed. `braincraze.school_verification_requests` contains:

| Field | Purpose |
| --- | --- |
| id, user_id, school_id, role | Request identity, owner, selected school and role |
| method | upload, camera, or email |
| document_key | Random private ciphertext object ID |
| document_mime | Stored image/jpeg or application/pdf |
| document_bytes | Stored evidence size, limited to 10 MiB |
| document_scan_status | pending, clean, infected, or error |
| status | Request state, initially pending_review for uploads |
| submitted_at, updated_at | Server timestamps |
| reviewer, reason, approved_at | Review decision information |

Owner status responses omit private storage keys. `GET /api/school/status` returns current review status. Successful upload returns HTTP 201 with `verification` and a pending-review message; it does not set `school_verified=true`.

## Review and verified limits

See [school verification](school-verification.md) for scan/review administration. A clean security scan and explicit authorized review are required before approval. The current environment has no configured real ClamAV scanner/signature database, populated real school directory, or live CAPTCHA credentials. Test fixtures do not establish real school affiliation or malware safety.

Automated coverage includes encrypted storage and ownership binding, unsafe files, review gating, strict multipart fields, mobile drag/drop submission, local image preview/removal, invalid-file feedback, and PDF file-card submission. Tests use synthetic evidence and seeded prerequisite flags, not real IDs or live CAPTCHA approvals.
