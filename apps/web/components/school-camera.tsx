"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, X } from "lucide-react";
import { maxDocumentBytes } from "../lib/school/contracts";

export default function SchoolCamera({
  onCapture,
  disabled = false,
  showPreviewHeading = false,
  purpose = "school",
}: {
  onCapture: (file: File | null) => void;
  disabled?: boolean;
  showPreviewHeading?: boolean;
  purpose?: "school" | "selfie";
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const lock = useRef(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) {
        stop();
        lock.current = false;
        setRunning(false);
        setReady(false);
        setBusy(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function start() {
    if (disabled || lock.current) return;
    stop();
    const attempt = generation.current;
    lock.current = true;
    setError("");
    setBusy(true);
    setReady(false);
    // A retake clears the previous evidence before asking for a fresh photo.
    setPreview("");
    onCapture(null);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          purpose === "selfie"
            ? bcText("ui.6cb53a72eb6fe6fc")
            : bcText("ui.e95bbe3fd4655c45"),
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: purpose === "selfie" ? "user" : "environment" },
          width: { ideal: 1600 },
        },
        audio: false,
      });
      if (!mounted.current || attempt !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const element = video.current;
      if (!element) throw new Error(bcText("ui.1171697ef660aa58"));
      element.srcObject = media;
      setRunning(true);
      await element.play();
      if (mounted.current && attempt === generation.current)
        setReady(element.videoWidth > 0);
    } catch (e) {
      if (!mounted.current || attempt !== generation.current) return;
      stop();
      setRunning(false);
      const name = e instanceof Error ? e.name : "";
      setError(
        name === bcText("ui.d9f05fb162a0c239")
          ? bcText("ui.0bce7827c5444990")
          : name === bcText("ui.83e70ccb0be90105")
            ? bcText("ui.20bd70e1ed24e3f2")
            : name === bcText("ui.7429747c2f3d85ac")
              ? bcText("ui.192972ee3cc3f068")
              : e instanceof Error
                ? e.message
                : bcText("ui.3160efbc63e20053"),
      );
    } finally {
      if (
        mounted.current &&
        (attempt === generation.current || generation.current === attempt + 1)
      ) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function capture() {
    const element = video.current;
    if (
      disabled ||
      lock.current ||
      !running ||
      !element?.videoWidth ||
      !element.videoHeight
    )
      return;
    const attempt = generation.current;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        4096 / Math.max(element.videoWidth, element.videoHeight),
      );
      canvas.width = Math.max(1, Math.round(element.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error(bcText("ui.d3dca8deff65e51d"));
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!mounted.current || attempt !== generation.current) return;
      if (!blob || !blob.size || blob.size > maxDocumentBytes)
        throw new Error(
          bcText("ui.3644a2c454f5a3b0"),
        );
      const file = new File([blob], "school-id-capture.jpg", {
        type: "image/jpeg",
      });
      setPreview(URL.createObjectURL(file));
      onCapture(file);
      stop();
      setRunning(false);
      setReady(false);
    } catch (e) {
      if (mounted.current && attempt === generation.current)
        setError((e as Error).message);
    } finally {
      if (
        mounted.current &&
        (attempt === generation.current || generation.current === attempt + 1)
      ) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <Localized>
      {
        <div className="school-camera">
          {showPreviewHeading && preview && (
            <h3 tabIndex={-1}>
              {purpose === "selfie" ? bcText("ui.5d647aab63a05c9e") : bcText("ui.768a946e8994c12b")}
            </h3>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}{" "}
              {purpose === "selfie"
                ? bcText("ui.355ccda953be4cad")
                : bcText("ui.7086a8a0e949ce9d")}
            </p>
          )}
          <div className={bcText("ui.40a4d6c2b980eef1", [running ? "camera-running" : ""])}>
            <video
              ref={video}
              muted
              playsInline
              aria-label={
                purpose === "selfie"
                  ? bcText("ui.7bb3af2afe6af11e")
                  : bcText("ui.0f4a94a342266c9a")
              }
              className={!running ? "camera-hidden" : ""}
              onLoadedData={() => setReady(Boolean(video.current?.videoWidth))}
            />
            {preview && (
              <img
                src={preview}
                alt={
                  purpose === "selfie"
                    ? bcText("ui.972e7ccb7affc890")
                    : bcText("ui.17cb661dc979384a")
                }
              />
            )}
            {running && (
              <div
                className={
                  purpose === "selfie"
                    ? bcText("ui.4dd6bad410aec15f")
                    : "camera-guide"
                }
                aria-hidden="true"
              />
            )}
            {!running && !preview && (
              <div className="camera-placeholder">
                <Camera size={30} />
                <span>
                  {purpose === "selfie"
                    ? bcText("ui.af638384c8734661")
                    : bcText("ui.6246a310e23fee5f")}
                </span>
              </div>
            )}
          </div>
          <p className="verification-hint">
            {purpose === "selfie"
              ? bcText("ui.e1c5852457d6890a")
              : bcText("ui.4910b2daa0dea70e")}
          </p>
          <p className="verification-hint">{" " + bcText("ui.2ebe1429adb61566") + " "}</p>
          <div className="camera-controls">
            {!running ? (
              <button
                type="button"
                className="text-button"
                disabled={disabled || busy}
                onClick={start}
              >
                {preview ? <RotateCcw size={14} /> : <Camera size={14} />}
                {busy
                  ? bcText("ui.cf13458f003dfcf0")
                  : preview
                    ? purpose === "selfie"
                      ? bcText("ui.9ae94c14e53eb389")
                      : bcText("ui.1c62f54c28ffaf99")
                    : purpose === "selfie"
                      ? bcText("ui.ef7198ec78d4d8d3")
                      : bcText("ui.8cbda064f2035e74")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled || busy || !ready}
                  onClick={capture}
                >
                  <Camera size={14} />
                  {purpose === "selfie" ? bcText("ui.21eb6fc35a840fa9") : bcText("ui.985bb9ea2220788a")}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled}
                  onClick={() => {
                    stop();
                    lock.current = false;
                    setRunning(false);
                    setReady(false);
                    setBusy(false);
                  }}
                >
                  <X size={14} />{" " + bcText("ui.c2e8e6cf56113fb6") + " "}</button>
              </>
            )}
          </div>
          {preview && (
            <p className="camera-captured" role="status">{" " + bcText("ui.3583ba0c96002b12") + " "}</p>
          )}
        </div>
      }
    </Localized>
  );
}
