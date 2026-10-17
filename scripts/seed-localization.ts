import { readFile } from "node:fs/promises";
import { db, transaction } from "../apps/web/lib/auth/db";
import { languages } from "../apps/web/lib/i18n/config";
const en = JSON.parse(await readFile("apps/web/messages/en.json", "utf8"));
await transaction(async (c) => {
  for (const l of languages) {
    await c.query(
      `INSERT INTO braincraze.languages(code,language_name,native_name,direction) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO NOTHING`,
      [
        l.code,
        new Intl.DisplayNames(["en"], { type: "language" }).of(l.code),
        l.name,
        ["ar", "fa", "he", "yi"].includes(l.code) ? "rtl" : "ltr",
      ],
    );
  }
  for (const [key, value] of Object.entries(en))
    await c.query(
      `INSERT INTO braincraze.translation_keys(translation_key,english_source) VALUES($1,$2) ON CONFLICT(translation_key) DO UPDATE SET english_source=EXCLUDED.english_source,updated_at=CASE WHEN braincraze.translation_keys.english_source<>EXCLUDED.english_source THEN now() ELSE braincraze.translation_keys.updated_at END`,
      [key, value],
    );
  for (const l of languages) {
    const entries = JSON.parse(
      await readFile(`apps/web/messages/${l.code}.json`, "utf8"),
    );
    for (const [key, value] of Object.entries(entries)) {
      if (!(key in en)) continue;
      await c.query(
        `INSERT INTO braincraze.translations(language_id,translation_key,translation_value,review_status) SELECT id,$2,$3,$4 FROM braincraze.languages WHERE code=$1 ON CONFLICT(language_id,translation_key) DO NOTHING`,
        [
          l.code,
          key,
          value,
          l.code === "en" ? "Approved" : "Pending Language Review",
        ],
      );
    }
  }
});
console.log(
  "Language catalogs seeded without overwriting administrator edits.",
);
await db.end();
