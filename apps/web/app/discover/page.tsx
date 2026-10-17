import { message as bcText } from "../../lib/i18n/source";
import { Localized } from "../../components/localization";
import { redirect } from "next/navigation";
import DashboardShell from "../../components/dashboard-shell";
import FeatureDiscovery from "../../components/feature-discovery";
import { getSession } from "../../lib/auth/session";
import { tutorialStatus } from "../../lib/onboarding/discovery";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (
    user.onboarding_required &&
    user.identity_verification_status === "verified" &&
    (await tutorialStatus(user.id)).status === "not_started"
  )
    redirect("/tutorial");
  return (
    <Localized>
      {
        <DashboardShell
          allowUnverified
          title={bcText("ui.4bdcb9d40fe7ab25")}
          description={bcText("ui.d4ceb51a7b0b9824")}
        >
          <FeatureDiscovery />
        </DashboardShell>
      }
    </Localized>
  );
}
