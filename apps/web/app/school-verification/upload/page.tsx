import { localizedMetadata } from '../../../lib/i18n/metadata';
import { message as bcText } from "../../../lib/i18n/source";
import { Localized } from '../../../components/localization';
import { redirect } from "next/navigation";
import { AuthShell } from "../../../components/auth-shell";
import UploadSchoolId from "../../../components/upload-school-id";
import { getSession } from "../../../lib/auth/session";
const metadata = { title: bcText("ui.448f206a704f8791") };
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if (!user.human_verified) redirect("/human-verification");
  return <Localized>{<AuthShell mode="school-verification"><UploadSchoolId /></AuthShell>}</Localized>;
}

export async function generateMetadata(){return localizedMetadata(metadata);}
