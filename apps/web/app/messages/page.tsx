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
  return (
    <Localized>
      {
        <DashboardShell
          title={bcText("ui.04d7b48339271ea6")}
          description={bcText("ui.ad30988688e1ce42")}
        >
          <CommunityFeed kind="messages" />
        </DashboardShell>
      }
    </Localized>
  );
}
