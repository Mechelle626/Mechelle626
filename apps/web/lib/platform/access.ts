import { message as bcText } from "../i18n/source";
import { requireIdentity } from "../onboarding/flow";
import { db } from "../auth/db";
import { requireUser, type AuthUser } from "../auth/session";
import { AuthError } from "../auth/security";
export const features = [
  "marketplace",
  "themes",
  "study-buddies",
  "analytics",
  "matching",
  "selling",
  "tutors",
] as const;
export type Feature = (typeof features)[number];
export async function accessFor(userId: string) {
  const { rows } = await db.query(
    `SELECT u.account_status,u.is_admin,
    EXISTS(SELECT 1 FROM braincraze.verification_badges b WHERE b.user_id=u.id) AS verified,
    EXISTS(SELECT 1 FROM braincraze.subscriptions s WHERE s.user_id=u.id AND s.status='active' AND s.period_end>now()) AS premium
    FROM braincraze.users u WHERE id=$1`,
    [userId],
  );
  const row = rows[0];
  if (!row || row.account_status !== "active")
    throw new AuthError(403, bcText("ui.d0e81258ed14cd2d"));
  return {
    verified: Boolean(row.verified),
    premium: Boolean(row.premium),
    admin: Boolean(row.is_admin),
  };
}
export function allowed(
  feature: Feature,
  access: { verified: boolean; premium: boolean },
) {
  const premium = [
    "marketplace",
    "themes",
    "study-buddies",
    "analytics",
    "selling",
  ].includes(feature);
  const verified = ["matching", "selling", "tutors"].includes(feature);
  return (!premium || access.premium) && (!verified || access.verified);
}
export async function authorize(feature: Feature, user?: AuthUser) {
  const actor = user ?? (await requireUser(true, true));
  if (!actor.email_verified_at || !actor.human_verified)
    throw new AuthError(
      403,
      bcText("ui.1082f416a844dc0d"),
    );
  await requireIdentity(actor.id);
  const access = await accessFor(actor.id);
  if (!allowed(feature, access))
    throw new AuthError(
      403,
      "This feature requires " +
        (["selling"].includes(feature)
          ? "Premium and approved school verification."
          : ["matching", "tutors"].includes(feature)
            ? "approved school verification."
            : "an active Premium subscription."),
    );
  return actor;
}
export async function requireAdmin() {
  const user = await requireUser(true, true);
  const { rows } = await db.query(
    `SELECT u.is_admin,a.enabled,s.mfa_verified_at FROM braincraze.users u
    JOIN braincraze.sessions s ON s.user_id=u.id AND s.id=$2
    LEFT JOIN braincraze.account_security a ON a.user_id=u.id WHERE u.id=$1`,
    [user.id, user.session_id],
  );
  if (!rows[0]?.is_admin)
    throw new AuthError(403, bcText("ui.8e2ee2de97d11062"));
  if (
    !rows[0].enabled ||
    !rows[0].mfa_verified_at ||
    Date.now() - new Date(rows[0].mfa_verified_at).getTime() > 15 * 60_000
  )
    throw new AuthError(
      403,
      bcText("ui.1510a4e7da1d8b5f"),
    );
  return user;
}
export async function badgeFor(userId: string) {
  return (
    (
      await db.query(
        "SELECT role FROM braincraze.verification_badges WHERE user_id=$1",
        [userId],
      )
    ).rows[0]?.role ?? null
  );
}
