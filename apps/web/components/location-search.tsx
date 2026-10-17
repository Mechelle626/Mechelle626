"use client";
import { message as bcText } from "../lib/i18n/source";

import { Localized } from "./localization";

import { useEffect, useId, useState } from "react";
import { useT } from "./localization";
type Option = { code: string; name: string };
export default function LocationSearch({
  kind,
  label,
  name,
  codeName,
  country,
  onSelect,
  required = true,
  initial = "",
}: {
  kind: "countries" | "regions" | "institutions";
  label: string;
  name?: string;
  codeName?: string;
  country?: string;
  onSelect?: (option: Option | null, text: string) => void;
  required?: boolean;
  initial?: string;
}) {
  const id = useId(),
    t = useT();
  const [text, setText] = useState(initial),
    [code, setCode] = useState(""),
    [options, setOptions] = useState<Option[]>([]),
    [manual, setManual] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (initial) setText((current) => current || initial);
  }, [initial]);
  useEffect(() => {
    if (kind === "regions") {
      setText("");
      setCode("");
      onSelect?.(null, "");
    }
  }, [country]);
  useEffect(() => {
    if (manual) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(
        `/api/onboarding/options?kind=${kind}&q=${encodeURIComponent(text)}&country=${encodeURIComponent(country ?? "")}`,
        { signal: controller.signal },
      )
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setOptions(v.options);
          setError("");
        })
        .catch((e) => {
          if (e.name !== bcText("ui.35217c2db25b53f2"))
            setError(bcText("ui.3a95b6a64965286a"));
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, text, country, manual]);
  const fallback =
    kind === "countries"
      ? bcText("ui.2a6bd368864bd5d7")
      : kind === "regions"
        ? bcText("ui.b203ef1ac96389e6")
        : bcText("ui.198b784eb6611114");
  return (
    <Localized>
      {
        <div className="field location-search">
          <label htmlFor={id}>{t(label)}</label>
          <input
            id={id}
            name={name}
            value={text}
            onChange={(e) => {
              const value = e.target.value,
                selected = manual
                  ? undefined
                  : options.find((x) => x.name === value);
              setText(value);
              setCode(selected?.code ?? "");
              onSelect?.(selected ?? null, value);
            }}
            list={manual ? undefined : id + "-list"}
            autoComplete="off"
            required={required}
            maxLength={160}
            aria-label={t(label)}
          />
          {!manual && (
            <datalist id={id + "-list"}>
              {options.map((x) => (
                <option key={x.code} value={x.name} />
              ))}
            </datalist>
          )}
          {codeName && code && (
            <input type="hidden" name={codeName} value={code} />
          )}
          <button
            type="button"
            className="text-button location-fallback"
            onClick={() => {
              setManual((v) => !v);
              setCode("");
              onSelect?.(null, text);
            }}
          >
            {t(manual ? bcText("ui.c1fb094f290eabfa") : fallback)}
          </button>
          {manual && (
            <span className="verification-hint">
              {t(
                bcText("ui.cda13db412db94c6"),
              )}
            </span>
          )}
          {error && (
            <span className="field-error" role="alert">
              {t(error)}
            </span>
          )}
        </div>
      }
    </Localized>
  );
}
