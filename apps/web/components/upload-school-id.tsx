"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { roles } from "../lib/auth/contracts";
import type {
  AcademicRole,
  SchoolOption,
  SchoolStatus,
} from "../lib/school/contracts";
import SchoolSearch from "./school-search";
import SchoolIdUploader from "./school-id-uploader";
import SchoolCamera from "./school-camera";

export default function UploadSchoolId({
  camera = false,
}: {
  camera?: boolean;
}) {
  const [school, setSchool] = useState<SchoolOption | null>(null);
  const [role, setRole] = useState<AcademicRole>(bcText("ui.2a164d5415787b6e") as AcademicRole);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<SchoolStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  async function load() {
    try {
      setError("");
      const response = await fetch("/api/school/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? bcText("ui.03e3aae7780e7608"));
      setStatus(data);
      setRole(data.role);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !file || !school || !status?.uploadsConfigured) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("schoolId", school.id);
      form.set("role", role);
      form.set("method", camera ? "camera" : "upload");
      form.set("document", file);
      const response = await fetch("/api/school/submit-document", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ??
            bcText("ui.e50b131c9925ab7c"),
        );
      setStatus(data.verification);
      setFile(null);
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message || bcText("ui.b8d49080084b9403"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Localized>
      {
        <div className="auth-form-wrap upload-id-form">
          <div className="section-marker">
            <span />
            {camera ? bcText("ui.a73a03aa6c6c4c53") : bcText("ui.7021b9933aabd267")}
          </div>
          <h2>{camera ? bcText("ui.0400ac32a71eaab7") : bcText("ui.14c2fbaa3227b1e8")}</h2>
          <p className="form-description">{" " + bcText("ui.fda15e679bc7521a") + " "}</p>
          {error && (
            <p className="message error-message" role="alert">
              {error}
            </p>
          )}
          {submitted ? (
            <div className="school-review-status" role="status">
              <h3>{bcText("ui.33c29c46b8d1889f")}</h3>
              <p>
                {status?.request?.schoolName} · {status?.request?.role}
              </p>
              <p>{" " + bcText("ui.de41539d99366451") + " "}</p>
            </div>
          ) : !status ? (
            <button type="button" className="text-button" onClick={load}>
              {error ? bcText("ui.a0f859bc4db2c234") : bcText("ui.bab117c96a6814f3")}
            </button>
          ) : (
            <form onSubmit={submit}>
              {status.request && (
                <p className="local-note">{" " + bcText("ui.00bd86a4a3a7fe0f") + " "}</p>
              )}
              <fieldset disabled={busy} className="id-upload-fields">
                <div className="field">
                  <label htmlFor="upload-role">{bcText("ui.14736a2eb9f4159f")}</label>
                  <select
                    id="upload-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as AcademicRole)}
                  >
                    {roles.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <SchoolSearch value={school} onChange={setSchool} />
                {camera ? (
                  <SchoolCamera
                    onCapture={setFile}
                    disabled={busy}
                    showPreviewHeading
                  />
                ) : (
                  <SchoolIdUploader
                    file={file}
                    onChange={setFile}
                    disabled={busy}
                  />
                )}
              </fieldset>
              {!status.uploadsConfigured && (
                <p className="message error-message" role="alert">{" " + bcText("ui.5be07d9a8fcb68ed") + " "}</p>
              )}
              <button
                className="primary-button"
                disabled={busy || !school || !file || !status.uploadsConfigured}
              >
                {busy ? bcText("ui.49195f559e4a9f5b") : bcText("ui.4ef17f5a3afdb4bd")}
              </button>
            </form>
          )}
          <p className="verification-hint">{" " + bcText("ui.3d1862ba866edcaf") + " "}</p>
          {camera && (
            <Link
              href="/school-verification/upload"
              className="school-inline-button"
            >{" " + bcText("ui.6d293f4421244aa5") + " "}</Link>
          )}
          <Link href="/school-verification" className="school-inline-button">{" " + bcText("ui.eafa66445cc885d5") + " "}</Link>
        </div>
      }
    </Localized>
  );
}
