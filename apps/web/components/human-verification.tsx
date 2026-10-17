"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCheck,
  CircleAlert,
  Fingerprint,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import CaptchaWidget from "./captcha-widget";
import { captchaNames, type HumanStatus } from "../lib/auth/human-contracts";
import { LogoutButton } from "./session-manager";

export default function HumanVerification({
  identityRequired = false,
}: {
  identityRequired?: boolean;
}) {
  const [status, setStatus] = useState<HumanStatus | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [widgetFailed, setWidgetFailed] = useState(false);
  const active = useRef(true),
    starting = useRef(false);
  function handleGate(response: Response) {
    if (response.status === 401) {
      window.location.assign("/login");
      return true;
    }
    if (response.status === 403) {
      window.location.assign("/verify-email");
      return true;
    }
    return false;
  }
  async function begin() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setToken("");
    setChallengeId(null);
    setError("");
    setWidgetFailed(false);
    try {
      const response = await fetch("/api/auth/human-status", {
        cache: "no-store",
      });
      if (handleGate(response)) return;
      const info = await response.json();
      if (!response.ok)
        throw new Error(info.error ?? bcText("ui.0f7df5548448a401"));
      if (!active.current) return;
      setStatus(info);
      if (info.humanVerified || !info.configured) return;
      const request = await fetch("/api/auth/human-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (handleGate(request)) return;
      const challenge = await request.json();
      if (!request.ok)
        throw new Error(challenge.error ?? bcText("ui.3fe1443ea69ee89e"));
      if (active.current) {
        if (challenge.humanVerified)
          setStatus({ ...info, humanVerified: true });
        else setChallengeId(challenge.challengeId);
      }
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : bcText("ui.6b2a818d97d57016"),
        );
    } finally {
      starting.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    void begin();
    return () => {
      active.current = false;
    };
  }, []);
  async function confirm() {
    if (!token || !challengeId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-human", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, challengeId }),
      });
      if (handleGate(response)) return;
      const result = await response.json();
      if (!response.ok || result.humanVerified !== true)
        throw new Error(
          result.error ?? bcText("ui.bc1e19b3c0482bae"),
        );
      if (active.current)
        setStatus((current) =>
          current ? { ...current, humanVerified: true } : null,
        );
    } catch (e) {
      if (active.current) {
        setToken("");
        setWidgetFailed(true);
        setError(
          e instanceof Error
            ? e.message
            : bcText("ui.f5770cdb171185bc"),
        );
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function widgetError(message: string) {
    setToken("");
    setWidgetFailed(true);
    setError(message);
  }
  if (status?.humanVerified)
    return (
      <Localized>
        {
          <div className="auth-form-wrap human-success">
            <div className="section-marker">
              <span />{" " + bcText("ui.4abe06248a5f7d15") + " "}</div>
            <div className="verification-seal">
              <ShieldCheck size={40} strokeWidth={1.5} />
            </div>
            <h2>{bcText("ui.7cb5d1f7d98c5824")}</h2>
            <p className="form-description">{" " + bcText("ui.2471f6ee653c5594") + " "}</p>
            <div className="verification-complete" role="status">
              <Check size={18} />
              <span>{bcText("ui.d1d7bf3cc9e9fb27")}</span>
            </div>
            <p className="verification-success-copy">{" " + bcText("ui.526170e45c3e2a47") + " "}</p>
            <Link
              href={
                identityRequired
                  ? "/identity-verification"
                  : "/school-verification"
              }
              className="primary-button"
            >
              {identityRequired
                ? bcText("ui.08afb5b09a449421")
                : bcText("ui.4138a3be3e048b93")}
              <ArrowRight size={17} />
            </Link>
            <div className="verification-privacy">
              <CheckCheck size={16} />
              <span>{" " + bcText("ui.1b31ee9ed8afc6ad") + " "}<br />{" " + bcText("ui.7ed354fe49350245") + " "}</span>
            </div>
          </div>
        }
      </Localized>
    );
  return (
    <Localized>
      {
        <div className="auth-form-wrap human-form">
          <div className="section-marker">
            <span />{" " + bcText("ui.7370fa33adcb6b3f") + " "}</div>
          <div className="human-icon">
            <Fingerprint size={35} strokeWidth={1.3} />
          </div>
          <h2>{bcText("ui.5c608a9673934709")}</h2>
          <p className="form-description">{" " + bcText("ui.594ded19b6d7ac2c") + " "}</p>
          <div className="human-progress">
            <span>
              <Check size={13} />{" " + bcText("ui.bdfb1e4f00c73e98") + " "}</span>
            <span className="human-progress-line" />
            <span>
              <Fingerprint size={14} />{" " + bcText("ui.6714fd926d748f3e") + " "}</span>
          </div>
          {error && (
            <div className="message error-message" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
            </div>
          )}
          {status && !status.configured && (
            <div className="human-not-configured" role="alert">
              <ShieldCheck size={23} />
              <div>
                <h3>{bcText("ui.8626839bc685935d")}</h3>
                <p>{" " + bcText("ui.38305f7ed123ef9e") + " "}</p>
              </div>
            </div>
          )}
          {!status && busy && (
            <p className="captcha-loading">
              <LoaderCircle size={17} className="spin" />{" " + bcText("ui.bab117c96a6814f3") + " "}</p>
          )}
          {status?.configured && challengeId && status.siteKey && (
            <div className="human-challenge-card">
              <div className="human-challenge-heading">
                <span>{bcText("ui.57106b085cc77e2b")}</span>
                <ShieldCheck size={15} />
              </div>
              <CaptchaWidget
                provider={status.provider}
                siteKey={status.siteKey}
                challengeId={challengeId}
                onToken={(value) => {
                  if (!widgetFailed) {
                    setToken(value);
                    setError("");
                  }
                }}
                onError={widgetError}
                onExpired={() =>
                  widgetError(
                    bcText("ui.d00613ff0e6f4ef0"),
                  )
                }
              />
              <p className="human-provider">{" " + bcText("ui.3cbdf9ecd654255b") + " "}{captchaNames[status.provider]}
              </p>
            </div>
          )}
          <button
            type="button"
            className="primary-button"
            disabled={busy || !token || widgetFailed || !status?.configured}
            onClick={confirm}
          >
            {busy ? (
              <>
                <LoaderCircle size={17} className="spin" />{" " + bcText("ui.4660a983366f7101") + " "}</>
            ) : (
              <>{" " + bcText("ui.f6778950d77ca001") + " "}<ArrowRight size={17} />
              </>
            )}
          </button>
          <div className="human-retry">
            <button type="button" disabled={busy} onClick={() => void begin()}>
              <RotateCw size={13} />
              {status?.configured ? bcText("ui.f17d4a909cf979d8") : bcText("ui.fb7099ad8e818d42")}
            </button>
          </div>
          <p className="human-access-note">{" " + bcText("ui.091038a7371e636a") + " "}</p>
          <div className="verification-privacy">
            <ShieldCheck size={15} />
            <span>{" " + bcText("ui.7165fbcf110d6861") + " "}</span>
          </div>
          <div className="human-signout">
            <LogoutButton />
          </div>
        </div>
      }
    </Localized>
  );
}
