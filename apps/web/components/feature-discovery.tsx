"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useState } from "react";
import Link from "next/link";
export default function FeatureDiscovery() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/onboarding/discovery", { cache: "no-store" });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setData(v);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <Localized>
      {
        <div>
          {error && (
            <p role="alert" className="message error-message">
              {error}
            </p>
          )}
          {!data ? (
            <button className="text-button" onClick={load}>{" " + bcText("ui.98c77e5f6afb9be5") + " "}</button>
          ) : (
            <>
              <div className="discovery-summary">
                <p>
                  <strong>{bcText("ui.dce81c5bf1aafe27")}</strong>: {data.accountType}
                </p>
                <p>
                  <strong>{bcText("ui.c7a08e1d87b69134")}</strong>:{" "}
                  {data.premium ? bcText("ui.de88c121a82a0635") : bcText("ui.f411a1fb62758b4c")}
                </p>
                <p>
                  <strong>{bcText("ui.3417084e23f0c19a")}</strong>:{" "}
                  {data.verified
                    ? bcText("ui.bafb5817daecaf56")
                    : data.identityReady
                      ? bcText("ui.ba9537b766e27323")
                      : bcText("ui.e1d03c3056d423d0")}
                </p>
              </div>
              {!data.identityReady && (
                <Link href={data.verificationNext} className="primary-button">{" " + bcText("ui.86bc9739512f15d6") + " "}</Link>
              )}
              <div className="feature-legend">
                <span>{bcText("ui.6235e50c8efe1fe3")}</span>
                <span>{bcText("ui.ef84d99e9b92e96c")}</span>
                <span>{bcText("ui.479e6117180d4db6")}</span>
              </div>
              <div className="discovery-grid">
                {data.features.map((feature: any) => (
                  <article className="panel discovery-card" key={feature.name}>
                    <h2>{feature.name}</h2>
                    <p>
                      {feature.available
                        ? bcText("ui.53d7e9435cfbf9b7")
                        : feature.lock === "coming_soon"
                          ? bcText("ui.4f7d64017689437e")
                          : feature.lock === "premium"
                            ? bcText("ui.ef539e52442fa37c")
                            : feature.lock === "premium_and_verification"
                              ? bcText("ui.9bce20e05e503109")
                              : bcText("ui.1ad33cc16dc8ae47")}
                    </p>
                    {feature.available && feature.href ? (
                      <Link className="secondary-button" href={feature.href}>{" " + bcText("ui.8e27c3f9922f07d2") + " "}</Link>
                    ) : feature.lock === "premium" ? (
                      <Link href="/subscription">{bcText("ui.fce9826f06ef86e4")}</Link>
                    ) : (
                      feature.lock !== "coming_soon" && (
                        <Link
                          href={
                            feature.lock === "identity"
                              ? data.verificationNext
                              : "/school-verification"
                          }
                        >{" " + bcText("ui.00a36f40c96b7265") + " "}</Link>
                      )
                    )}
                  </article>
                ))}
              </div>
              {data.identityReady && (
                <Link href="/tutorial?replay=1" className="secondary-button">{" " + bcText("ui.5a995794c346374b") + " "}</Link>
              )}
            </>
          )}
        </div>
      }
    </Localized>
  );
}
