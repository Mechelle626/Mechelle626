import { message as bcText } from "../i18n/source";
import { db } from "../auth/db";
import { accessFor, allowed } from "../platform/access";
import { requireIdentity } from "./flow";
export { tutorialSteps } from "./tutorial";

export async function discover(userId: string) {
  const access = await accessFor(userId);
  const user = (
    await db.query(
      "SELECT role,email_verified_at,human_verified,onboarding_required,identity_verification_status FROM braincraze.users WHERE id=$1",
      [userId],
    )
  ).rows[0];
  const identityReady =
    Boolean(user.email_verified_at) &&
    user.human_verified &&
    (!user.onboarding_required ||
      user.identity_verification_status === "verified");
  const entries = [
    { name: bcText("ui.67b696468610b879"), href: "/account", implemented: true },
    {
      name: bcText("ui.bdf86fd62ef70619"),
      href: "/settings",
      implemented: true,
      beforeActivation: true,
    },
    { name: bcText("ui.e3b995d4683ace64"), href: "/account", implemented: true },
    { name: bcText("ui.4eff8bea13ea0dad"), href: null, implemented: false },
    { name: bcText("ui.c864f329f5dde534"), href: null, implemented: false },
    { name: bcText("ui.7eafe7f52a028431"), href: "/posts", implemented: true },
    { name: bcText("ui.eebdbb25cbbc7651"), href: "/messages", implemented: true },
    {
      name: bcText("ui.6239c61aff061d83"),
      href: "/features/matching",
      feature: "matching" as const,
      implemented: true,
    },
    {
      name: bcText("ui.c608981d8d68fa4f"),
      href: "/marketplace",
      feature: "marketplace" as const,
      implemented: true,
    },
    {
      name: bcText("ui.012e7d7b4a0f5d42"),
      href: "/marketplace",
      feature: "selling" as const,
      implemented: true,
    },
    {
      name: bcText("ui.184b02303005a13b"),
      href: "/features/tutors",
      feature: "tutors" as const,
      implemented: true,
    },
    {
      name: bcText("ui.75c0e0321bd436f8"),
      href: "/features/themes",
      feature: "themes" as const,
      implemented: true,
    },
    {
      name: bcText("ui.8c76afefde5e77a4"),
      href: "/features/study-buddies",
      feature: "study-buddies" as const,
      implemented: true,
    },
    {
      name: bcText("ui.94c116ee118a7299"),
      href: "/features/analytics",
      feature: "analytics" as const,
      implemented: true,
    },
    { name: "GPA Tools", href: null, implemented: false },
    { name: bcText("ui.d99968badbd9baee"), href: null, implemented: false },
  ];
  return {
    accountType: user.role,
    ...access,
    identityReady,
    verificationNext: !user.email_verified_at
      ? "/verify-email"
      : !user.human_verified
        ? "/human-verification"
        : "/identity-verification",
    features: entries.map((x) => ({
      ...x,
      available:
        x.implemented &&
        (identityReady ||
          ("beforeActivation" in x &&
            x.beforeActivation &&
            Boolean(user.email_verified_at))) &&
        (!("feature" in x) || allowed(x.feature!, access)),
      lock: !x.implemented
        ? "coming_soon"
        : !identityReady &&
            !(
              "beforeActivation" in x &&
              x.beforeActivation &&
              Boolean(user.email_verified_at)
            )
          ? "identity"
          : "feature" in x && !allowed(x.feature!, access)
            ? ["matching", "tutors"].includes(x.feature!)
              ? "verification"
              : x.feature === "selling" && !access.verified
                ? "premium_and_verification"
                : "premium"
            : null,
    })),
  };
}
export async function tutorialStatus(userId: string) {
  await requireIdentity(userId);
  return (
    (
      await db.query(
        "SELECT tutorial_step AS step,tutorial_status AS status FROM braincraze.onboarding_progress WHERE user_id=$1",
        [userId],
      )
    ).rows[0] ?? { step: 0, status: "not_started" }
  );
}
