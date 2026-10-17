"use client";
import { message as bcText } from "../lib/i18n/source";

import { useState, useEffect } from "react";
import { Localized, useLocalization, useT } from "./localization";
import type { Language } from "../lib/i18n/store";
export function BrowserLanguageSuggestion({
  suggestion,
}: {
  suggestion: Language | null;
}) {
  const [open, setOpen] = useState(!!suggestion),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { change } = useLocalization(),
    t = useT();
  if (!open || !suggestion) return null;
  async function choose(code: string) {
    setBusy(true);
    try {
      await change(code);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Localized>
      <aside
        className="language-suggestion"
        aria-label={bcText("ui.cd7107c69bd7ef51")}
      >
        <p>
          {t(bcText("ui.08e58efd5c11b998")).replace(
            "{0}",
            () => suggestion.nativeName,
          )}
        </p>
        <div className="form-actions">
          <button disabled={busy} onClick={() => choose(suggestion.code)}>
            {bcText("ui.d23735e985f2d374")}
          </button>
          <button disabled={busy} onClick={() => choose("en")}>
            {bcText("ui.ca351f6fda3136f4")}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setOpen(false);
              document
                .querySelector<HTMLSelectElement>(".locale-bar select")
                ?.focus();
            }}
          >
            {bcText("ui.d1c8b27ccc08ed73")}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </aside>
    </Localized>
  );
}
export function TranslationReporter() {
  const { catalog, locale } = useLocalization();
  const t = useT();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [key, setKey] = useState(""),
    [type, setType] = useState(bcText("ui.9e13ff6cf48adca5")),
    [notes, setNotes] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  // Only actual catalog IDs are reportable; source aliases are excluded.
  const keys = Object.keys(catalog).filter((k) => /^ui\.|^email\./.test(k));
  return (
    <Localized>
      <footer className="translation-reporter">
        <button
          onClick={() => {
            setOpen(!open);
            setMessage("");
          }}
        >
          {bcText("ui.a2255a84597694b5")}
        </button>
        {open && (
          <form
            className="settings-section"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                const r = await fetch("/api/localization/reports", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ language: locale, key, type, notes }),
                });
                const b = await r.json();
                if (!r.ok) throw new Error(b.error);
                setMessage(b.message);
                setNotes("");
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>{bcText("ui.da0e0e116c5ebe74")}</p>
            <label>
              {bcText("ui.83f33de7e6c2046f")}
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              {bcText("ui.7a0121496cb59ca1")}
              <select
                aria-label={bcText("ui.7a0121496cb59ca1")}
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
              >
                <option value="">{bcText("ui.70f111077aea2e34")}</option>
                {keys
                  .filter((k) =>
                    (catalog[k] + " " + k)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .slice(0, 100)
                  .map((k) => (
                    <option key={k} value={k}>
                      {k} — {catalog[k].slice(0, 100)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {bcText("ui.8c9986f3baa4098e")}
              <select aria-label={bcText("ui.8c9986f3baa4098e")} value={type} onChange={(e) => setType(e.target.value)}>
                {[
                  bcText("ui.9e13ff6cf48adca5"),
                  bcText("ui.4a9054fea97a5032"),
                  bcText("ui.383a1e46b3fe1fdd"),
                ].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {bcText("ui.8a7525b1492fb848")}
              <textarea
                aria-label={bcText("ui.8a7525b1492fb848")}
                required
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <button disabled={busy}>{t(bcText("ui.b41fd589ad91ed78"))}</button>
          </form>
        )}
        {message && <p role="status">{t(message)}</p>}
      </footer>
    </Localized>
  );
}
