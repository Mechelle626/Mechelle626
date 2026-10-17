"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";
import type { IdentityStatus } from "../lib/onboarding/contracts";
export default function VerificationChecklist({
  checklist,
}: {
  checklist: NonNullable<IdentityStatus["checklist"]>;
}) {
  return (
    <Localized>
      <section
        className="verification-checklist"
        aria-label={bcText("ui.20b3bba05127fed2")}
      >
        <h3>{bcText("ui.20b3bba05127fed2")}</h3>
        <ul>
          {[
            [bcText("ui.74e34ce3509b7e0a"), checklist.email],
            [bcText("ui.1e6245ed2a0c81e3"), checklist.human],
            [bcText("ui.10995126cca2f650"), checklist.selfie],
            [bcText("ui.80fbdefc873c5ffd"), checklist.document],
            [bcText("ui.d51daadf1c2c0468"), checklist.scanned],
            [bcText("ui.bb03603ba6791c10"), checklist.approved],
          ].map(([label, done]) => (
            <li key={String(label)} data-complete={Boolean(done)}>
              <span aria-hidden="true">{done ? "✓" : "○"} </span>
              {label} —{" "}
              {done
                ? bcText("ui.143b270a32602d41")
                : bcText("ui.4850b174b713d88c")}
            </li>
          ))}
        </ul>
        <p>{bcText("ui.84b745202ad0f0c5")}</p>
      </section>
    </Localized>
  );
}
