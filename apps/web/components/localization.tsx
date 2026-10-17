"use client";
import { message as bcText } from "../lib/i18n/source";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useState,
  useId,
  type ReactNode,
  type ReactElement,
} from "react";
import { formattingLocale, type Locale } from "../lib/i18n/config";
import { translate, type Catalog } from "../lib/i18n/translate";
import type { Language } from "../lib/i18n/store";
const Context = createContext<{
  languages: Language[];
  region?: string | null;
  locale: Locale;
  catalog: Catalog;
  change: (locale: Locale) => Promise<void>;
}>({ locale: "en", catalog: {}, languages: [], change: async () => {} });
export function LocalizationProvider({
  locale: initial,
  catalog: initialCatalog,
  children,
  languages,
  region,
}: {
  locale: Locale;
  catalog: Catalog;
  languages: Language[];
  region?: string | null;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState(initial),
    [catalog, setCatalog] = useState(initialCatalog);
  useEffect(() => {
    setLocale(initial);
    setCatalog(initialCatalog);
  }, [initial, initialCatalog]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = languages.find(l=>l.code===locale)?.direction ?? "ltr";
  }, [locale, languages]);
  async function change(next: Locale) {
    const r = await fetch("/api/onboarding/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    });
    const v = await r.json();
    if (!r.ok) throw new Error(v.error);
    const response = await fetch("/api/onboarding/messages?language=" + next);
    if (!response.ok)
      throw new Error(bcText("ui.041a54974d3a14d6"));
    const messages = await response.json();
    setLocale(next);
    setCatalog(messages);
  }
  return (
    <Context.Provider value={{ locale, catalog, change, languages, region }}>
      {children}
    </Context.Provider>
  );
}
export const useLocalization = () => useContext(Context);
export const useFormatLocale = () => {const {locale,region}=useContext(Context);return formattingLocale(locale,region);};
export const useLocale = () => useContext(Context).locale;
export function useT() {
  const { catalog } = useContext(Context);
  return (message: string) => translate(message, catalog);
}
// Translate application copy while preserving form values, identifiers, and marked user content.
export function Localized({ children }: { children: ReactNode }) {
  const { catalog, locale, region } = useContext(Context);
  function walk(node: ReactNode): ReactNode {
    if (typeof node === "string") return translate(node, catalog);
    if (typeof node === "number")
      return new Intl.NumberFormat(formattingLocale(locale,region), { useGrouping: false }).format(node);
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<Record<string, any>>;
    const p = element.props;
    if (
      p["data-no-translate"] ||
      /\b(content-body|school-file-name|id-file-details)\b/.test(
        p.className ?? "",
      ) ||
      ["script", "style", "code", "pre", "textarea"].includes(
        String(element.type),
      )
    )
      return element;
    const props: Record<string, any> = {};
    if (typeof element.type === "string") {
      for (const key of ["placeholder", "title", "alt", "aria-label"])
        if (typeof p[key] === "string") props[key] = translate(p[key], catalog);
      if (
        element.type === "option" &&
        p.value === undefined &&
        typeof p.children === "string"
      )
        props.value = p.children;
    }
    if (p.children !== undefined)
      props.children = Children.map(p.children, walk);
    return cloneElement(element, props);
  }
  return <>{Children.map(children, walk)}</>;
}
export function LanguageSelector() {
  const id = useId();
  const { locale, change, languages } = useContext(Context),
    t = useT();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="language-picker">
      <label htmlFor={id}>{t(bcText("ui.a4fe65264ef7dbb3"))}</label>
      <select
        id={id}
        aria-label={t(bcText("ui.a4fe65264ef7dbb3"))}
        value={locale}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          setError("");
          try {
            await change(e.target.value as Locale);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {languages.map((x) => (
          <option key={x.code} value={x.code} lang={x.code}>
            {x.nativeName}
          </option>
        ))}
      </select>
      {locale !== "en" && (
        <span className="translation-note">
          {t(
            bcText("ui.abf0101f06171e70"),
          )}
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
