import { db } from "../auth/db";
import { serviceReadiness } from "../operations/readiness";
export async function adminOverview() {
  const counts = (
    await db.query(
      `SELECT (SELECT count(*)::int FROM braincraze.users) AS users,(SELECT count(*)::int FROM braincraze.users WHERE account_status='suspended') AS suspended,(SELECT count(*)::int FROM braincraze.identity_verifications WHERE status IN ('pending_review','under_review')) AS pending_identity_reviews,(SELECT count(*)::int FROM braincraze.subscriptions WHERE status='active' AND period_end>now()) AS active_subscriptions,(SELECT count(*)::int FROM braincraze.posts) AS posts,(SELECT count(*)::int FROM braincraze.messages) AS messages,(SELECT count(*)::int FROM braincraze.listings) AS listings,(SELECT count(*)::int FROM braincraze.localized_email_queue WHERE sent_at IS NULL AND attempts<10) AS queued_emails,(SELECT count(*)::int FROM braincraze.localized_email_queue WHERE sent_at IS NULL AND attempts>=10) AS exhausted_emails`,
    )
  ).rows[0];
  return { counts, readiness: await serviceReadiness() };
}
export async function adminSubscriptions(
  q: string,
  page: number,
  status: string,
) {
  const query = (
    await db.query(
      `SELECT u.username,s.status,s.period_end,s.cancel_at_period_end,CASE WHEN s.stripe_price_id=$4 THEN 'monthly' WHEN s.stripe_price_id=$5 THEN 'yearly' ELSE 'unknown' END AS cycle,count(*) OVER()::int AS total FROM braincraze.subscriptions s JOIN braincraze.users u ON u.id=s.user_id WHERE strpos(lower(u.username),lower($1))>0 AND ($3='' OR s.status=$3) ORDER BY s.updated_at DESC,u.username LIMIT 30 OFFSET $2`,
      [
        q,
        (page - 1) * 30,
        status,
        process.env.STRIPE_PRICE_MONTHLY ?? null,
        process.env.STRIPE_PRICE_YEARLY ?? null,
      ],
    )
  ).rows;
  return { subscriptions: query };
}
