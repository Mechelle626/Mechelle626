import { Localized } from '../../components/localization';
import { AuthShell } from "../../components/auth-shell";
import TwoFactorForm from "../../components/two-factor-form";
export default function Page() {
  return (
    <Localized>{<AuthShell mode="login">
      <TwoFactorForm />
    </AuthShell>}</Localized>
  );
}
