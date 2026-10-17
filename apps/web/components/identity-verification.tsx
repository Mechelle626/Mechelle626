"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useState } from "react";
import Link from "next/link";
import SchoolCamera from "./school-camera";
import SchoolIdUploader from "./school-id-uploader";
import VerificationChecklist from "./verification-checklist";
import { statusLabels, type IdentityStatus } from "../lib/onboarding/contracts";
export default function IdentityVerification() {
  const [status, setStatus] = useState<IdentityStatus | null>(null),
    [file, setFile] = useState<File | null>(null),
    [method, setMethod] = useState<"upload" | "camera">("upload"),
    [alternate, setAlternate] = useState(false),
    [type, setType] = useState("passport"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/onboarding/identity/status", {
        cache: "no-store",
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setStatus(v);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const collecting = status?.request?.status === "collecting",
    selfie = !status?.request;
  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("type", selfie ? "selfie" : alternate ? type : "institution_id");
      form.set("method", selfie ? "camera" : method);
      if (!selfie && status?.request) form.set("requestId", status.request.id);
      form.set("document", file);
      const r = await fetch("/api/onboarding/identity/document", {
        method: "POST",
        body: form,
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      setStatus(v.verification);
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function restart() {
    setStatus((s) => (s ? { ...s, request: null } : s));
    setFile(null);
    setError("");
  }
  return (
    <Localized>
      {
        <div className="auth-form-wrap identity-form">
          <div className="section-marker">
            <span />{" " + bcText("ui.1b464bb68b81102f") + " "}</div>
          <h2>{bcText("ui.8fd3770076fd5b65")}</h2>
          <p className="form-description">{" " + bcText("ui.6fae4219b178ec35") + " "}</p>
          {error && (
            <p className="message error-message" role="alert">
              {error}
            </p>
          )}
          {status?.checklist && <VerificationChecklist checklist={status.checklist} />}
          {!status ? (
            <button className="text-button" onClick={load}>
              {error ? bcText("ui.bd3e14f7c803d502") : bcText("ui.bab117c96a6814f3")}
            </button>
          ) : status.request && !collecting ? (
            <>
              <div className="identity-status" role="status">
                <h3>{statusLabels[status.request.status]}</h3>
                <p>
                  {status.request.notes ??
                    bcText("ui.f884eb9d148a71e9")}
                </p>
              </div>
              {status.status === "verified" ? (
                <>
                  <p>{" " + bcText("ui.020d61aa4cbf0c87") + " "}</p>
                  <Link href="/tutorial" className="primary-button">{" " + bcText("ui.fb6ce43cb3747a4f") + " "}</Link>
                  <Link href="/discover" className="school-inline-button">{" " + bcText("ui.ba0ca693b2e040b3") + " "}</Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={load}
                  >{" " + bcText("ui.8b5c036b70a67f1a") + " "}</button>
                  <button
                    type="button"
                    className="school-inline-button"
                    disabled={busy}
                    onClick={restart}
                  >
                    {["additional_information_required", "rejected"].includes(
                      status.request.status,
                    )
                      ? bcText("ui.ecff0e654dd6d09f")
                      : bcText("ui.787f9456bb24e187")}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <ol className="identity-steps">
                <li aria-current={selfie ? "step" : undefined}>{" " + bcText("ui.dca60f068299433e") + " "}</li>
                <li aria-current={collecting ? "step" : undefined}>{" " + bcText("ui.e43c21f2234d3bc7") + " "}</li>
                <li>{bcText("ui.34261b21e624ea24")}</li>
              </ol>
              {selfie ? (
                <>
                  <SchoolCamera
                    key="selfie"
                    purpose="selfie"
                    onCapture={setFile}
                    disabled={busy}
                    showPreviewHeading
                  />
                  <p className="verification-hint">{" " + bcText("ui.18595e216c4aac71") + " "}</p>
                </>
              ) : (
                <>
                  <h3>{bcText("ui.1d02943ff5176136")}</h3>
                  <p>{" " + bcText("ui.53c38397da8f3c45") + " "}</p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={alternate}
                      disabled={busy}
                      onChange={(e) => {
                        setAlternate(e.target.checked);
                        setFile(null);
                      }}
                    />{" " + bcText("ui.2601f06771778d4c") + " "}</label>
                  {alternate && (
                    <>
                      <div className="field">
                        <label htmlFor="alternative-document">{" " + bcText("ui.554b26a8f440a05e") + " "}</label>
                        <select
                          id="alternative-document"
                          value={type}
                          disabled={busy}
                          onChange={(e) => {
                            setType(e.target.value);
                            setFile(null);
                          }}
                        >
                          <option value="passport">{bcText("ui.3173c1c8cfe02e32")}</option>
                          <option value="drivers_license">{" " + bcText("ui.8ce12e53f1eacff1") + " "}</option>
                          <option value="national_id">{" " + bcText("ui.092bcd77169cb72e") + " "}</option>
                          <option value="government_id">{" " + bcText("ui.fd979f8ee3a419d7") + " "}</option>
                        </select>
                      </div>
                      <p className="local-note">{" " + bcText("ui.49698a15244497d3") + " "}</p>
                    </>
                  )}
                  <fieldset className="identity-methods" disabled={busy}>
                    <legend>{bcText("ui.c1e08d9356489615")}</legend>
                    <label>
                      <input
                        type="radio"
                        checked={method === "upload"}
                        onChange={() => {
                          setMethod("upload");
                          setFile(null);
                        }}
                        name="identity-method"
                      />
                      {alternate
                        ? bcText("ui.5a6beae2b0898b83")
                        : bcText("ui.fb91abb52f3ac0f8")}
                    </label>
                    <label>
                      <input
                        type="radio"
                        checked={method === "camera"}
                        onChange={() => {
                          setMethod("camera");
                          setFile(null);
                        }}
                        name="identity-method"
                      />
                      {alternate
                        ? bcText("ui.4fca565ba33a8769")
                        : bcText("ui.8864b78393e4c6d0")}
                    </label>
                  </fieldset>
                  {method === "camera" ? (
                    <SchoolCamera
                      key={alternate ? type : "institution_id"}
                      onCapture={setFile}
                      disabled={busy}
                      showPreviewHeading
                    />
                  ) : (
                    <SchoolIdUploader
                      purpose="identity"
                      key={alternate ? type : "institution_id"}
                      file={file}
                      onChange={setFile}
                      disabled={busy}
                    />
                  )}
                </>
              )}
              {!status.configured && (
                <p role="alert" className="message error-message">{" " + bcText("ui.88c995fc6c0232a8") + " "}</p>
              )}
              <button
                className="primary-button"
                type="button"
                onClick={submit}
                disabled={busy || !file || !status.configured}
              >
                {busy
                  ? bcText("ui.49195f559e4a9f5b")
                  : selfie
                    ? bcText("ui.c5f30a1c5ba8f884")
                    : bcText("ui.808b3c2b734393b1")}
              </button>
              {collecting && (
                <button
                  type="button"
                  className="school-inline-button"
                  disabled={busy}
                  onClick={restart}
                >{" " + bcText("ui.9ae94c14e53eb389") + " "}</button>
              )}
            </>
          )}
          <p className="verification-privacy">{" " + bcText("ui.ef4d8dc85403db17") + " "}</p>
          <Link className="school-inline-button" href="/settings">{" " + bcText("ui.a587aa1f4ffc5016") + " "}</Link>
        </div>
      }
    </Localized>
  );
}
