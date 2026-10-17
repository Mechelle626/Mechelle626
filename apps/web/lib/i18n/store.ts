import { message as bcText } from "./source";
import { db, transaction } from "../auth/db";
import { AuthError } from "../auth/security";
export interface Language {
  code: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  enabled: boolean;
}
export async function listLanguages(
  includeDisabled = false,
): Promise<Language[]> {
  return (
    await db.query(
      'SELECT code,language_name AS name,native_name AS "nativeName",direction,enabled FROM braincraze.languages WHERE ($1 OR enabled) ORDER BY code',
      [includeDisabled],
    )
  ).rows;
}
export async function enabledLocale(code: unknown): Promise<string | null> {
  if (typeof code !== "string" || code.length > 60) return null;
  const row = (
    await db.query(
      "SELECT code FROM braincraze.languages WHERE enabled AND lower(code)=lower($1)",
      [code],
    )
  ).rows[0];
  return row?.code ?? null;
}
export async function assertLocale(code: unknown) {
  const result = await enabledLocale(code);
  if (!result) throw new AuthError(400, bcText("ui.093d327b232636b7"));
  return result;
}
export async function catalog(code: string) {
  const rows = (
    await db.query(
      `SELECT k.translation_key,k.english_source,t.translation_value FROM braincraze.translation_keys k LEFT JOIN braincraze.translations t ON t.translation_key=k.translation_key AND t.language_id=(SELECT id FROM braincraze.languages WHERE code=$1 AND enabled)`,
      [code],
    )
  ).rows;
  const result: Record<string, string> = Object.create(null);
  for (const r of rows) {
    const value = r.translation_value?.trim()
      ? r.translation_value
      : r.english_source;
    result[r.translation_key] = value;
    result[r.english_source] = value;
  }
  return { ...result };
}
export async function coverage() {
  return (
    await db.query(`SELECT l.code,l.language_name,l.native_name,l.enabled,
 count(k.translation_key)::int AS total_keys,
 count(t.id) FILTER(WHERE length(trim(t.translation_value))>0)::int AS translated_keys,
 (count(k.translation_key)-count(t.id) FILTER(WHERE length(trim(t.translation_value))>0))::int AS missing_keys,
 count(t.id) FILTER(WHERE t.review_status='Approved')::int AS approved_keys,
 round(100.0*count(t.id) FILTER(WHERE length(trim(t.translation_value))>0)/greatest(count(k.translation_key),1),2)::float AS percentage_complete
 FROM braincraze.languages l CROSS JOIN braincraze.translation_keys k LEFT JOIN braincraze.translations t ON t.language_id=l.id AND t.translation_key=k.translation_key GROUP BY l.id ORDER BY l.code`)
  ).rows;
}
export async function translationRows(
  code: string,
  q = "",
  status = "",
  missing = false,
  page = 1,
) {
  return (
    await db.query(
      `SELECT k.translation_key,k.english_source,t.translation_value,coalesce(t.review_status,'Draft') AS review_status,t.updated_at,
 count(*) OVER()::int AS total FROM braincraze.translation_keys k LEFT JOIN braincraze.translations t ON t.translation_key=k.translation_key AND t.language_id=(SELECT id FROM braincraze.languages WHERE code=$1)
 WHERE (strpos(lower(k.translation_key),lower($2))>0 OR strpos(lower(k.english_source),lower($2))>0 OR strpos(lower(coalesce(t.translation_value,'')),lower($2))>0)
 AND ($3='' OR coalesce(t.review_status,'Draft')=$3) AND (NOT $4 OR coalesce(trim(t.translation_value),'')='') ORDER BY k.translation_key LIMIT 30 OFFSET $5`,
      [code, q, status, missing, (page - 1) * 30],
    )
  ).rows;
}
export function placeholders(text: string) {
  return [...text.matchAll(/\{\d+\}/g)]
    .map((x) => x[0])
    .sort()
    .join(",");
}
export function formattingTokens(text: string) {
  const tokens = [
    ...text.matchAll(
      /\{\{[^}]+\}\}|\$\{[^}]+\}|\{[ \t]*[A-Za-z_][\w. -]*[ \t]*\}|%%|%(?:\d+\$)?[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?[sdifFeEgGxXouc]|<\/?[a-zA-Z][^>]*>|https?:\/\/[^\s]+|\n/g,
    ),
  ]
    .map((x) => x[0])
    .sort();
  const tags = text.match(/<\/?[A-Za-z][^>]*>/g) ?? [];
  return JSON.stringify({ tokens, tags });
}
export async function saveTranslation(
  actor: string,
  code: string,
  key: string,
  value: string,
  status: string,
  expected: string | null,
) {
  if (!value.trim()) value = "";
  return transaction(async (c) => {
    const source = (
      await c.query(
        "SELECT english_source FROM braincraze.translation_keys WHERE translation_key=$1 FOR UPDATE",
        [key],
      )
    ).rows[0];
    if (!source) throw new AuthError(404, bcText("ui.23a97964a4061ecd"));
    if (
      value &&
      (placeholders(value) !== placeholders(source.english_source) ||
        formattingTokens(value) !== formattingTokens(source.english_source))
    )
      throw new AuthError(400, bcText("ui.8047b4e4bda8a577"));
    if (!value && status !== "Draft")
      throw new AuthError(400, bcText("ui.cfc9e26c719aaa7f"));
    const lang = (
      await c.query("SELECT id FROM braincraze.languages WHERE code=$1", [code])
    ).rows[0];
    if (!lang) throw new AuthError(404, bcText("ui.6f50fd451b438583"));
    const old = (
      await c.query(
        "SELECT updated_at FROM braincraze.translations WHERE language_id=$1 AND translation_key=$2 FOR UPDATE",
        [lang.id, key],
      )
    ).rows[0];
    if ((old?.updated_at?.toISOString() ?? null) !== expected)
      throw new AuthError(409, bcText("ui.baf43724e0424e67"));
    await c.query(
      `INSERT INTO braincraze.translations(language_id,translation_key,translation_value,review_status,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(language_id,translation_key) DO UPDATE SET translation_value=$3,review_status=$4,updated_at=clock_timestamp(),updated_by=$5`,
      [lang.id, key, value, status, actor],
    );
    await c.query(
      "INSERT INTO braincraze.translation_audit(actor_id,action,details) VALUES($1,$2,$3)",
      [
        actor,
        "translation.updated",
        JSON.stringify({ code, key, value, status }),
      ],
    );
  });
}
