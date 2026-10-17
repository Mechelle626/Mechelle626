# Step 6: Camera Scan School ID

`/school-verification/scan` is BrainCraze's camera screen. It requires login, verified email, and passed human verification, as does its backend. Choose your school and role, open the camera, align the front of the ID, and capture. The same page switches to **Preview School ID** with Retake and Submit verification controls. Keeping preview in memory avoids putting private images in URLs, browser storage, or a public preview route. Refreshing discards the unsubmitted photo.

## Frontend

`apps/web/components/school-camera.tsx` requests video only after Open camera, prefers the rear-facing camera, and uses muted inline playback for mobile browsers. HTTPS is required outside localhost. Denied permissions, missing hardware, unavailable cameras, and capture errors are reported with an upload alternative. The overlay is a positioning guide: capture includes the full photo, not an automatic crop. There is no OCR, automatic ID detection, blur scoring, or claim that a photographed ID is authentic.

Capture uses a canvas, constrains the longest side to 4096 pixels, and creates a JPEG up to 10 MiB. The preview uses a temporary object URL, revoked when replaced or unmounted. Retake clears the old evidence before opening the camera again. Submission is disabled until a photo and school are selected. Camera tracks stop on capture, Stop camera, unmount, or page visibility loss. Late permission responses are stopped if the user has left or cancelled the active attempt. No microphone permission is requested. Actual camera availability and permission UI depend on the browser/device.

`apps/web/components/upload-school-id.tsx` shares the role/school/submission form between upload and scan routes. Step 4's inline camera uses the same capture component and links to the dedicated screen.

## Backend

The screen posts multipart `schoolId`, `role`, `method=camera`, and `document` to `POST /api/school/submit-document`. The server checks session, email and human gates, origin, request limits, exact fields, school, role, file signature, MIME consistency, image decoding, pixel bounds, and size. Camera requests reject PDFs; upload requests still accept them. Images are re-encoded without original metadata and encrypted in private storage.

The existing PostgreSQL `braincraze.school_verification_requests` schema in `packages/database/school.sql` records `method=camera`, owner, school, role, private document key, stored MIME/size, timestamps, `status=pending_review`, and `document_scan_status=pending`. No additional table or migration is required. The success receipt means submission was saved; it does not grant school approval. Review status is available through `GET /api/school/status` and the school verification screen. See [upload storage](upload-school-id.md) and [review administration](school-verification.md).

## Validation and limitations

Browser tests use synthetic canvas camera streams and seeded prerequisite flags to exercise mobile capture, frame display, preview, retake, stopped tracks, submission, denied permission, upload fallback, and a permission response arriving after navigation. Backend tests reject PDF camera evidence and cover encrypted storage/review gates. These checks do not validate physical phone cameras or prove real school affiliation. Production still requires real school records, provider credentials, HTTPS, private persistent storage, malware scanning, and authorized reviewers.
