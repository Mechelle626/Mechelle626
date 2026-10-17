import { message as bcText } from "../lib/i18n/source";
import Link from 'next/link';
import {Localized} from '../components/localization';
export default function NotFound(){return <Localized><main className="dashboard-page"><h1>{bcText("ui.a469ab4ca4e55bf5")}</h1><p>{bcText("ui.d631d5cd18101cfd")}</p><Link href="/">{bcText("ui.bbcc935e4263ac40")}</Link></main></Localized>;}
