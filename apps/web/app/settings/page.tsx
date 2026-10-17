import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import DashboardShell from "../../components/dashboard-shell";
import AccountSettings from "../../components/account-settings";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Localized>{<DashboardShell
      title={bcText("ui.a587aa1f4ffc5016")}
      description={bcText("ui.34f908b94e2fbc38")}
    >
      <AccountSettings />
    </DashboardShell>}</Localized>
  );
}
