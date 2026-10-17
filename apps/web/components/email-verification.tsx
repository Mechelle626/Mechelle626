"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized, useFormatLocale } from "./localization";
import { durationFormat } from "../lib/i18n/translate";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  Mail,
  RotateCw,
  ShieldCheck,
} from "lucide-react";

type Verification = {
  email: string;
  verified: boolean;
  expiresAt: string | null;
  resendAvailableAt: string | null;
  remainingAttempts: number;
  deliveryStatus: "none" | "pending" | "sent" | "failed";
  serverNow: string;
};

export default function EmailVerification() {
  const locale = useFormatLocale();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [mailMode, setMailMode] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [, tick] = useState(0);
  const anchor = useRef({ server: 0, client: 0 });
  const codeInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);

  function update(data: Verification) {
    if (!active.current) return;
    anchor.current = {
      server: Date.parse(data.serverNow),
      client: performance.now(),
    };
    setVerification(data);
  }
  async function loadStatus() {
    const response = await fetch("/api/auth/verification-status", {
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.assign("/login");
      return;
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? bcText("ui.505c8215027cf86f"));
    update(data);
  }
  useEffect(() => {
    active.current = true;
    loadStatus().catch((e) => {
      if (active.current) setError(e.message);
    });
    fetch("/api/auth/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active.current && data) setMailMode(data.mailMode);
      })
      .catch(() => {});
    if (
      new URLSearchParams(window.location.search).get("delivery") === "failed"
    )
      setError(
        bcText("ui.5450a220fc9d65fb"),
      );
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible")
        loadStatus().catch(() => {
          if (active.current)
            setError(
              bcText("ui.95fff0d02696bf27"),
            );
        });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const now = verification
    ? anchor.current.server +
      (typeof performance === "undefined"
        ? 0
        : performance.now() - anchor.current.client)
    : 0;
  const secondsLeft = verification?.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(verification.expiresAt) - now) / 1000))
    : 0;
  const resendIn = verification?.resendAvailableAt
    ? Math.max(
        0,
        Math.ceil((Date.parse(verification.resendAvailableAt) - now) / 1000),
      )
    : 0;
  const expired = !!verification?.expiresAt && secondsLeft === 0;
  const locked = verification?.remainingAttempts === 0;
  const canVerify =
    !!verification &&
    !verification.verified &&
    verification.deliveryStatus === "sent" &&
    !expired &&
    !locked;
  const countdown = durationFormat(secondsLeft,locale);

  async function mutate(action: "verify-email" | "resend-verification") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/auth/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "verify-email" ? { code } : {}),
      });
      const data = await response.json();
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok)
        throw new Error(data.error ?? bcText("ui.aab54809d22fd7ba"));
      if (data.verification) update(data.verification);
      else await loadStatus();
      if (action === "resend-verification") {
        setCode("");
        setNotice(
          mailMode === "local-outbox"
            ? bcText("ui.de0e7194b8d6334f")
            : bcText("ui.6e02c85e5d7fb161"),
        );
        codeInput.current?.focus();
      }
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : bcText("ui.cdd06185b3334e02"),
        );
      // Refresh attempt limits/cooldown even when a mutation was rejected or its response was lost.
      await loadStatus().catch(() => {});
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate("verify-email");
  }

  if (verification?.verified)
    return (
      <Localized>
        {
          <div className="auth-form-wrap verification-success">
            <div className="section-marker">
              <span />{" " + bcText("ui.68cb23759b7e982e") + " "}</div>
            <div className="verification-seal">
              <BadgeCheck size={39} strokeWidth={1.5} />
            </div>
            <h2>{bcText("ui.bc512ab036ae1f01")}</h2>
            <p className="form-description">{" " + bcText("ui.735cabfd4745864e")}{" "}
              <strong className="email-address">{verification.email}</strong>
            </p>
            <div className="verification-complete" role="status">
              <Check size={18} />
              <span>{bcText("ui.ccfcde4f68285aa0")}</span>
            </div>
            <p className="verification-success-copy">{" " + bcText("ui.7a0957ba8f33364c") + " "}</p>
            <Link href="/human-verification" className="primary-button">{" " + bcText("ui.8f66f045f954f609") + " "}<ArrowRight size={17} />
            </Link>
            <div className="verification-privacy">
              <ShieldCheck size={15} />
              <span>{" " + bcText("ui.aff40910d67d763c") + " "}<br />{" " + bcText("ui.2b844750fda5367e") + " "}</span>
            </div>
          </div>
        }
      </Localized>
    );

  return (
    <Localized>
      {
        <div className="auth-form-wrap verification-form">
          <div className="section-marker">
            <span />{" " + bcText("ui.d309f173d340e06e") + " "}</div>
          <div className="verification-envelope">
            <Mail size={29} strokeWidth={1.5} />
            <span className="envelope-spark">✦</span>
          </div>
          <h2>{" " + bcText("ui.4c58dd0d5e7513bb") + " "}<br />{bcText("ui.2d2361c13e98e225") + " "}</h2>
          <p className="form-description">{" " + bcText("ui.4aa31f97bf5f6f1e") + " "}{verification && (
              <strong className="email-address">{verification.email}</strong>
            )}
          </p>
          {mailMode === "local-outbox" && (
            <div className="local-note">
              <Mail size={15} />
              <span>{" " + bcText("ui.2eeb4ef5eaad8ee9") + " "}</span>
            </div>
          )}
          {error && (
            <div className="message error-message" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="message success-message" role="status">
              <Check size={18} />
              <span>{notice}</span>
            </div>
          )}
          {!verification ? (
            <div className="verification-loading">
              <p>
                <LoaderCircle size={17} className="spin" />{" " + bcText("ui.c988b95fe6f5d773") + " "}</p>
              {error && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setError("");
                    loadStatus().catch((e) => setError(e.message));
                  }}
                >{" " + bcText("ui.d8b8392e2c542950") + " "}</button>
              )}
            </div>
          ) : (
            <>
              {expired && (
                <div className="message error-message" role="alert">
                  <Clock3 size={18} />
                  <span>{" " + bcText("ui.140063496695aa45") + " "}</span>
                </div>
              )}
              {locked && !expired && (
                <div className="message error-message" role="alert">
                  <CircleAlert size={18} />
                  <span>{" " + bcText("ui.fa811a7baba4a27e") + " "}</span>
                </div>
              )}
              {verification.deliveryStatus === "failed" && (
                <div className="message error-message" role="alert">
                  <CircleAlert size={18} />
                  <span>{" " + bcText("ui.3a53a30e42a772ec") + " "}</span>
                </div>
              )}
              {verification.deliveryStatus === "none" && (
                <p className="verification-hint">{" " + bcText("ui.581c18fec847b5ab") + " "}</p>
              )}
              {verification.deliveryStatus === "pending" && (
                <p className="verification-hint">{" " + bcText("ui.5ebc3a6fdca109bb")}{" "}
                  <button
                    className="inline-button"
                    type="button"
                    onClick={() =>
                      loadStatus().catch((e) => setError(e.message))
                    }
                  >{" " + bcText("ui.442c4b893915d8df") + " "}</button>
                </p>
              )}
              <form onSubmit={submit}>
                <div className="field">
                  <label htmlFor="verification-code">{bcText("ui.3ee75029c70e284c")}</label>
                  <input
                    ref={codeInput}
                    id="verification-code"
                    name="code"
                    className="code-input verification-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    placeholder={bcText("ui.91b4d142823f7d20")}
                    required
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    aria-describedby="verification-code-help"
                    disabled={busy || !canVerify}
                  />
                  <span
                    id="verification-code-help"
                    className="verification-hint"
                  >{" " + bcText("ui.1165e07e1c2419de") + " "}</span>
                </div>
                <div
                  className={bcText("ui.4c355548c5ac6cf4", [expired ? "timer-expired" : ""])}
                >
                  <span>
                    <Clock3 size={15} />
                    {expired ? bcText("ui.a7ea021e0c7faae3") : bcText("ui.2cb53f5059635ee3")}
                  </span>
                  <span
                    role="timer"
                    dir="ltr"
                    aria-label={bcText("ui.fac1846b679de478")}
                    aria-live="off"
                  >
                    {countdown}
                  </span>
                </div>
                <p className="verification-attempts">
                  {verification.remainingAttempts}{" " + bcText("ui.203d3536bd62ad33")}{" "}
                  {verification.remainingAttempts === 1
                    ? "attempt"
                    : "attempts"}{" "}{" " + bcText("ui.43e3ece73ff8f4eb") + " "}</p>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || !canVerify || code.length !== 6}
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={17} className="spin" />{" " + bcText("ui.4660a983366f7101") + " "}</>
                  ) : (
                    <>{" " + bcText("ui.e89a77e7fe58a6d1") + " "}<ArrowRight size={17} />
                    </>
                  )}
                </button>
              </form>
              <div className="verification-resend">
                <span>{bcText("ui.97561b162389704b")}</span>
                <button
                  type="button"
                  disabled={busy || resendIn > 0}
                  onClick={() => mutate("resend-verification")}
                >
                  <RotateCw size={13} />
                  {resendIn > 0 ? bcText("ui.ac91a1cfd32ea590", [new Intl.NumberFormat(locale).format(resendIn)]) : bcText("ui.b97457409ab5b375")}
                </button>
              </div>
              <p className="verification-hint resend-hint">{" " + bcText("ui.bdb6ffa9347c48fa") + " "}</p>
            </>
          )}
          <Link href="/login" className="back-link">
            <ArrowLeft size={15} />{" " + bcText("ui.71fe31ccd37c3268") + " "}</Link>
          <Link href="/discover" className="school-inline-button">{" " + bcText("ui.b336321ad36bd96c") + " "}</Link>
          <div className="verification-privacy">
            <ShieldCheck size={15} />
            <span>{" " + bcText("ui.ba54cd0b00b9a300") + " "}</span>
          </div>
        </div>
      }
    </Localized>
  );
}
