import JourneyView from "./onboarding-journey-view";
import type { FlowUser } from "../lib/onboarding/flow";

// Keep email, identifiers, and other session fields out of the client props.
export default function OnboardingJourney({ user }: { user: FlowUser | null }) {
  return (
    <JourneyView
      user={
        user
          ? {
              email_verified_at: user.email_verified_at ? "verified" : null,
              human_verified: user.human_verified,
              school_verified: user.school_verified,
              onboarding_required: user.onboarding_required,
              identity_verification_status: user.identity_verification_status,
            }
          : null
      }
    />
  );
}
