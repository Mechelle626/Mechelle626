import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import pg from "pg";
process.loadEnvFile("apps/web/.env.local");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  ids: string[] = [],
  language = "de-x-bcui";
test.afterAll(async () => {
  await pool.query(
    "DELETE FROM braincraze.translation_reports WHERE language_id=(SELECT id FROM braincraze.languages WHERE code=$1)",
    [language],
  );
  await pool.query(
    "DELETE FROM braincraze.translations WHERE language_id=(SELECT id FROM braincraze.languages WHERE code=$1)",
    [language],
  );
  await pool.query("DELETE FROM braincraze.languages WHERE code=$1", [
    language,
  ]);
  await pool.query(
    "DELETE FROM braincraze.translation_audit WHERE actor_id=ANY($1)",
    [ids],
  );
  await pool.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [ids]);
  await pool.end();
});
async function member(context: any, admin = false) {
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomBytes(32).toString("hex");
  ids.push(id);
  await pool.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at,human_verified,is_admin) VALUES($1,'Locale','Browser',$2,$3,'Fixture','Student',now(),true,$4)`,
    [
      id,
      "locale_" + id.replaceAll("-", "").slice(0, 18),
      id + "@example.test",
      admin,
    ],
  );
  await pool.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember,mfa_verified_at) VALUES($1,$2,$3,'Localization browser fixture',now()+interval '1 hour',false,now())`,
    [sid, id, createHash("sha256").update(token).digest("hex")],
  );
  if (admin)
    await pool.query(
      `INSERT INTO braincraze.account_security(user_id,enabled,totp_secret) VALUES($1,true,'browser fixture only')`,
      [id],
    );
  await context.addCookies([
    {
      name: "bc_session",
      value: token,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return id;
}
test("first visit suggests device language, keeps English until consent, and persists choice", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "fr-FR" }),
    page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByText(
      "We detected your device language as Français. Would you like to use it?",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep English", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Keep English", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Keep English", exact: true }),
  ).toHaveCount(0);
  await context.clearCookies();
  await page.reload();
  await page
    .getByRole("button", { name: "Use Suggested Language", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await context.close();
});
test("admin adds a language, edits a pending draft, and resolves a member translation report", async ({
  browser,
}) => {
  const ac = await browser.newContext(),
    admin = await ac.newPage();
  await member(ac, true);
  await admin.goto("/admin/localization");
  await expect(
    admin.getByRole("heading", { name: "Localization Dashboard", exact: true }),
  ).toBeVisible();
  await admin.getByLabel("Language code", { exact: true }).fill(language);
  await admin
    .getByLabel("Language name", { exact: true })
    .fill("German UI fixture");
  await admin
    .getByLabel("Native name", { exact: true })
    .fill("Deutsch UI fixture");
  await admin
    .getByRole("button", { name: "Save language", exact: true })
    .click();
  const table = admin.locator("table");
  await expect(
    table.getByRole("button", {
      name: "Deutsch UI fixture (" + language + ")",
      exact: true,
    }),
  ).toBeVisible();
  await table
    .getByRole("button", {
      name: "Deutsch UI fixture (" + language + ")",
      exact: true,
    })
    .click();
  await admin
    .getByLabel("Search translation keys", { exact: true })
    .fill("email.notification.subject");
  await expect(
    admin.getByLabel("Draft Translation", { exact: true }),
  ).toHaveCount(1);
  await admin
    .getByLabel("Draft Translation", { exact: true })
    .fill("BrainCraze-Testnachricht");
  await admin
    .getByRole("combobox", { name: "Review Status", exact: true })
    .last()
    .selectOption({ label: "Pending Language Review" });
  const saved = admin.waitForResponse(r => r.url().endsWith('/api/localization/translations') && r.request().method() === 'POST');
  await admin
    .getByRole("button", { name: "Save translation", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  await expect(
    admin.getByLabel("Draft Translation", { exact: true }),
  ).toHaveValue("BrainCraze-Testnachricht");
  const uc = await browser.newContext(),
    user = await uc.newPage(),
    uid = await member(uc);
  await user.goto("/settings");
  await user.locator(".locale-bar select").selectOption(language);
  await expect(user.locator("html")).toHaveAttribute("lang", language);
  await user
    .getByRole("button", { name: "Report Translation Issue", exact: true })
    .click();
  await user
    .getByLabel("Search translation text", { exact: true })
    .fill("email.notification.subject");
  await user
    .getByLabel("Translation Key", { exact: true })
    .selectOption("email.notification.subject");
  await user
    .getByLabel("Report type", { exact: true })
    .selectOption("Poor translation quality");
  await user
    .getByLabel("Notes", { exact: true })
    .fill("Localization browser fixture report");
  await user
    .getByRole("button", { name: "Submit report", exact: true })
    .click();
  await expect(user.getByRole("status")).toContainText(
    "Translation issue reported.",
  );
  expect(
    (
      await pool.query(
        "SELECT preferred_language FROM braincraze.users WHERE id=$1",
        [uid],
      )
    ).rows[0].preferred_language,
  ).toBe(language);
  await admin.reload();
  await expect(
    admin.getByText("Localization browser fixture report", { exact: true }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(
    admin.getByText("Localization browser fixture report", { exact: true }),
  ).toHaveCount(0);
  await ac.close();
  await uc.close();
});
