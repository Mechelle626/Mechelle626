"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useState } from "react";
import Link from "next/link";
export default function TwoFactorForm() {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Localized>
      {
        <div className="auth-form-wrap">
          <h2>{bcText("ui.378404cde636c901")}</h2>
          <p className="form-description">{" " + bcText("ui.95531f7405825d14") + " "}</p>
          {error && (
            <p role="alert" className="message error-message">
              {error}
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth/two-factor", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                window.location.assign(data.next);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <div className="field">
              <label htmlFor="two-factor-code">{" " + bcText("ui.322eeecc352ded66") + " "}</label>
              <input
                id="two-factor-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                required
                minLength={6}
                maxLength={40}
                disabled={busy}
              />
            </div>
            <button className="primary-button" disabled={busy}>
              {busy ? bcText("ui.ec963ffc911b8401") : bcText("ui.7a970cb4533f7dd1")}
            </button>
          </form>
          <Link href="/login" className="school-inline-button">{" " + bcText("ui.cf00ad59c7cef67b") + " "}</Link>
          <p className="verification-hint">{" " + bcText("ui.b7c87ade70960c38") + " "}</p>
        </div>
      }
    </Localized>
  );
}
