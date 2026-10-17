import { message as bcText } from "../../../lib/i18n/source";
import { activatedPage } from "../../../lib/onboarding/page-guard";
import { Localized } from "../../../components/localization";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import DashboardShell from "../../../components/dashboard-shell";
import FeaturePanel from "../../../components/feature-panel";
import {
  accessFor,
  allowed,
  features,
  type Feature,
} from "../../../lib/platform/access";
import { getSession } from "../../../lib/auth/session";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const feature = (await params).feature as Feature;
  if (!features.includes(feature)) notFound();
  await activatedPage();
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.email_verified_at) redirect("/verify-email");
  if (!user.human_verified) redirect("/human-verification");
  const access = await accessFor(user.id);
  const titles: Record<Feature, string> = {
    marketplace: bcText("ui.c608981d8d68fa4f"),
    themes: bcText("ui.ecec491acbcb7ac6"),
    "study-buddies": bcText("ui.9f6cbf8443bddcb1"),
    analytics: bcText("ui.b104b71a1af57f1c"),
    matching: bcText("ui.4b883c6e3b68e95b"),
    selling: bcText("ui.b461b7d87a9a5bd4"),
    tutors: bcText("ui.d849254bf4a0ea0b"),
  };
  return (
    <Localized>
      {
        <DashboardShell title={titles[feature]}>
          {allowed(feature, access) ? (
            feature === "marketplace" || feature === "selling" ? (
              <Link href="/marketplace">{bcText("ui.06a6bd7339c33189")}</Link>
            ) : (
              <FeaturePanel feature={feature} />
            )
          ) : (
            <section className="panel">
              <h2>{bcText("ui.d27df137f79b64ad")}</h2>
              <p>
                {["matching", "tutors", "selling"].includes(feature)
                  ? bcText("ui.971f032f33e033f1")
                  : bcText("ui.4167e65b73b6b388")}
              </p>
              <div className="button-row">
                <Link className="secondary-button" href="/school-verification">{" " + bcText("ui.aedfff7efc5d9f59") + " "}</Link>
                <Link className="primary-button" href="/subscription">{" " + bcText("ui.7ca620a1d2b2f15c") + " "}</Link>
              </div>
            </section>
          )}
        </DashboardShell>
      }
    </Localized>
  );
}
