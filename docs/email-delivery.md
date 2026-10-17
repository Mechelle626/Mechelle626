# Email delivery for BrainCraze

BrainCraze uses the existing Nodemailer SMTP transport. Resend, SendGrid, Amazon SES and Mailgun can be selected by supplying their SMTP connection details from the provider account. There are no dedicated HTTP/API SDK adapters for these services. No live connection to any of them has been verified in this workspace.

Supply credentials through secure environment settings only. Do not paste them into chat, commit them, or put credential values into this documentation. The committed `.env.example` contains variable names/placeholders, not usable credentials.

Required deployment configuration:

- `MAIL_MODE=smtp`
- `SMTP_HOST`, `SMTP_PORT` (typically 587 with mandatory STARTTLS, or 465 with implicit TLS)
- `SMTP_USER`, `SMTP_PASSWORD` as issued for the provider's SMTP service
- `MAIL_FROM` using a sender/domain verified with that provider
- `APP_BASE_URL` set to the actual application URL

Get the current host, region-specific endpoint, port and SMTP credentials from the selected provider. SES SMTP credentials are not the same as an AWS API key. Provider sender verification, DNS configuration, quota/sandbox restrictions and delivery events must be checked in that provider's account. Configuration presence is not a delivery test.

Account verification and password reset are sent immediately. Subscription and direct-message notices use the existing durable queue. Password change, password reset, 2FA enable and 2FA disable now insert a generic security notice in the same database transaction as the account mutation. These notices contain an account-settings link, never passwords, codes, tokens, recovery secrets or document data. Failed authentication does not enqueue a change notice.

All templates resolve the user's preferred language, with English fallback. Security templates have unreviewed drafts for the 17 non-English bootstrap languages; they are imported as Pending Language Review, never Reviewed/Approved.

Run `npm run mail:deliver` periodically in the deployment scheduler. It processes up to 100 eligible queued messages, retries failures after five minutes up to ten attempts, and skips inactive accounts. Admin → Administration overview shows queued and exhausted counts. This repository does not provision a scheduler. Delivery is at least once: an SMTP success followed by a worker crash may produce a duplicate notice.

For a live acceptance test, use an operator-controlled recipient, verify sender/DNS settings, confirm provider acceptance and actual receipt, check reset/verification links, then test one queued notice through the deployment worker. Do not report SMTP or a named provider as functional before that test with valid credentials succeeds. This test has not been performed here.

The local development outbox remains restricted to loopback application URLs and explicit opt-in. Invalid/outbox production configuration fails closed. Outbox success proves local file creation only, not email delivery.
