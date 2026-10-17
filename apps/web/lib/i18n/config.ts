// Bootstrap data only. Runtime language choices come from braincraze.languages.
export const languages = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "my", name: "မြန်မာ" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "ms", name: "Bahasa Melayu" },
  { code: "ln", name: "Lingála" },
  { code: "am", name: "አማርኛ" },
  { code: "ti", name: "ትግርኛ" },
  { code: "ar", name: "العربية" },
  { code: "fa", name: "فارسی" },
  { code: "hi", name: "हिन्दी" },
  { code: "he", name: "עברית" },
  { code: "yi", name: "ייִדיש" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "nl", name: "Nederlands" },
  { code: "es", name: "Español" },
] as const;
export type Locale = string;
export const localeCodes = languages.map((x) => x.code) as [
  Locale,
  ...Locale[],
];
export function validLocale(value: unknown): value is Locale {
  return typeof value === "string" && localeCodes.includes(value as Locale);
}
export const direction = (locale: Locale) =>
  ["ar", "fa", "he", "yi"].includes(locale) ? "rtl" : "ltr";
// A regional language tag wins; otherwise use the member's declared country for formatting.
export function formattingLocale(locale: string, region?: string | null) {
  const tag = new Intl.Locale(locale);
  return !tag.region && region && /^[A-Z]{2}$/.test(region)
    ? new Intl.Locale(locale, { region }).toString()
    : locale;
}
