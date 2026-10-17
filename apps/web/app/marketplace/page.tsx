import { message as bcText } from "../../lib/i18n/source";
import { activatedPage } from "../../lib/onboarding/page-guard";
import { Localized } from "../../components/localization";
import DashboardShell from "../../components/dashboard-shell";
import CommunityFeed from "../../components/community-feed";
import { getSession } from "../../lib/auth/session";
import { accessFor, allowed } from "../../lib/platform/access";
import { redirect } from "next/navigation";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Page() {
  await activatedPage();
  const user = await getSession();
  if (!user) redirect("/login");
  const access = await accessFor(user.id);
  if (!allowed("marketplace", access))
    return (
      <Localized>
        {
          <DashboardShell title={bcText("ui.c608981d8d68fa4f")}>
            <div className="panel">
              <h2>{bcText("ui.44341ef56457b52b")}</h2>
              <p>{bcText("ui.65f1b589d19e53b7")}</p>
              <Link href="/subscription" className="primary-button">{" " + bcText("ui.a72e2bd3e148c05e") + " "}</Link>
            </div>
          </DashboardShell>
        }
      </Localized>
    );
  return (
    <Localized>
      {
        <DashboardShell
          title={bcText("ui.52a7d871d09520d9")}
          description={bcText("ui.6e5d491f48fac7cc")}
        >
          <CommunityFeed kind="listings" />
        </DashboardShell>
      }
    </Localized>
  );
}
