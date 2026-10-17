"use client";
import VerificationChecklist from "./verification-checklist";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useState } from "react";
import Link from "next/link";
import { statusLabels, type IdentityStatus } from "../lib/onboarding/contracts";
import { LanguageSelector } from "./localization";
export default function IdentitySettings() {
  const [status, setStatus] = useState<IdentityStatus | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/onboarding/identity/status", { cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setStatus(v);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <Localized>
      {
        <>
          <section className="panel preferences-panel">
            <h2>{bcText("ui.fecdc1f70c03ff2b")}</h2>
            <LanguageSelector />
            <p className="verification-hint">{" " + bcText("ui.37932d43483fccd0") + " "}</p>
          </section>
          <section className="panel">
            <h2>{bcText("ui.11c4c9beeb1da7ae")}</h2>
            {error && <p role="alert">{error}</p>}
            <p>{" " + bcText("ui.1619f2350ed73066")}{" "}
              {status ? statusLabels[status.status] : bcText("ui.ba3bbbe10d8bef66")}
            </p>
            <p>{" " + bcText("ui.30b024daf9712e6f")}{" "}
              {status ? statusLabels[status.selfieStatus] : bcText("ui.ba3bbbe10d8bef66")}
            </p>
            {status?.checklist && (status.required || status.request) && <VerificationChecklist checklist={status.checklist} />}
            {status?.request?.notes && (
              <p>{bcText("ui.e80a40e616ea5c44") + " "}{status.request.notes}</p>
            )}
            <div className="button-row">
              <Link href="/identity-verification" className="secondary-button">{" " + bcText("ui.3980180bf4ef3e0e") + " "}</Link>
              <Link href="/discover" className="secondary-button">{" " + bcText("ui.ba0ca693b2e040b3") + " "}</Link>
              <Link href="/tutorial?replay=1" className="secondary-button">{" " + bcText("ui.5a995794c346374b") + " "}</Link>
            </div>
          </section>
        </>
      }
    </Localized>
  );
}
