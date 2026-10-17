import { redirect } from "next/navigation";
import { getSession } from "../auth/session";
export async function activatedPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if (user.onboarding_required) {
    if (!user.human_verified) redirect("/human-verification");
    if (user.identity_verification_status !== "verified")
      redirect("/identity-verification");
  }
  return user;
}
