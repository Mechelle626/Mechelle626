import { localizedMetadata } from '../../lib/i18n/metadata';
import { message as bcText } from "../../lib/i18n/source";
import { Localized } from '../../components/localization';
import {tutorialStatus} from "../../lib/onboarding/discovery";
import Link from "next/link";
import VerificationBadge from "../../components/verification-badge";
import { badgeFor } from "../../lib/platform/access";
import { redirect } from "next/navigation";
import { BadgeCheck, CheckCircle2 } from "lucide-react";
import { getSession } from "../../lib/auth/session";
import { Brand } from "../../components/auth-shell";
import SessionManager, { LogoutButton } from "../../components/session-manager";
const metadata = { title: bcText("ui.dbb5f6371b6a2a67") };
export const dynamic = "force-dynamic";
export default async function Account() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if (!user.human_verified) redirect("/human-verification");
  if (user.onboarding_required && user.identity_verification_status!=="verified") redirect("/identity-verification");
  if (!user.onboarding_required && !user.school_verified) redirect("/school-verification");
  if(user.onboarding_required&&(await tutorialStatus(user.id)).status==="not_started")redirect("/tutorial");
  const badge = await badgeFor(user.id);
  return (
    <Localized>{<main className="account-page">
      <header className="account-header">
        <Brand />
        <LogoutButton />
      </header>
      <div className="account-main">
        <div className="account-intro">
          <div>
            <div className="section-marker">
              <span />{" " + bcText("ui.44fb435937353764") + " "}</div>
            <h1>{bcText("ui.b1371e9b0601e186") + " "}{user.first_name}.</h1>
            <p>{" " + bcText("ui.6ecb149d6547554d") + " "}</p>
          </div>
          <VerificationBadge role={badge} />
        </div>
        <div className="button-row account-links"><Link href="/discover" className="secondary-button">{bcText("ui.ba0ca693b2e040b3")}</Link><Link href="/tutorial" className="secondary-button">{bcText("ui.ae6a04dfd84a96b8")}</Link>
          <Link href="/settings" className="secondary-button">{" " + bcText("ui.a587aa1f4ffc5016") + " "}</Link>
          <Link href="/billing" className="secondary-button">{" " + bcText("ui.3ac8bbca9a74cfbd") + " "}</Link>
          <Link
            href={`/profiles/${user.username}`}
            className="secondary-button"
          >{" " + bcText("ui.271c62fa2debe2d2") + " "}</Link>
          <Link href="/posts" className="secondary-button">{" " + bcText("ui.f0723ed20065498d") + " "}</Link>
          {user.is_admin && (
            <Link href="/admin/verifications" className="secondary-button">{" " + bcText("ui.3e33337bc100d7e3") + " "}</Link>
          )}
        </div>
        <div className="account-grid">
          <section className="account-card">
            <div className="profile-avatar">
              {user.first_name[0]}
              {user.last_name[0]}
            </div>
            <h2>
              {user.first_name} {user.last_name}
            </h2>
            <p>@{user.username}</p>
            <dl className="profile-details">
              {[
                [bcText("ui.969ccbd3cf6300ec"), user.email],
                [bcText("ui.6cd2e331855da821"), user.school],
                [bcText("ui.14736a2eb9f4159f"), user.role],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd data-no-translate>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="account-card">
            <SessionManager />
          </section>
        </div>
        <div className="step-complete">
          <CheckCircle2 size={20} />
          <div>
            <strong>{user.onboarding_required?bcText("ui.364d9c11f5057b11"):bcText("ui.9e93e84d0655aac3")}</strong>
            <br />
            {user.school_verified ? bcText("ui.ed9b9328fe1e6634") : bcText("ui.1969d1ce5fbd2b69")}
          </div>
        </div>
      </div>
    </main>}</Localized>
  );
}

export async function generateMetadata(){return localizedMetadata(metadata);}
