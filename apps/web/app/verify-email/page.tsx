import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth/session";
import OnboardingJourney from "../../components/onboarding-journey";
import { localizedMetadata } from "../../lib/i18n/metadata";
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from "../../components/localization";
import { AuthShell } from "../../components/auth-shell";
import EmailVerification from "../../components/email-verification";
const metadata = { title: bcText("ui.bb265946234feb98") };
export default async function Page() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <Localized>
      {
        <AuthShell mode="verify-email">
          <OnboardingJourney user={user} />
          <EmailVerification />
        </AuthShell>
      }
    </Localized>
  );
}

export async function generateMetadata() {
  return localizedMetadata(metadata);
}
