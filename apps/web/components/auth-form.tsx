"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import ResidenceFields from "./residence-fields";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Check,
  Mail,
  LockKeyhole,
  AlertCircle,
  LoaderCircle,
  GraduationCap,
} from "lucide-react";
import { roles, passwordStrength, type AuthMode } from "../lib/auth/contracts";
type Config = { providers: Record<string, boolean>; mailMode: string };
type Fields = Record<string, string[] | undefined>;
const copy: Record<
  AuthMode,
  { tag: string; title: string; description: string; button: string }
> = {
  signup: {
    tag: bcText("ui.2487e6c635b9e015"),
    title: bcText("ui.865b396773f0bfa7"),
    description: bcText("ui.9de34ed5d72e4873"),
    button: bcText("ui.798ca2ce18bf2038"),
  },
  login: {
    tag: bcText("ui.1e0d1a3ef3e9a943"),
    title: bcText("ui.3d15460fa69f34c4"),
    description: bcText("ui.ee983f79dfb5d010"),
    button: bcText("ui.bfd402b2f6f38125"),
  },
  "forgot-password": {
    tag: bcText("ui.f706aea7b813614a"),
    title: bcText("ui.ebddb69d1ee36239"),
    description: bcText("ui.91880e5b16de48b5"),
    button: bcText("ui.708c5d67ba8e2818"),
  },
  "reset-password": {
    tag: bcText("ui.b4ba11f260eeff85"),
    title: bcText("ui.d054d5f4c427d104"),
    description: bcText("ui.a9876da517661426"),
    button: bcText("ui.e0edfeb3a71a1002"),
  },
  "verify-email": {
    tag: bcText("ui.78152e7cb9cb98ae"),
    title: bcText("ui.75a9fda6dbb7801d"),
    description:
      bcText("ui.3b98745fdc2511d5"),
    button: bcText("ui.e89a77e7fe58a6d1"),
  },
  "complete-profile": {
    tag: bcText("ui.d047b0794b9714f9"),
    title: bcText("ui.0fee4c6e23f4783c"),
    description: bcText("ui.d1624221fa93dc22"),
    button: bcText("ui.6d0a5ca2ca1f7c73"),
  },
};
function GoogleIcon() {
  return (
    <Localized>
      {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.3Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 5-.9 6.6-2.5L15.4 17c-.9.6-2 .9-3.4.9a6 6 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.4 13.8a6 6 0 0 1 0-3.6V7.6H3.1a10 10 0 0 0 0 8.8l3.3-2.6Z"
          />
          <path
            fill="#EA4335"
            d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.6l3.3 2.6A6 6 0 0 1 12 6.1Z"
          />
        </svg>
      }
    </Localized>
  );
}
function MicrosoftIcon() {
  return (
    <Localized>
      {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#f25022" d="M2 2h9v9H2z" />
          <path fill="#7fba00" d="M13 2h9v9h-9z" />
          <path fill="#00a4ef" d="M2 13h9v9H2z" />
          <path fill="#ffb900" d="M13 13h9v9h-9z" />
        </svg>
      }
    </Localized>
  );
}
function AppleIcon() {
  return (
    <Localized>
      {
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.6 12.7c0-2 1.6-3 1.7-3.1-1-1.4-2.5-1.6-3.1-1.6-1.3-.2-2.6.8-3.2.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .8 1 1.6 2.1 2.7 2 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7s1.9-1 2.6-2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.4-.9-2.4-3.9ZM14.5 6.6c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2-.5 2.7-1.3Z" />
        </svg>
      }
    </Localized>
  );
}
export default function AuthForm({ mode }: { mode: AuthMode }) {
  const [config, setConfig] = useState<Config | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [fields, setFields] = useState<Fields>({}),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [token, setToken] = useState(""),
    [email, setEmail] = useState(""),
    [cooldown, setCooldown] = useState(0),
    [complete, setComplete] = useState(false);
  const [oauthProfile, setOauthProfile] = useState<{
    firstName: string;
    lastName: string;
    email: string;
  } | null>(null);
  const details = copy[mode],
    isSignup = mode === "signup" || mode === "complete-profile",
    social = mode === "signup" || mode === "login";
  const strength = passwordStrength(password);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (active) setConfig(c);
      })
      .catch(() => {});
    const query = new URLSearchParams(window.location.search);
    if (query.get("error")) setError(query.get("error")!);
    if (query.get("delivery") === "failed")
      setError(
        bcText("ui.00f6c51631ab4154"),
      );
    if (mode === "reset-password") {
      const t =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      setToken(t);
      window.history.replaceState(null, "", window.location.pathname);
      if (!/^[a-f0-9]{64}$/.test(t))
        setError(bcText("ui.299dca4a11575422"));
    }
    if (mode === "verify-email")
      fetch("/api/auth/me")
        .then(async (r) => {
          if (r.status === 401) {
            window.location.assign("/login");
            return;
          }
          const d = await r.json();
          if (active && d.user) {
            setEmail(d.user.email);
            if (d.user.email_verified_at) window.location.assign("/account");
          }
        })
        .catch(() => {
          if (active)
            setError(bcText("ui.7edc583e6ceb21d6"));
        });
    if (mode === "complete-profile")
      fetch("/api/auth/oauth-profile")
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          if (active) setOauthProfile(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [mode]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setFields({});
    setBusy(true);
    const form = new FormData(event.currentTarget),
      body: Record<string, unknown> = Object.fromEntries(form.entries());
    if (isSignup)
      body.noEducationalEmail = form.get("noEducationalEmail") === "on";
    if (mode === "login") body.remember = form.get("remember") === "on";
    if (mode === "reset-password") body.token = token;
    const endpoint = mode === "signup" ? "register" : mode;
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setFields(data.fields ?? {});
        throw new Error(data.error ?? bcText("ui.2a833d45816f827a"));
      }
      if (data.next && mode !== "reset-password") {
        if (data.emailSent === false) {
          setNotice(
            bcText("ui.ef9a14c6292f516f"),
          );
        }
        window.location.assign(
          data.emailSent === false ? `${data.next}?delivery=failed` : data.next,
        );
      } else {
        setNotice(data.message ?? bcText("ui.a83cc6932ff2ce02"));
        setComplete(true);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : bcText("ui.cdd06185b3334e02"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNotice(d.message);
      setCooldown(60);
    } catch (e) {
      setError(e instanceof Error ? e.message : bcText("ui.f96e7ba9abcda293"));
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (name: string) =>
    fields[name]?.length ? (
      <span id={`${name}-error`} className="field-error">
        {fields[name]![0]}
      </span>
    ) : null;
  const inputProps = (name: string) => ({
    name,
    id: name,
    "aria-invalid": !!fields[name],
    "aria-describedby": fields[name] ? `${name}-error` : undefined,
  });
  return (
    <Localized>
      {
        <div className={bcText("ui.73e1685a67c3c96f", [isSignup ? "signup-form" : ""])}>
          <div className="section-marker">
            <span /> {details.tag}
          </div>
          <h2>{details.title}</h2>
          <p className="form-description">
            {details.description}
            {mode === "verify-email" && email && (
              <strong className="email-address">{email}</strong>
            )}
          </p>
          {social && (
            <>
              <div className="social-buttons">
                {(["google", "microsoft", "apple"] as const).map((provider) => (
                  <button
                    type="button"
                    key={provider}
                    disabled={!config?.providers[provider] || busy}
                    title={
                      config?.providers[provider]
                        ? bcText("ui.73f8ab4002058ec4", [provider])
                        : bcText("ui.3fb2a2ac92599542", [provider])
                    }
                    onClick={() =>
                      window.location.assign(`/api/auth/oauth/${provider}`)
                    }
                  >
                    {provider === "google" ? (
                      <GoogleIcon />
                    ) : provider === "microsoft" ? (
                      <MicrosoftIcon />
                    ) : (
                      <AppleIcon />
                    )}
                    <span>{provider[0].toUpperCase() + provider.slice(1)}</span>
                  </button>
                ))}
              </div>
              {config &&
                Object.values(config.providers).some((enabled) => !enabled) && (
                  <p className="configuration-note">{" " + bcText("ui.d7ebd106b2f01255") + " "}</p>
                )}
              <div className="divider">
                <span />
                {mode === "signup"
                  ? bcText("ui.634d60d5d0547012")
                  : bcText("ui.36b1371c9c21cc2b")}
                <span />
              </div>
            </>
          )}
          {config?.mailMode === "local-outbox" && (
            <div className="local-note">
              <Mail size={15} />
              <span>{" " + bcText("ui.de912d4e783967a1") + " "}</span>
            </div>
          )}
          {error && (
            <div className="message error-message" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="message success-message" role="status">
              <Check size={18} />
              <span>{notice}</span>
            </div>
          )}
          {complete ? (
            <div className="confirmation-card">
              <span className="confirmation-icon">
                {mode === "reset-password" ? <Check /> : <Mail />}
              </span>
              <h3>
                {mode === "reset-password"
                  ? bcText("ui.f3289e1349e75c14")
                  : bcText("ui.07a8a3ca96c373d0")}
              </h3>
              <p>
                {mode === "reset-password"
                  ? bcText("ui.779f6b99ceb0c7d1")
                  : config?.mailMode === "local-outbox"
                    ? bcText("ui.97cb8de4e41cc188")
                    : bcText("ui.e8c88219f99e8779")}
              </p>
              <Link className="primary-button" href="/login">{" " + bcText("ui.71fe31ccd37c3268") + " "}<ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              {isSignup && (
                <>
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="firstName">{bcText("ui.702ef921ed1d89bf")}</label>
                      <input
                        {...inputProps("firstName")}
                        autoComplete="given-name"
                        placeholder={bcText("ui.702ef921ed1d89bf")}
                        maxLength={80}
                        required
                        defaultValue={oauthProfile?.firstName}
                        key={`first-${oauthProfile?.firstName ?? ""}`}
                      />
                      {fieldError("firstName")}
                    </div>
                    <div className="field">
                      <label htmlFor="lastName">{bcText("ui.7b4888049459f04a")}</label>
                      <input
                        {...inputProps("lastName")}
                        autoComplete="family-name"
                        placeholder={bcText("ui.7b4888049459f04a")}
                        maxLength={80}
                        required
                        defaultValue={oauthProfile?.lastName}
                        key={`last-${oauthProfile?.lastName ?? ""}`}
                      />
                      {fieldError("lastName")}
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="username">{bcText("ui.e3b89e9d33f88e52")}</label>
                    <div className="input-icon">
                      <span className="at-symbol">@</span>
                      <input
                        {...inputProps("username")}
                        autoComplete="username"
                        placeholder={bcText("ui.1eefb26b84c4428b")}
                        minLength={3}
                        maxLength={30}
                        pattern="[a-zA-Z0-9_]+"
                        required
                      />
                    </div>
                    {fieldError("username")}
                  </div>
                </>
              )}
              {(mode === "signup" ||
                mode === "login" ||
                mode === "forgot-password") && (
                <div className="field">
                  <label htmlFor="email">{bcText("ui.f2488fd4ef4adbc6")}</label>
                  <input
                    {...inputProps("email")}
                    type="email"
                    autoComplete="email"
                    placeholder={bcText("ui.7c93c899a04ebb68")}
                    maxLength={254}
                    required
                  />
                  {fieldError("email")}
                </div>
              )}
              {mode === "complete-profile" && oauthProfile && (
                <div className="linked-email">
                  <Mail size={16} />
                  {oauthProfile.email}
                </div>
              )}
              {(mode === "signup" ||
                mode === "login" ||
                mode === "reset-password") && (
                <>
                  <div className="field">
                    <label htmlFor="password">
                      {mode === "reset-password" ? bcText("ui.3dd9df4441fb348f") : bcText("ui.e7cf3ef4f17c3999")}
                    </label>
                    <div className="password-input">
                      <input
                        {...inputProps("password")}
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        minLength={mode === "login" ? 1 : 12}
                        maxLength={128}
                        placeholder={
                          mode === "login"
                            ? bcText("ui.c06bf967017462bb")
                            : bcText("ui.0ced89a646c13a33")
                        }
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={
                          showPassword ? bcText("ui.a60a56c584b3b05b") : bcText("ui.6aeaa6a53d09dcad")
                        }
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                    {fieldError("password")}
                    {mode !== "login" && (
                      <div className="password-strength" aria-live="polite">
                        <div className="strength-bars">
                          {[1, 2, 3, 4].map((n) => (
                            <span
                              key={n}
                              className={
                                n <= strength.score
                                  ? bcText("ui.ebf3f543c3fe36b2", [strength.score])
                                  : ""
                              }
                            />
                          ))}
                        </div>
                        <span>{strength.label}</span>
                      </div>
                    )}
                  </div>
                  {mode !== "login" && (
                    <div className="field">
                      <label htmlFor="confirmPassword">{bcText("ui.5ac265f396a2c586")}</label>
                      <input
                        {...inputProps("confirmPassword")}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder={bcText("ui.43e2137670827338")}
                        minLength={12}
                        maxLength={128}
                        required
                      />
                      {fieldError("confirmPassword")}
                    </div>
                  )}
                </>
              )}
              {isSignup && <ResidenceFields />}
              {isSignup && (
                <div className="field-row school-row">
                  <div className="field">
                    <label htmlFor="role">{bcText("ui.09bdccc5fb698cfb")}</label>
                    <select {...inputProps("role")} defaultValue="" required>
                      <option value="" disabled>{" " + bcText("ui.b6c008ef06882483") + " "}</option>
                      {roles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                    {fieldError("role")}
                  </div>
                </div>
              )}
              {mode === "login" && (
                <div className="login-options">
                  <label className="checkbox-label">
                    <input type="checkbox" name="remember" />{" " + bcText("ui.f93267aa11e83f8a") + " "}</label>
                  <Link href="/forgot-password">{bcText("ui.30c1d8d3e9128893")}</Link>
                </div>
              )}
              {mode === "verify-email" && (
                <div className="field">
                  <label htmlFor="code">{bcText("ui.3ee75029c70e284c")}</label>
                  <input
                    {...inputProps("code")}
                    className="code-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    placeholder={bcText("ui.91b4d142823f7d20")}
                    required
                  />
                  {fieldError("code")}
                </div>
              )}
              <button
                className="primary-button"
                type="submit"
                disabled={busy || (mode === "reset-password" && !token)}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={18} className="spin" />{" " + bcText("ui.4660a983366f7101") + " "}</>
                ) : (
                  <>
                    {details.button}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              {mode === "signup" && (
                <p className="form-fine-print">
                  <LockKeyhole size={12} />{" " + bcText("ui.67ed5e3504a262ea") + " "}</p>
              )}
              {mode === "verify-email" && (
                <p className="resend-line">{" " + bcText("ui.0b3e15004facc086")}{" "}
                  <button
                    type="button"
                    disabled={busy || cooldown > 0}
                    onClick={resend}
                  >
                    {cooldown ? bcText("ui.ac91a1cfd32ea590", [cooldown]) : bcText("ui.b97457409ab5b375")}
                  </button>
                </p>
              )}
            </form>
          )}
          {["forgot-password", "reset-password", "verify-email"].includes(
            mode,
          ) && (
            <Link
              className="back-link"
              href={mode === "reset-password" ? "/forgot-password" : "/login"}
            >
              <ArrowLeft size={15} />
              {mode === "reset-password"
                ? bcText("ui.6e14e7d721d75a60")
                : bcText("ui.71fe31ccd37c3268")}
            </Link>
          )}
          {isSignup && (
            <div className="school-note">
              <GraduationCap size={17} />
              <span>{" " + bcText("ui.2600f968a4b91f48") + " "}<br />{" " + bcText("ui.3df1ad2ded75efb5") + " "}</span>
            </div>
          )}
        </div>
      }
    </Localized>
  );
}
