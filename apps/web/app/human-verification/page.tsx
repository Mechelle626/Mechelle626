import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth-shell";
import HumanVerification from "../../components/human-verification";
import { getSession } from "../../lib/auth/session";
const metadata = { title: bcText("ui.5c608a9673934709") };
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  return (
    <Localized>{<AuthShell mode="human-verification">
      <HumanVerification identityRequired={Boolean(user.onboarding_required)}/>
    </AuthShell>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
