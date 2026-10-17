"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import Link from "next/link";
import LandingSections from "./landing-sections";
import { useState, useEffect } from "react";
import { Brand } from "./auth-shell";
import LocationSearch from "./location-search";
import { useLocale } from "./localization";
export default function Landing() {
  const locale = useLocale(),
    [region, setRegion] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/onboarding/preferences")
      .then((r) => r.json())
      .then((value) => {
        if (value.region) setRegion(value.region);
      })
      .catch(() => {});
  }, []);
  async function saveRegion() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/onboarding/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: locale, region }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setNotice(bcText("ui.8be9247439651f9a"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Localized>
      {
        <main className="landing-page">
          <header className="dashboard-header">
            <Brand />
            <Link href="/pricing">{bcText("ui.0dfa4d31974334ba")}</Link>
          </header>
          <div className="landing-grid">
            <section>
              <div className="section-marker">
                <span />{" " + bcText("ui.2487e6c635b9e015") + " "}</div>
              <h1>{" " + bcText("ui.052875bc6a83acff") + " "}<br />{bcText("ui.55c6b6913d9e5430") + " "}</h1>
              <p>{" " + bcText("ui.d797dca2290ab906") + " "}</p>
              <div className="landing-actions">
                <Link className="primary-button" href="/login">{" " + bcText("ui.9d6322c1f4d9d3f3") + " "}</Link>
                <Link className="secondary-button" href="/signup">{" " + bcText("ui.0dffe234b44793b6") + " "}</Link>
              </div>
              <p className="verification-hint">{" " + bcText("ui.16fd1afdcf5083d8") + " "}</p>
            </section>
            <aside className="panel landing-region">
              <h2>{bcText("ui.a0548a894fc4868e")}</h2>
              <p>{" " + bcText("ui.e0187ed7fe98d535") + " "}</p>
              <LocationSearch
                kind="countries"
                initial={region}
                label={bcText("ui.00fba0b3321b57c3")}
                required={false}
                onSelect={(_, text) => setRegion(text)}
              />
              <button
                className="secondary-button"
                disabled={busy || !region}
                onClick={saveRegion}
              >{" " + bcText("ui.273ee03a6f8ce28d") + " "}</button>
              {notice && <p role="status">{notice}</p>}
              {error && <p role="alert">{error}</p>}
              <p className="verification-hint">{" " + bcText("ui.590d4ceebec7d8f9") + " "}</p>
            </aside>
          </div>
          <section className="landing-overview">
            <article>
              <h2>{bcText("ui.81f81a498cfd8ffd")}</h2>
              <p>{bcText("ui.4c20773399895824")}</p>
            </article>
            <article>
              <h2>{bcText("ui.c2d11b471dd4c5db")}</h2>
              <p>{" " + bcText("ui.5deb01fb0aa9eede") + " "}</p>
            </article>
            <article>
              <h2>{bcText("ui.122b53ae3d641d43")}</h2>
              <p>{" " + bcText("ui.2150804df25bfd49") + " "}</p>
            </article>
          </section>
          <LandingSections />
        </main>
      }
    </Localized>
  );
}
