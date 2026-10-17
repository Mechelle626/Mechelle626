import { localizedMetadata } from '../lib/i18n/metadata';
import { message as bcText } from "../lib/i18n/source";
import { Localized } from "../components/localization";
import Landing from "../components/landing";
const metadata = { title: bcText("ui.1dbe3169c6b5095f") };
export default function Home() {
  return <Localized>{<Landing />}</Localized>;
}

export async function generateMetadata(){return localizedMetadata(metadata);}
