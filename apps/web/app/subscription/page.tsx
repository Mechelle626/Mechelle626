import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { getSession } from "../../lib/auth/session";
import { accessFor } from "../../lib/platform/access";
import DashboardShell from "../../components/dashboard-shell";
import Pricing from "../../components/pricing";
import { billingConfigured } from "../../lib/platform/billing";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getSession();
  const premium = user ? (await accessFor(user.id)).premium : false;
  return (
    <Localized>{<DashboardShell
      title={bcText("ui.f8bcdfb069e9159c")}
      description={bcText("ui.9ea95b5e5f7f31e1")}
    >
      <Pricing
        selection
        configured={billingConfigured()}
        currentPremium={premium}
      />
    </DashboardShell>}</Localized>
  );
}
