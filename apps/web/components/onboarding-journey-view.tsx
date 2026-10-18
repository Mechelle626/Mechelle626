"use client";
import { Localized } from "./localization";
import Link from "next/link";
import { message as text } from "../lib/i18n/source";
import type { FlowUser } from "../lib/onboarding/flow";
import { verificationJourney } from "../lib/onboarding/journey";

export default function JourneyView({ user }: { user: FlowUser | null }) {
  const status = user?.identity_verification_status;
  const notice =
    user?.email_verified_at && user.human_verified && user.onboarding_required
      ? status === "pending_review" || status === "under_review"
        ? "pending"
        : status === "rejected"
          ? "rejected"
          : status === "additional_information_required"
            ? "more"
            : null
      : null;
  return (
    <Localized>
      <nav
        className="onboarding-journey"
        aria-label={text("onboarding.journey.title")}
      >
        <h2>{text("onboarding.journey.title")}</h2>
        <ol>
          {verificationJourney(user).map((step) => (
            <li
              key={step.key}
              data-state={step.state}
              aria-current={step.state === "current" ? "step" : undefined}
            >
              {step.state === "current" ? (
                <Link href={step.href}>
                  {text(`onboarding.journey.${step.key}`)}
                </Link>
              ) : (
                <span>{text(`onboarding.journey.${step.key}`)}</span>
              )}
              <small>
                {text(
                  `onboarding.journey.${step.state === "complete" ? "complete" : step.state === "current" ? "current" : "locked"}`,
                )}
              </small>
            </li>
          ))}
        </ol>
        {notice && <p role="status">{text(`onboarding.journey.${notice}`)}</p>}
        {!user && <p>{text("onboarding.journey.notice")}</p>}
      </nav>
    </Localized>
  );
}
