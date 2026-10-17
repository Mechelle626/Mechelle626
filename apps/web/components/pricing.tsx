"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useFormatLocale } from "./localization";
import { useState } from "react";
import Link from "next/link";
import { api } from "./platform-client";
export default function Pricing({
  selection = false,
  configured = false,
  currentPremium = false,
}: {
  selection?: boolean;
  configured?: boolean;
  currentPremium?: boolean;
}) {
  const locale = useFormatLocale();
  const money = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(amount);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function select() {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ url: string }>("billing/checkout", { cycle });
      window.location.assign(data.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Localized>
      {
        <div className="pricing-wrap">
          <div className="plan-toggle" role="group" aria-label={bcText("ui.d69f731e32331266")}>
            <button
              aria-pressed={cycle === "monthly"}
              onClick={() => setCycle("monthly")}
              disabled={busy}
            >{" " + bcText("ui.9b11f6b707d2a03e") + " "}</button>
            <button
              aria-pressed={cycle === "yearly"}
              onClick={() => setCycle("yearly")}
              disabled={busy}
            >{" " + bcText("ui.6e69b59ed34d42ef") + " "}</button>
          </div>
          {error && (
            <p role="alert" className="message error-message">
              {error}
            </p>
          )}
          {selection && !configured && (
            <p className="local-note">{" " + bcText("ui.ba94e9f89e75c1bb") + " "}</p>
          )}
          <div className="plan-grid">
            <article className="plan-card">
              <span className="eyebrow">{bcText("ui.75259b5e83748263")}</span>
              <h2>{bcText("ui.f411a1fb62758b4c")}</h2>
              <p className="plan-price">
                {money(0)}
                <span>{" " + bcText("ui.06166a3dc810d829")}</span>
              </p>
              <ul>
                {[
                  bcText("ui.471e7b5da73edef6"),
                  bcText("ui.e3b995d4683ace64"),
                  bcText("ui.034ae56b3b55c3c6"),
                  bcText("ui.af15b3bc70f06415"),
                  bcText("ui.48d44e825ef72a6e"),
                ].map((x) => (
                  <li key={x}>
                    {x.includes(bcText("ui.62bfdf0b726cbcc5")) ? "○" : "✓"} {x}
                  </li>
                ))}
              </ul>
              <Link
                className="secondary-button"
                href={
                  selection
                    ? currentPremium
                      ? "/billing"
                      : "/account"
                    : "/signup"
                }
              >
                {selection
                  ? currentPremium
                    ? bcText("ui.825d199408f1fd7e")
                    : bcText("ui.4c7d1ed214a0dd3c")
                  : bcText("ui.db14ef13b26907e3")}
              </Link>
              <p className="verification-hint">{" " + bcText("ui.cf3230fad05dbd37") + " "}</p>
            </article>
            <article className="plan-card premium-plan">
              <span className="eyebrow">{bcText("ui.e804cdd4955735df")}</span>
              <h2>{bcText("ui.de88c121a82a0635")}</h2>
              <p className="plan-price">
                {money(cycle === "monthly" ? 7.99 : 69.99)}
                <span> / {cycle === "monthly" ? "month" : "year"}</span>
              </p>
              <ul>
                {[
                  bcText("ui.407e92c73b158848"),
                  bcText("ui.75c0e0321bd436f8"),
                  bcText("ui.8c76afefde5e77a4"),
                  bcText("ui.408969cfded72b77"),
                  bcText("ui.94c116ee118a7299"),
                  bcText("ui.a944a9a201c6c42f"),
                ].map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
              </ul>
              {selection && currentPremium ? (
                <Link href="/billing" className="primary-button">{" " + bcText("ui.f7adc5b439102d24") + " "}</Link>
              ) : selection ? (
                <button
                  className="primary-button"
                  disabled={busy || !configured}
                  onClick={select}
                >
                  {busy ? bcText("ui.8d15b0fbf84af930") : bcText("ui.43583a68911b5030")}
                </button>
              ) : (
                <Link className="primary-button" href="/subscription">{" " + bcText("ui.43583a68911b5030") + " "}</Link>
              )}
              <p className="verification-hint">{" " + bcText("ui.18dd7f8efb8bf819") + " "}</p>
            </article>
          </div>
          <p className="verification-hint">{" " + bcText("ui.def634c3b683f8e0") + " "}</p>
        </div>
      }
    </Localized>
  );
}
