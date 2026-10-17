import { message as bcText } from "../i18n/source";
import { AuthError } from "../auth/security";
import { db } from "../auth/db";
export type FlowUser = {
  email_verified_at: string | null;
  human_verified: boolean;
  school_verified: boolean;
  onboarding_required?: boolean;
  identity_verification_status?: string;
};
export function nextStep(user: FlowUser) {
  if (!user.email_verified_at) return "/verify-email";
  if (!user.human_verified) return "/human-verification";
  if (user.onboarding_required)
    return user.identity_verification_status === "verified"
      ? "/discover"
      : "/identity-verification";
  return user.school_verified ? "/account" : "/school-verification";
}
export async function requireIdentity(userId: string) {
  const row = (
    await db.query(
      "SELECT onboarding_required,identity_verification_status FROM braincraze.users WHERE id=$1",
      [userId],
    )
  ).rows[0];
  if (!row) throw new AuthError(401, bcText("ui.e30c2ec3ce0121a5"));
  if (
    row.onboarding_required &&
    row.identity_verification_status !== "verified"
  )
    throw new AuthError(
      403,
      bcText("ui.df17139e0f46246d"),
    );
}
