import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { AuthShell } from "../../components/auth-shell";
import AuthForm from "../../components/auth-form";
const metadata = { title: bcText("ui.86033f75a4c0876a") };
export default function Page() {
  return (
    <Localized>{<AuthShell mode="signup">
      <AuthForm mode="signup" />
    </AuthShell>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
