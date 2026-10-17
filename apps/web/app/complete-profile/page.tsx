import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { AuthShell } from "../../components/auth-shell";
import AuthForm from "../../components/auth-form";
const metadata = { title: bcText("ui.e6c40677fe50e778") };
export default function Page() {
  return (
    <Localized>{<AuthShell mode="complete-profile">
      <AuthForm mode="complete-profile" />
    </AuthShell>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
