import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import { Brand } from "../../components/auth-shell";
import Pricing from "../../components/pricing";
import Link from "next/link";
const metadata = { title: bcText("ui.86fec62e2b4b0c82") };
export default function Page() {
  return (
    <Localized>{<main className="pricing-page">
      <header className="dashboard-header">
        <Brand />
        <Link href="/login">{bcText("ui.bfd402b2f6f38125")}</Link>
      </header>
      <div className="pricing-intro">
        <div className="section-marker">
          <span />{bcText("ui.03b979ba194cd3a8") + " "}</div>
        <h1>{bcText("ui.c172a4669765873a")}</h1>
        <p>{bcText("ui.5119f71ea6147c08")}</p>
      </div>
      <Pricing />
    </main>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
