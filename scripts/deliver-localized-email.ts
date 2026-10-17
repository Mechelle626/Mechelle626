import { db, transaction } from "../apps/web/lib/auth/db";
import { sendLocalizedEmail } from "../apps/web/lib/i18n/email";
// Run periodically in deployment. At-least-once delivery: SMTP success followed by
// process failure can duplicate an email. Never log recipients or message bodies.
let sent = 0,
  failed = 0;
try {
  for (let i = 0; i < 100; i++) {
    const found = await transaction(async (c) => {
      const row = (
        await c.query(
          `SELECT q.*,u.email FROM braincraze.localized_email_queue q JOIN braincraze.users u ON u.id=q.user_id WHERE q.sent_at IS NULL AND q.attempts<10 AND q.next_attempt_at<=now() AND u.account_status='active' ORDER BY q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1`,
        )
      ).rows[0];
      if (!row) return false;
      try {
        await sendLocalizedEmail(
          row.user_id,
          row.email,
          row.template,
          row.template_values,
        );
        await c.query(
          "UPDATE braincraze.localized_email_queue SET sent_at=now(),attempts=attempts+1 WHERE id=$1",
          [row.id],
        );
        sent++;
      } catch {
        await c.query(
          "UPDATE braincraze.localized_email_queue SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' WHERE id=$1",
          [row.id],
        );
        failed++;
      }
      return true;
    });
    if (!found) break;
  }
  console.log(JSON.stringify({ sent, failed }));
  if (failed) process.exitCode = 1;
} finally {
  await db.end();
}
