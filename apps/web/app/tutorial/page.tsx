import { message as bcText } from "../../lib/i18n/source";
import { Localized } from "../../components/localization";
import { redirect } from "next/navigation";
import DashboardShell from "../../components/dashboard-shell";
import OnboardingTutorial from "../../components/onboarding-tutorial";
import { getSession } from "../../lib/auth/session";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if (!user.human_verified) redirect("/human-verification");
  if (
    user.onboarding_required &&
    user.identity_verification_status !== "verified"
  )
    redirect("/identity-verification");
  return (
    <Localized>
      {
        <DashboardShell title={bcText("ui.44e596bb7da422b6")}>
          <OnboardingTutorial replay={(await searchParams).replay === "1"} />
        </DashboardShell>
      }
    </Localized>
  );
}
