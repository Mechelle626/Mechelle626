import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from "../../components/localization";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth/session";
import { AuthShell } from "../../components/auth-shell";
import IdentityVerification from "../../components/identity-verification";
export const dynamic = "force-dynamic";
const metadata = { title: bcText("ui.8fd3770076fd5b65") };
export default async function Page() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if (!user.human_verified) redirect("/human-verification");
  return (
    <Localized>
      {
        <AuthShell mode="school-verification">
          <IdentityVerification />
        </AuthShell>
      }
    </Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
