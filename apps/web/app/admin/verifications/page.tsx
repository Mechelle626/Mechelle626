import { message as bcText } from "../../../lib/i18n/source";
import { Localized } from '../../../components/localization';
import DashboardShell from "../../../components/dashboard-shell";
import AdminVerifications from "../../../components/admin-verifications";
import { requireAdmin } from "../../../lib/platform/access";
import { AuthError } from "../../../lib/auth/security";
import { redirect } from "next/navigation";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.status === 401) redirect("/login");
      return (
        <Localized>{<DashboardShell title={bcText("ui.64dbd25f2f7fe189")}>
          <p role="alert">{error.message}</p>
          <Link href="/settings">{bcText("ui.92ceebb5bdb99394")}</Link>
          <p>{" " + bcText("ui.56f19da94466040c") + " "}</p>
        </DashboardShell>}</Localized>
      );
    }
    throw error;
  }
  return (
    <Localized>{<DashboardShell
      title={bcText("ui.049878cac12edd01")}
      description={bcText("ui.9e46f0b81df5524f")}
    >
      <AdminVerifications />
    </DashboardShell>}</Localized>
  );
}
