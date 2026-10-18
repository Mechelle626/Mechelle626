import { test } from "node:test";
import assert from "node:assert/strict";
import { verificationJourney } from "../apps/web/lib/onboarding/journey";

test("registration and verification progress never unlocks later steps prematurely", () => {
  assert.deepEqual(
    verificationJourney(null).map((s) => s.state),
    ["current", "locked", "locked", "locked"],
  );
  const user = {
    email_verified_at: null,
    human_verified: true,
    school_verified: true,
    onboarding_required: true,
    identity_verification_status: "verified",
  };
  assert.deepEqual(
    verificationJourney(user).map((s) => s.state),
    ["complete", "current", "locked", "locked"],
  );
  for (const status of [
    "not_started",
    "pending_review",
    "under_review",
    "rejected",
    "additional_information_required",
  ]) {
    const steps = verificationJourney({
      ...user,
      email_verified_at: "2026-10-18",
      identity_verification_status: status,
    });
    assert.equal(steps[3].state, "current", status);
    assert.equal(steps[3].href, "/identity-verification");
  }
  assert.ok(
    verificationJourney({ ...user, email_verified_at: "2026-10-18" }).every(
      (s) => s.state === "complete",
    ),
  );
});

test("legacy accounts retain school-affiliation onboarding instead of identity onboarding", () => {
  const user = {
    email_verified_at: "2026-10-18",
    human_verified: true,
    school_verified: false,
  };
  assert.deepEqual(verificationJourney(user)[3], {
    key: "school",
    href: "/school-verification",
    state: "current",
  });
  assert.equal(
    verificationJourney({ ...user, school_verified: true })[3].state,
    "complete",
  );
});
