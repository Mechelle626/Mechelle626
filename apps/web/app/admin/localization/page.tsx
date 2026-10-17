import { message as bcText } from "../../../lib/i18n/source";
import { requireAdmin } from '../../../lib/platform/access';
import DashboardShell from '../../../components/dashboard-shell';
import AdminLocalization from '../../../components/admin-localization';
import { AuthError } from '../../../lib/auth/security';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){
 try{await requireAdmin();}catch(e){if(!(e instanceof AuthError))throw e;if(e.status===401)redirect('/login');return <DashboardShell title={bcText("ui.c197f3c4943d72b1")}><p role="alert">{e.message}</p></DashboardShell>;}
 return <DashboardShell title={bcText("ui.7f172f7e5696fa16")} description={bcText("ui.c30abb11f1483c64")}><AdminLocalization/></DashboardShell>;
}
