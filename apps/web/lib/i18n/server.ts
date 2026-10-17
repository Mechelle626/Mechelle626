import { cookies, headers } from "next/headers";
import { getSession } from "../auth/session";
import { enabledLocale, catalog, listLanguages } from "./store";
export async function requestLocale(): Promise<string> {
  const user = await getSession();
  return (
    (await enabledLocale(user?.preferred_language)) ??
    (await enabledLocale((await cookies()).get("bc_language")?.value)) ??
    "en"
  );
}
export const loadCatalog = catalog;
export async function browserSuggestion() {
  if ((await cookies()).has("bc_language") || (await getSession())) return null;
  const available = await listLanguages();
  const preferences = ((await headers()).get("accept-language") ?? "")
    .split(",")
    .map((x, i) => {
      const [tag, quality] = x.trim().split(";q=");
      return { tag, q: quality === undefined ? 1 : Number(quality), i };
    })
    .filter((x) => Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { tag } of preferences) {
    const match =
      available.find((l) => l.code.toLowerCase() === tag.toLowerCase()) ??
      available.find(
        (l) => l.code.toLowerCase() === tag.split("-")[0].toLowerCase(),
      );
    if (match) return match.code === "en" ? null : match;
  }
  return null;
}

export async function requestFormattingRegion() {
  return (await getSession())?.country_code ?? null;
}
