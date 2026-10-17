"use client";
import { message as bcText } from "../lib/i18n/source";

import { useFormatLocale } from "./localization";
import { Localized } from "./localization";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { maxDocumentBytes } from "../lib/school/contracts";

export default function SchoolIdUploader({
  file,
  onChange,
  disabled = false,
  purpose = "school",
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  purpose?: "school" | "identity";
}) {
  const locale = useFormatLocale();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file || !["image/jpeg", "image/png"].includes(file.type)) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(files: File[]) {
    if (disabled) return;
    const selected = files[0];
    let message = "";
    if (files.length !== 1)
      message =
        purpose === "identity"
          ? bcText("ui.856ee007c1facb82")
          : bcText("ui.6008bbe966430726");
    else if (!selected.size) message = bcText("ui.24bedd4105c41b8a");
    else if (selected.size > maxDocumentBytes)
      message = bcText("ui.bd68a9f7641ca463");
    else if (
      !/\.(jpe?g|png|pdf)$/i.test(selected.name) ||
      (selected.type &&
        !["image/jpeg", "image/png", "application/pdf"].includes(selected.type))
    )
      message = bcText("ui.dd0a959c0e0c27d4");
    setError(message);
    onChange(message ? null : selected);
    if (input.current) input.current.value = "";
  }
  return (
    <Localized>
      {
        <div className="id-uploader">
          <ul className="id-instructions">
            <li>
              {purpose === "identity"
                ? bcText("ui.4beef43fccaef797")
                : bcText("ui.9fae84111769fd23")}
            </li>
            <li>{bcText("ui.e5cbfb772cd1fc98")}</li>
            <li>{bcText("ui.3fec422d6b96d17a")}</li>
          </ul>
          <div
            className={bcText("ui.3d17e01af0c3b495", [dragging ? "id-dragging" : ""])}
            role="group"
            aria-label={
              purpose === "identity"
                ? bcText("ui.b031d732e74fc788")
                : bcText("ui.86232592771d9475")
            }
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = disabled ? "none" : "copy";
              if (!disabled) setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              select(Array.from(e.dataTransfer.files));
            }}
          >
            <Upload size={28} aria-hidden="true" />
            <strong>
              {purpose === "identity"
                ? bcText("ui.044300d844a1ac26")
                : bcText("ui.8a1a7d132dfe78f8")}
            </strong>
            <span>{bcText("ui.07cdd36ee3097b5e")}</span>
            <input
              ref={input}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              aria-label={
                purpose === "identity"
                  ? bcText("ui.bf538247502b907b")
                  : bcText("ui.a85696536ba8986e")
              }
              disabled={disabled}
              onChange={(e) => {
                if (e.target.files?.length) select(Array.from(e.target.files));
              }}
            />
          </div>
          {error && (
            <p className="message error-message" role="alert">
              {error}
            </p>
          )}
          {file && (
            <div className="id-preview">
              {preview ? (
                <img
                  src={preview}
                  alt={
                    purpose === "identity"
                      ? bcText("ui.efd706f1ff3d6156")
                      : bcText("ui.02fad209caa058cb")
                  }
                />
              ) : (
                <FileText size={34} aria-hidden="true" />
              )}
              <div className="id-file-details">
                <strong>{file.name}</strong>
                <span>
                  {new Intl.NumberFormat(locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }).format(file.size / 1024)}{" "}{" " + bcText("ui.97ee1b8dd0d5456b") + " "}{file.type === "application/pdf"
                    ? bcText("ui.4b9f4afd7ae56e12")
                    : ""}
                </span>
              </div>
              <button
                type="button"
                className="school-inline-button"
                disabled={disabled}
                onClick={() => {
                  onChange(null);
                  setError("");
                  if (input.current) input.current.value = "";
                }}
              >
                <X size={15} />{" " + bcText("ui.b57e3abc42c8cf5f") + " "}</button>
            </div>
          )}
        </div>
      }
    </Localized>
  );
}
