import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { AuthShell } from "../../components/auth-shell";
import AuthForm from "../../components/auth-form";
const metadata = { title: bcText("ui.bfd402b2f6f38125") };
export default function Page() {
  return (
    <Localized>{<AuthShell mode="login">
      <AuthForm mode="login" />
    </AuthShell>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
