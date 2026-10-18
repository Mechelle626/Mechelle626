import type { FlowUser } from "./flow";

export type JourneyStep = {
  key: "account" | "email" | "human" | "identity" | "school";
  href: string;
  state: "complete" | "current" | "locked";
};

// Display only. Authorization remains in the server guards and API handlers.
// Sequential completion prevents an inconsistent record from unlocking later steps.
export function verificationJourney(user: FlowUser | null): JourneyStep[] {
  const email = Boolean(user?.email_verified_at);
  const human = email && Boolean(user?.human_verified);
  const legacy = user !== null && !user.onboarding_required;
  const finished =
    human &&
    (legacy
      ? Boolean(user.school_verified)
      : user?.identity_verification_status === "verified");
  const steps = [
    { key: "account" as const, href: "/signup", done: Boolean(user) },
    { key: "email" as const, href: "/verify-email", done: email },
    { key: "human" as const, href: "/human-verification", done: human },
    {
      key: legacy ? ("school" as const) : ("identity" as const),
      href: legacy ? "/school-verification" : "/identity-verification",
      done: finished,
    },
  ];
  let blocked = false;
  return steps.map(({ done, ...step }) => {
    const state = blocked ? "locked" : done ? "complete" : "current";
    if (!done) blocked = true;
    return { ...step, state };
  });
}
