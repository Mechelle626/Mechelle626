import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import DashboardShell from "../../components/dashboard-shell";
import BillingDashboard from "../../components/billing-dashboard";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Localized>{<DashboardShell
      title={bcText("ui.75bc7b6f6f7181c0")}
      description={bcText("ui.28cb206957afb02c")}
    >
      <BillingDashboard />
    </DashboardShell>}</Localized>
  );
}
