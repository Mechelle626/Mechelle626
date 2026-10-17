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
    { name: "Dashboard", href: "/account", implemented: true },
    {
      name: "Profile Customization",
      href: "/settings",
      implemented: true,
      beforeActivation: true,
    },
    { name: "Basic Study Buddy", href: "/account", implemented: true },
    { name: "Note Sharing", href: null, implemented: false },
    { name: "Communities", href: null, implemented: false },
    { name: "Campus posts", href: "/posts", implemented: true },
    { name: "Messaging", href: "/messages", implemented: true },
    {
      name: "Study Partner Matching",
      href: "/features/matching",
      feature: "matching" as const,
      implemented: true,
    },
    {
      name: "Marketplace",
      href: "/marketplace",
      feature: "marketplace" as const,
      implemented: true,
    },
    {
      name: "Marketplace Selling",
      href: "/marketplace",
      feature: "selling" as const,
      implemented: true,
    },
    {
      name: "Tutor Listings",
      href: "/features/tutors",
      feature: "tutors" as const,
      implemented: true,
    },
    {
      name: "Advanced Themes",
      href: "/features/themes",
      feature: "themes" as const,
      implemented: true,
    },
    {
      name: "Study Buddy Skins",
      href: "/features/study-buddies",
      feature: "study-buddies" as const,
      implemented: true,
    },
    {
      name: "Analytics",
      href: "/features/analytics",
      feature: "analytics" as const,
      implemented: true,
    },
    { name: "GPA Tools", href: null, implemented: false },
    { name: "Club Finder", href: null, implemented: false },
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
