import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { AuthShell } from "../../components/auth-shell";
import AuthForm from "../../components/auth-form";
const metadata = { title: bcText("ui.e0edfeb3a71a1002") };
export default function Page() {
  return (
    <Localized>{<AuthShell mode="reset-password">
      <AuthForm mode="reset-password" />
    </AuthShell>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
