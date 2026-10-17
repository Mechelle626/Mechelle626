import { message as bcText } from "../../../lib/i18n/source";
import { Localized } from "../../../components/localization";
import DashboardShell from "../../../components/dashboard-shell";
import AdminIdentity from "../../../components/admin-identity";
import { requireAdmin } from "../../../lib/platform/access";
import { AuthError } from "../../../lib/auth/security";
import { redirect } from "next/navigation";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await requireAdmin();
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    if (e.status === 401) redirect("/login");
    return (
      <Localized>
        {
          <DashboardShell title={bcText("ui.b63d2cb54778fa89")}>
            <p role="alert">{e.message}</p>
            <Link href="/settings">{bcText("ui.92ceebb5bdb99394")}</Link>
          </DashboardShell>
        }
      </Localized>
    );
  }
  return (
    <Localized>
      {
        <DashboardShell
          title={bcText("ui.d7e0bb7fb435874b")}
          description={bcText("ui.386daaf172628529")}
        >
          <AdminIdentity />
        </DashboardShell>
      }
    </Localized>
  );
}
