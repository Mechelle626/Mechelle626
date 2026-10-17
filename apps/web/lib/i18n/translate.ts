import type { Locale } from "./config";
export type Catalog = Record<string, string>;
const patterns = new WeakMap<
  Catalog,
  { regex: RegExp; value: string; slots: string[] }[]
>();
export function translate(text: string, catalog: Catalog) {
  const key = text.replace(/\s+/g, " ").trim();
  if (!key) return text;
  const value = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
  if (typeof value === "string" && value)
    return text.replace(text.trim(), () => value);
  let compiled = patterns.get(catalog);
  if (!compiled) {
    compiled = [];
    for (const [source, value] of Object.entries(catalog)) {
      const slots = source.match(/\{\d+\}/g);
      if (!slots) continue;
      const pieces = source
        .split(/\{\d+\}/g)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      compiled.push({
        regex: new RegExp("^" + pieces.join("(.*?)") + "$"),
        value,
        slots,
      });
    }
    patterns.set(catalog, compiled);
  }
  for (const pattern of compiled) {
    const match = key.match(pattern.regex);
    if (match) {
      let result = pattern.value;
      pattern.slots.forEach((slot, i) => {
        result = result.replaceAll(slot, () => match[i + 1]);
      });
      return text.replace(text.trim(), () => result);
    }
  }
  return text;
}
export const dateFormat = (
  value: string | number | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) => new Intl.DateTimeFormat(locale, options).format(new Date(value));
export const numberFormat = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale).format(value);
export const currencyFormat = (
  value: number,
  currency: string,
  locale: Locale,
) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);

export function durationFormat(seconds:number,locale:string){
 const digits=new Intl.NumberFormat(locale,{minimumIntegerDigits:2,useGrouping:false});
 return `${digits.format(Math.floor(seconds/60))}:${digits.format(seconds%60)}`;
}
