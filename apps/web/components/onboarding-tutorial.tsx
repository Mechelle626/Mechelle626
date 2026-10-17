"use client";
import { message as bcText } from "../lib/i18n/source";

import { useFormatLocale } from "./localization";
import { Localized } from "./localization";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tutorialSteps } from "../lib/onboarding/tutorial";
export default function OnboardingTutorial({
  replay = false,
}: {
  replay?: boolean;
}) {
  const locale = useFormatLocale();
  const router = useRouter(),
    heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/onboarding/tutorial")
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        if (!replay && v.status === "in_progress") setStep(v.step);
        setLoaded(true);
      })
      .catch((e) => setError(e.message));
  }, [replay]);
  useEffect(() => {
    if (loaded) heading.current?.focus();
  }, [step, loaded]);
  async function save(
    status: "in_progress" | "completed" | "skipped",
    next = step,
  ) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/onboarding/tutorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, step: next }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      if (status === "in_progress") setStep(next);
      else router.replace("/discover");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = tutorialSteps[step];
  return (
    <Localized>
      {
        <section className="panel tutorial-panel">
          <div className="section-marker">
            <span />{bcText("ui.2452f1754a3e9af1") + " "}</div>
          <h2>{bcText("ui.1dbe3169c6b5095f")}</h2>
          {error && (
            <p role="alert" className="message error-message">
              {error}
            </p>
          )}
          {!loaded ? (
            <p>{bcText("ui.0636036dbb8ea869")}</p>
          ) : (
            <>
              <progress
                max={tutorialSteps.length}
                value={step + 1}
                aria-label={bcText("ui.4286acde3b914f63")}
              />
              <p className="verification-hint">
                {new Intl.NumberFormat(locale).format(step + 1)} /{" "}
                {new Intl.NumberFormat(locale).format(tutorialSteps.length)}
              </p>
              <h3 ref={heading} tabIndex={-1}>
                {current.title}
              </h3>
              <p>{current.description}</p>
              {current.href && (
                <Link
                  href={current.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >{" " + bcText("ui.eac591ce429cd11e") + " "}</Link>
              )}
              <div className="button-row">
                {step > 0 && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => save("in_progress", step - 1)}
                  >{" " + bcText("ui.76900f1bfd16c8d4") + " "}</button>
                )}
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    save(
                      step === tutorialSteps.length - 1
                        ? "completed"
                        : "in_progress",
                      Math.min(step + 1, 10),
                    )
                  }
                >
                  {step === tutorialSteps.length - 1
                    ? bcText("ui.df2028d0877cc2cc")
                    : bcText("ui.fb6ce43cb3747a4f")}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => save("skipped")}
                >{" " + bcText("ui.f0b4c48ab5e1e3ab") + " "}</button>
              </div>
              <p className="verification-hint">{" " + bcText("ui.551e5176260f31b8") + " "}</p>
            </>
          )}
        </section>
      }
    </Localized>
  );
}
