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
          title={bcText("ui.7eafe7f52a028431")}
          description={bcText("ui.284f1d52d4691a2e")}
        >
          <CommunityFeed kind="posts" />
        </DashboardShell>
      }
    </Localized>
  );
}
