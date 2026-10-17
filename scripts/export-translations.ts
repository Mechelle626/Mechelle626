import { db } from "../apps/web/lib/auth/db";
import { writeFile, mkdir } from "node:fs/promises";
// DB is the runtime source of truth. Export is an explicit review/backup artifact.
await mkdir("docs/localization-export", { recursive: true });
try {
  for (const language of (
    await db.query("SELECT id,code FROM braincraze.languages ORDER BY code")
  ).rows) {
    const rows = (
      await db.query(
        "SELECT translation_key,translation_value,review_status,updated_at FROM braincraze.translations WHERE language_id=$1 ORDER BY translation_key",
        [language.id],
      )
    ).rows;
    await writeFile(
      `docs/localization-export/${language.code}.json`,
      JSON.stringify(rows, null, 2) + "\n",
    );
  }
} finally {
  await db.end();
}
