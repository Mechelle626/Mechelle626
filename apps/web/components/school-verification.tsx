"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized, useFormatLocale } from "./localization";
import { durationFormat } from "../lib/i18n/translate";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Check,
  ChevronLeft,
  CircleAlert,
  Clock3,
  GraduationCap,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { roles } from "../lib/auth/contracts";
import {
  maxDocumentBytes,
  type AcademicRole,
  type SchoolOption,
  type SchoolStatus,
} from "../lib/school/contracts";
import SchoolSearch from "./school-search";
import SchoolCamera from "./school-camera";
import SchoolIdUploader from "./school-id-uploader";

type Method = "email" | "upload" | "camera";
const methods = [
  { id: "email", label: bcText("ui.a35ea178fd950aee"), icon: Mail },
  { id: "upload", label: bcText("ui.34f4640d5f22f5e7"), icon: Upload },
  { id: "camera", label: bcText("ui.53474f3d1cd9ecea"), icon: Camera },
] as const;
export default function SchoolVerification() {
  const locale = useFormatLocale();
  const [status, setStatus] = useState<SchoolStatus | null>(null),
    [school, setSchool] = useState<SchoolOption | null>(null),
    [role, setRole] = useState<AcademicRole>(bcText("ui.2a164d5415787b6e") as AcademicRole),
    [method, setMethod] = useState<Method>("email"),
    [email, setEmail] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState(false);
  const anchor = useRef({ server: 0, client: 0 });
  const [, tick] = useState(0);
  const alive = useRef(true);
  function gate(response: Response) {
    if (response.status === 401) {
      window.location.assign("/login");
      return true;
    }
    if (response.status === 403) {
      window.location.assign("/human-verification");
      return true;
    }
    return false;
  }
  function update(value: SchoolStatus) {
    if (!alive.current) return;
    anchor.current = {
      server: Date.parse(value.serverNow),
      client: performance.now(),
    };
    setStatus(value);
  }
  async function load() {
    const response = await fetch("/api/school/status", { cache: "no-store" });
    if (gate(response)) return;
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.error ?? bcText("ui.53f01401d6cca521"));
    update(value);
    return value as SchoolStatus;
  }
  useEffect(() => {
    alive.current = true;
    load()
      .then((value) => {
        if (value && alive.current) setRole(value.role);
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, []);
  const request = status?.request;
  const now = status
    ? anchor.current.server + performance.now() - anchor.current.client
    : 0;
  const expires = request?.codeExpiresAt
    ? Math.max(0, Math.ceil((Date.parse(request.codeExpiresAt) - now) / 1000))
    : 0;
  const resend = request?.resendAvailableAt
    ? Math.max(
        0,
        Math.ceil((Date.parse(request.resendAvailableAt) - now) / 1000),
      )
    : 0;
  const pendingEmail = !editing && request?.status === "awaiting_email";
  const pendingReview =
    !editing &&
    request &&
    ["pending_review", "needs_information", "rejected"].includes(
      request.status,
    );
  const emailAllowed = school?.emailRoles.includes(role) ?? false;
  async function post(action: string, body: unknown) {
    const response = await fetch(`/api/school/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (gate(response)) return null;
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error ?? bcText("ui.fd300c6c7a7caa1c"),
      );
    return data;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !school) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (method === "email") {
        const data = await post("email/start", {
          schoolId: school.id,
          role,
          universityEmail: email,
        });
        if (!data) return;
        update(data.verification);
        setEditing(false);
        setCode("");
        if (!data.emailSent)
          setError(
            bcText("ui.2590148a58e0ef88"),
          );
      } else {
        if (!file) throw new Error(bcText("ui.8328d28d70c62a0c"));
        if (file.size > maxDocumentBytes)
          throw new Error(bcText("ui.bd68a9f7641ca463"));
        const form = new FormData();
        form.set("schoolId", school.id);
        form.set("role", role);
        form.set("method", method);
        form.set("document", file);
        const response = await fetch("/api/school/submit-document", {
          method: "POST",
          body: form,
        });
        if (gate(response)) return;
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? bcText("ui.370046f3f40eb7f9"));
        update(data.verification);
        setEditing(false);
        setFile(null);
        setNotice(data.message);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function emailAction(action: "email/confirm" | "email/resend") {
    if (!request || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await post(action, {
        requestId: request.id,
        ...(action === "email/confirm" ? { code } : {}),
      });
      if (data) {
        update(data.verification);
        setCode("");
        if (data.emailSent === false)
          setError(
            bcText("ui.6532d72100371a46"),
          );
        else if (action === "email/resend")
          setNotice(
            status?.mailMode === "local-outbox"
              ? bcText("ui.2086c5041479e5c6")
              : bcText("ui.0335765fffae59cc"),
          );
      }
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  if (status?.schoolVerified && !editing)
    return (
      <Localized>
        {
          <div className="auth-form-wrap school-success">
            <div className="section-marker">
              <span />{" " + bcText("ui.30dffe9fff501ff9") + " "}</div>
            <div className="verification-seal">
              <BadgeCheck size={40} />
            </div>
            <h2>{bcText("ui.37fab5fd5868d864")}</h2>
            <div className="verification-complete" role="status">
              <Check size={18} />
              <span>{bcText("ui.fc90e5df0a350581")}</span>
            </div>
            <div className="school-summary">
              <span>
                {status.verifiedSchool?.role ?? request?.role ?? status.role}
              </span>
              <strong>
                {status.verifiedSchool?.name ?? request?.schoolName}
              </strong>
            </div>
            <p className="form-description">{" " + bcText("ui.cec332023005dc9e") + " "}</p>
            <Link href="/account" className="primary-button">{" " + bcText("ui.7da4b6b53769ac35") + " "}<ArrowRight size={17} />
            </Link>
            <button
              type="button"
              className="school-inline-button"
              onClick={() => setEditing(true)}
            >{" " + bcText("ui.00cafbc6852bd39f") + " "}</button>
          </div>
        }
      </Localized>
    );
  return (
    <Localized>
      {
        <div className="auth-form-wrap school-form">
          <div className="section-marker">
            <span />{" " + bcText("ui.b2ff9a53bbd80d74") + " "}</div>
          <div className="school-icon">
            <GraduationCap size={33} strokeWidth={1.4} />
          </div>
          <h2>{bcText("ui.eb04326b79eb70ce")}</h2>
          <p className="form-description">{" " + bcText("ui.77e505ccd9b06d13") + " "}<br />{" " + bcText("ui.17ddd83b53dd2f9f") + " "}</p>
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
          {!status ? (
            error ? (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  load()
                    .then((value) => {
                      if (value) setRole(value.role);
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >{" " + bcText("ui.c081e9d594a9e39e") + " "}</button>
            ) : (
              <p className="captcha-loading">
                <LoaderCircle size={17} className="spin" />{" " + bcText("ui.46f0431270e9bb51") + " "}</p>
            )
          ) : pendingEmail ? (
            <>
              <div className="school-request-heading">
                <Mail size={22} />
                <div>
                  <strong>{bcText("ui.21e029e83bf97e0f")}</strong>
                  <span>{request.universityEmail}</span>
                </div>
              </div>
              <div className="school-summary">
                <span>{request.role}</span>
                <strong>{request.schoolName}</strong>
              </div>
              {status.mailMode === "local-outbox" && (
                <div className="local-note">
                  <Mail size={15} />
                  <span>{" " + bcText("ui.a16f083603d42977") + " "}</span>
                </div>
              )}
              {request.deliveryStatus === "failed" && (
                <p className="message error-message" role="alert">{" " + bcText("ui.ddb5d31ee4040046") + " "}</p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void emailAction("email/confirm");
                }}
              >
                <div className="field">
                  <label htmlFor="school-code">{" " + bcText("ui.067d7a205825bc8c") + " "}</label>
                  <input
                    id="school-code"
                    className="code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    disabled={
                      busy ||
                      expires === 0 ||
                      request.remainingAttempts === 0 ||
                      request.deliveryStatus !== "sent"
                    }
                  />
                </div>
                <div className="verification-timer">
                  <span>
                    <Clock3 size={15} />
                    {expires ? bcText("ui.2cb53f5059635ee3") : bcText("ui.a7ea021e0c7faae3")}
                  </span>
                  <span
                    role="timer"
                    dir="ltr"
                    aria-label={bcText("ui.0cfbd6491a6d2d40")}
                    aria-live="off"
                  >
                    {durationFormat(expires,locale)}
                  </span>
                </div>
                <p className="verification-attempts">
                  {request.remainingAttempts}{" " + bcText("ui.4c8d5592cc9e756c") + " "}</p>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    expires === 0 ||
                    request.remainingAttempts === 0 ||
                    code.length !== 6 ||
                    request.deliveryStatus !== "sent"
                  }
                >{" " + bcText("ui.4d316d1e21b6090f") + " "}<ArrowRight size={16} />
                </button>
              </form>
              <div className="verification-resend">
                <button
                  type="button"
                  disabled={busy || resend > 0}
                  onClick={() => emailAction("email/resend")}
                >
                  {resend ? bcText("ui.ac91a1cfd32ea590", [resend]) : bcText("ui.b97457409ab5b375")}
                </button>
              </div>
              <button
                type="button"
                className="school-inline-button"
                onClick={() => {
                  setEditing(true);
                  setError("");
                  setNotice("");
                }}
              >{" " + bcText("ui.992023436d23b4cc") + " "}</button>
            </>
          ) : pendingReview ? (
            <>
              <div className="school-review-status">
                <Clock3 size={25} />
                <h3>
                  {request.status === "rejected"
                    ? bcText("ui.2bb43dba051839f5")
                    : request.status === "needs_information"
                      ? bcText("ui.905ed4ac299184af")
                      : bcText("ui.9a1fd87565fc8554")}
                </h3>
                <p>
                  {request.role} · {request.schoolName}
                </p>
                <p>
                  {request.status === "pending_review"
                    ? request.documentScanStatus === "clean"
                      ? bcText("ui.9892edb676b5bb4a")
                      : request.documentScanStatus === "infected"
                        ? bcText("ui.c25c4826f085a39e")
                        : bcText("ui.ecfe7b6bf36ed5de")
                    : (request.reason ??
                      bcText("ui.967b9b25e049f87a"))}
                </p>
              </div>
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  load()
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                <RefreshCw size={15} />{" " + bcText("ui.442c4b893915d8df") + " "}</button>
              <button
                className="school-inline-button"
                type="button"
                onClick={() => {
                  setEditing(true);
                  setError("");
                  setNotice("");
                }}
              >{" " + bcText("ui.efec4429f2557034") + " "}</button>
            </>
          ) : (
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="academic-role">{bcText("ui.14736a2eb9f4159f")}</label>
                <select
                  id="academic-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AcademicRole)}
                  required
                >
                  {roles.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <SchoolSearch value={school} onChange={setSchool} />
              <fieldset className="school-methods">
                <legend>{bcText("ui.8e9144afb01ced8c")}</legend>
                {methods.map((item) => (
                  <label
                    key={item.id}
                    className={bcText("ui.3442282fcfdbe776", [method === item.id ? "method-selected" : ""])}
                  >
                    <input
                      type="radio"
                      name="verificationMethod"
                      value={item.id}
                      checked={method === item.id}
                      onChange={() => {
                        setMethod(item.id);
                        setFile(null);
                        setError("");
                      }}
                    />
                    <item.icon size={18} />
                    <span>{item.label}</span>
                    <span className="school-method-dot" />
                  </label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor="university-email">{" " + bcText("ui.a35ea178fd950aee")}{" "}
                  {method !== "email" && (
                    <span className="optional-label">{" " + bcText("ui.c3f6e4ff70953e5c") + " "}</span>
                  )}
                </label>
                <input
                  id="university-email"
                  type="email"
                  autoComplete="email"
                  placeholder={bcText("ui.3bf9d25e95da8f40")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={method === "email"}
                  maxLength={254}
                />
                {method === "email" && school && !emailAllowed && (
                  <span className="field-error">{" " + bcText("ui.15ae8fc8be84a08f") + " "}</span>
                )}
                {method !== "email" && (
                  <span className="verification-hint">{" " + bcText("ui.86d33711ac1627bb") + " "}</span>
                )}
              </div>
              {method === "upload" && (
                <>
                  <SchoolIdUploader
                    file={file}
                    onChange={setFile}
                    disabled={busy}
                  />
                  <Link
                    className="school-inline-button"
                    href="/school-verification/upload"
                  >{" " + bcText("ui.186d5d2f0f2b00a9") + " "}</Link>
                </>
              )}
              {method === "camera" && (
                <>
                  <SchoolCamera onCapture={setFile} disabled={busy} />
                  <Link
                    className="school-inline-button"
                    href="/school-verification/scan"
                  >{" " + bcText("ui.cefa448a67a56694") + " "}</Link>
                </>
              )}
              {method !== "email" && !status.uploadsConfigured && (
                <p className="message error-message" role="alert">{" " + bcText("ui.5be07d9a8fcb68ed") + " "}</p>
              )}
              <button
                className="primary-button"
                disabled={
                  busy ||
                  !school ||
                  (method === "email"
                    ? !emailAllowed
                    : !file ||
                      file.size > maxDocumentBytes ||
                      !status.uploadsConfigured)
                }
              >
                {busy ? (
                  <>
                    <LoaderCircle size={17} className="spin" />{" " + bcText("ui.49195f559e4a9f5b") + " "}</>
                ) : (
                  <>
                    {method === "email"
                      ? bcText("ui.8aa85d920d267954")
                      : bcText("ui.e2242fa683736df4")}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              {editing && request && (
                <button
                  className="school-inline-button"
                  type="button"
                  onClick={() => setEditing(false)}
                >
                  <ChevronLeft size={13} />{" " + bcText("ui.a853c5a354ad38fc") + " "}</button>
              )}
            </form>
          )}
          <div className="verification-privacy">
            <ShieldCheck size={16} />
            <span>{" " + bcText("ui.7c3407312bd93907") + " "}</span>
          </div>
        </div>
      }
    </Localized>
  );
}
