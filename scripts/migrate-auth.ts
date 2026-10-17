import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    await readFile(
      new URL("../packages/database/auth.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.query(
    await readFile(
      new URL("../packages/database/school.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.query(
    await readFile(
      new URL("../packages/database/platform.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.query(await readFile(new URL("../packages/database/onboarding.sql", import.meta.url), "utf8"));
  await client.query(await readFile(new URL("../packages/database/localization.sql", import.meta.url), "utf8"));
  await client.query(await readFile(new URL("../packages/database/account-readiness.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("BrainCraze authentication schema applied.");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
