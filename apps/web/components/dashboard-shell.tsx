import { message as bcText } from "../lib/i18n/source";
import { Localized } from "./localization";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "./auth-shell";
import { LogoutButton } from "./session-manager";
import { getSession } from "../lib/auth/session";
export default async function DashboardShell({
  children,
  title,
  description,
  allowUnverified = false,
}: {
  children: React.ReactNode;
  title: React.ReactNode;
  description?: string;
  allowUnverified?: boolean;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!allowUnverified && !user.email_verified_at) redirect("/verify-email");
  return (
    <Localized>
      {
        <main className="dashboard-page">
          <header className="dashboard-header">
            <Brand />
            <LogoutButton />
          </header>
          <div className="dashboard-layout">
            <nav className="dashboard-nav" aria-label={bcText("ui.32f27adf71be7642")}>
              {[
                ["/account", bcText("ui.d4b1ea5708dd5329")],
                ["/discover", bcText("ui.ba0ca693b2e040b3")],
                ["/tutorial", bcText("ui.ae6a04dfd84a96b8")],
                [`/profiles/${user.username}`, bcText("ui.271c62fa2debe2d2")],
                ["/posts", bcText("ui.a80811cf68891506")],
                ["/messages", bcText("ui.04d7b48339271ea6")],
                ["/marketplace", bcText("ui.c608981d8d68fa4f")],
                ["/features/matching", bcText("ui.399f1fc2908b6b63")],
                ["/features/tutors", bcText("ui.d849254bf4a0ea0b")],
                ["/features/themes", bcText("ui.f480024e349cc4a9")],
                ["/features/analytics", bcText("ui.94c116ee118a7299")],
                ["/billing", bcText("ui.3ac8bbca9a74cfbd")],
                ["/settings", bcText("ui.74a883a037bc227f")],
              ].map(([href, label]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
              {user.is_admin && (
                <>
                  <Link href="/admin/overview">{bcText("ui.bf63fb693f7a583f")}</Link>
                  <Link href="/admin/verifications">{bcText("ui.3e33337bc100d7e3")}</Link>
                  <Link href="/admin/identity">{bcText("ui.99398ad54b9895da")}</Link>
                  <Link href="/admin/localization">{bcText("ui.7f172f7e5696fa16")}</Link>
                </>
              )}
            </nav>
            <section className="dashboard-content">
              <div className="section-marker">
                <span />{" " + bcText("ui.d16bfbd4d6f226f6") + " "}</div>
              <h1>{title}</h1>
              {description && (
                <p className="dashboard-description">{description}</p>
              )}
              {children}
            </section>
          </div>
        </main>
      }
    </Localized>
  );
}
