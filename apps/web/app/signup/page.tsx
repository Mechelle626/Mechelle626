import { redirect } from "next/navigation";
import { nextStep } from "../../lib/onboarding/flow";
import { getSession } from "../../lib/auth/session";
import OnboardingJourney from "../../components/onboarding-journey";
import { localizedMetadata } from "../../lib/i18n/metadata";
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from "../../components/localization";
import { AuthShell } from "../../components/auth-shell";
import AuthForm from "../../components/auth-form";
const metadata = { title: bcText("ui.86033f75a4c0876a") };
export default async function Page() {
  const user = await getSession();
  if (user) redirect(nextStep(user));
  return (
    <Localized>
      {
        <AuthShell mode="signup">
          <OnboardingJourney user={user} />
          <AuthForm mode="signup" />
        </AuthShell>
      }
    </Localized>
  );
}

export async function generateMetadata() {
  return localizedMetadata(metadata);
}
