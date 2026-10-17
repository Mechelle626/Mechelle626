// Source resolution preserves the existing Localized/useT contract. Actual locale
// values are loaded from the database by LocalizationProvider.
import english from "../../messages/en.json" with { type: "json" };
export function message(key: string, values: unknown[] = []): string {
  const source = (english as Record<string, string>)[key];
  if (source === undefined) throw new Error("Unknown translation key: " + key);
  return source.replace(/\{(\d+)\}/g, (_, i) =>
    String(values[Number(i)] ?? "{" + i + "}"),
  );
}
