import { message as bcText } from "../../../lib/i18n/source";
import DashboardShell from '../../../components/dashboard-shell';
import AdminOverview from '../../../components/admin-overview';
import {Localized} from '../../../components/localization';
import {requireAdmin} from '../../../lib/platform/access';
import {AuthError} from '../../../lib/auth/security';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){try{await requireAdmin();}catch(e){if(!(e instanceof AuthError))throw e;if(e.status===401)redirect('/login');return <Localized><DashboardShell title={bcText("ui.64dbd25f2f7fe189")}><p role="alert">{e.message}</p></DashboardShell></Localized>;}
return <Localized><DashboardShell title={bcText("ui.bf63fb693f7a583f")} description={bcText("ui.a349d1c31b5a10f1")}><AdminOverview/></DashboardShell></Localized>;}
