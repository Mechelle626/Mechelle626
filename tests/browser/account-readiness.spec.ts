import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import pg from "pg";
process.loadEnvFile("apps/web/.env.local");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  ids: string[] = [];
test.afterAll(async () => {
  await pool.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [ids]);
  await pool.end();
});
test("landing has plan comparison, factual buddy preview, verification overview, FAQ and footer on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Compare memberships", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "School and identity verification",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Meet your study buddy", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Are verification documents public?", { exact: true })
    .click();
  await expect(
    page.getByText(
      "No. Verification evidence is encrypted and available only through protected administrator review routes after a clean security scan.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", {
      name: "Landing footer navigation",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("admin overview is readable, reports actual service setup and protects anonymous access", async ({
  page,
  context,
}) => {
  await page.goto("/admin/overview");
  await expect(page).toHaveURL(/\/login/);
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomBytes(32).toString("hex");
  ids.push(id);
  await pool.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at,human_verified,is_admin) VALUES($1,'Admin','Fixture',$2,$3,'Test school','Staff',now(),true,true)`,
    [
      id,
      "overview_" + id.replaceAll("-", "").slice(0, 16),
      id + "@example.test",
    ],
  );
  await pool.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember,mfa_verified_at) VALUES($1,$2,$3,'Readiness browser fixture',now()+interval '1 hour',false,now())`,
    [sid, id, createHash("sha256").update(token).digest("hex")],
  );
  await pool.query(
    `INSERT INTO braincraze.account_security(user_id,enabled,totp_secret) VALUES($1,true,'test fixture not a valid authenticator')`,
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
  await page.goto("/admin/overview");
  await expect(
    page.getByRole("heading", { name: "Administration overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Email delivery is using the development outbox.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No subscriptions match these filters.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Required configuration is missing.", { exact: true }),
  ).toHaveCount(9);
});
