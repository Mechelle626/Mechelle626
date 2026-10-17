import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { redirect } from "next/navigation";
import { AuthShell } from "../../components/auth-shell";
import SchoolVerification from "../../components/school-verification";
import { getSession } from "../../lib/auth/session";
const metadata = { title: bcText("ui.eb04326b79eb70ce") };
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if (!user.human_verified) redirect("/human-verification");
  return (
    <Localized>{<AuthShell mode="school-verification">
      <SchoolVerification />
    </AuthShell>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
