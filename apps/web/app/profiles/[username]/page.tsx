import { message as bcText } from "../../../lib/i18n/source";
import { activatedPage } from "../../../lib/onboarding/page-guard";
import { Localized } from "../../../components/localization";
import { redirect } from "next/navigation";
import DashboardShell from "../../../components/dashboard-shell";
import VerificationBadge, {
  PremiumBadge,
} from "../../../components/verification-badge";
import { getSession } from "../../../lib/auth/session";
import { profile } from "../../../lib/platform/profiles";
import { AuthError } from "../../../lib/auth/security";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if ((await params).username !== user.username) await activatedPage();
  let person;
  try {
    person = await profile((await params).username, user.id);
  } catch (e) {
    if (!(e instanceof AuthError)) throw e;
    return (
      <Localized>
        {
          <DashboardShell title={bcText("ui.158e5a22a48cd4b0")}>
            <p>{bcText("ui.c29957075a95f3e1")}</p>
          </DashboardShell>
        }
      </Localized>
    );
  }
  return (
    <Localized>
      {
        <DashboardShell
          title={
            <span data-no-translate>
              {person.first_name} {person.last_name}
            </span>
          }
        >
          <article className={bcText("ui.37271b5f631b1a52", [person.theme])}>
            {person.has_banner && (
              <img
                className="profile-banner"
                src={`/api/platform/media/${person.username}/banner`}
                alt={bcText("ui.82d4157c10f50b63")}
              />
            )}
            {person.has_picture && (
              <img
                className="settings-avatar"
                src={`/api/platform/media/${person.username}/picture`}
                alt={bcText("ui.314e62e093009165", [person.first_name])}
              />
            )}
            <h2 data-no-translate>@{person.username}</h2>
            <div className="badge-row">
              <VerificationBadge role={person.badge} />
              <PremiumBadge premium={person.premium} />
            </div>
            <p>{person.verified_school}</p>
            {person.bio ? (
              <p className="content-body" data-no-translate>
                {person.bio}
              </p>
            ) : (
              <p>{bcText("ui.c7eaed60aca3ac48")}</p>
            )}
            <p>{" " + bcText("ui.950e7a3b6fad08c0")}{" "}
              {person.buddy_skin === "fox"
                ? "🦊"
                : person.buddy_skin === "owl"
                  ? "🦉"
                  : "🌱"}
            </p>
          </article>
        </DashboardShell>
      }
    </Localized>
  );
}
