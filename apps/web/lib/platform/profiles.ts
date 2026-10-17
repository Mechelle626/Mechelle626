import { message as bcText } from "../i18n/source";
import { db } from "../auth/db";
import { AuthError } from "../auth/security";
export const visibleSql = (alias: string, viewer: string) =>
  `(${alias}.id=${viewer} OR COALESCE(p.visibility,'public')='public' OR (p.visibility='friends' AND EXISTS(SELECT 1 FROM braincraze.friendships f WHERE f.status='accepted' AND ((f.requester_id=${alias}.id AND f.recipient_id=${viewer}) OR (f.recipient_id=${alias}.id AND f.requester_id=${viewer})))))`;
export async function profile(username: string, viewer: string) {
  const { rows } = await db.query(
    `SELECT u.id,u.first_name,u.last_name,u.username,COALESCE(p.bio,'') AS bio,COALESCE(p.visibility,'public') AS visibility,
    p.picture IS NOT NULL AS has_picture,p.banner IS NOT NULL AS has_banner,COALESCE(p.theme,'classic') AS theme,COALESCE(p.buddy_skin,'classic') AS buddy_skin,
    b.role AS badge,s.name AS verified_school,
    EXISTS(SELECT 1 FROM braincraze.subscriptions sub WHERE sub.user_id=u.id AND sub.status='active' AND sub.period_end>now()) AS premium
    FROM braincraze.users u LEFT JOIN braincraze.account_profiles p ON p.user_id=u.id
    LEFT JOIN braincraze.verification_badges b ON b.user_id=u.id LEFT JOIN braincraze.schools s ON s.id=b.school_id
    WHERE u.username=$1 AND u.account_status='active' AND ${visibleSql("u", "$2")}`,
    [username, viewer],
  );
  if (!rows[0])
    throw new AuthError(404, bcText("ui.c29957075a95f3e1"));
  const row = rows[0];
  if (!row.premium) {
    row.theme = "classic";
    row.buddy_skin = "classic";
  }
  return row;
}
export async function friends(userId: string) {
  return (
    await db.query(
      `SELECT f.requester_id,f.recipient_id,f.status,a.username AS requester,b.username AS recipient FROM braincraze.friendships f
    JOIN braincraze.users a ON a.id=f.requester_id JOIN braincraze.users b ON b.id=f.recipient_id WHERE f.requester_id=$1 OR f.recipient_id=$1`,
      [userId],
    )
  ).rows;
}
