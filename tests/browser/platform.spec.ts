import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import * as OTPAuth from "otpauth";
import { hashPassword } from "../../apps/web/lib/auth/security";
import { removeDocument } from "../../apps/web/lib/school/documents";
process.loadEnvFile("apps/web/.env.local");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  schoolId = randomUUID(),
  schoolName = "Membership browser fixture " + randomUUID().slice(0, 8),
  ids: string[] = [],
  emails: string[] = [];
const password = "A secure platform browser fixture!";
let hash: string;
test.beforeAll(async () => {
  hash = await hashPassword(password);
  await pool.query("INSERT INTO braincraze.schools(id,name) VALUES($1,$2)", [
    schoolId,
    schoolName,
  ]);
});
test.afterAll(async () => {
  await pool.query("DELETE FROM braincraze.admin_audit WHERE actor_id=ANY($1) OR subject_id=ANY($1)",[ids]);
  const rows = await pool.query(
    "SELECT document_key FROM braincraze.school_verification_requests WHERE user_id=ANY($1) AND document_key IS NOT NULL",
    [ids],
  );
  for (const row of rows.rows) await removeDocument(row.document_key);
  await pool.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [ids]);
  await pool.query("DELETE FROM braincraze.schools WHERE id=$1", [schoolId]);
  for (const f of await readdir(process.env.MAIL_OUTBOX_DIR!)) {
    const mail = JSON.parse(
      await readFile(join(process.env.MAIL_OUTBOX_DIR!, f), "utf8"),
    );
    if (emails.includes(mail.to))
      await unlink(join(process.env.MAIL_OUTBOX_DIR!, f));
  }
  await pool.end();
});
async function login(
  context: BrowserContext,
  { approved = true, premium = false, admin = false, role = "Student" } = {},
) {
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomBytes(32).toString("hex"),
    username = "mb_" + id.replaceAll("-", "").slice(0, 18),
    email = username + "@example.test";
  ids.push(id);
  emails.push(email);
  await pool.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,password_hash,school,role,email_verified_at,human_verified,human_verified_at,human_verification_provider,is_admin) VALUES($1,'Campus','Member',$2,$3,$4,'Self reported fixture',$5,now(),true,now(),'turnstile',$6)`,
    [id, username, email, hash, role, admin],
  );
  await pool.query(
    "INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember,mfa_verified_at) VALUES($1,$2,$3,'Membership browser fixture',now()+interval '12 hours',false,CASE WHEN $4 THEN now() ELSE NULL END)",
    [sid, id, createHash("sha256").update(token).digest("hex"), admin],
  );
  if (approved) {
    await pool.query(
      `INSERT INTO braincraze.school_verification_requests(user_id,school_id,role,method,status,document_key,document_mime,document_bytes,document_scan_status,approved_at) VALUES($1,$2,$3,'upload','approved',$4,'image/jpeg',1,'clean',now())`,
      [id, schoolId, role, randomUUID()],
    );
    await pool.query(
      "UPDATE braincraze.users SET school_verified=true,verified_school_id=$2,verified_school_role=$3,school=$4,school_verified_at=now() WHERE id=$1",
      [id, schoolId, role, schoolName],
    );
  }
  if (premium)
    await pool.query(
      "INSERT INTO braincraze.subscriptions(user_id,stripe_subscription_id,stripe_price_id,status,period_end) VALUES($1,$2,'price_browser_fixture','active',now()+interval '1 day')",
      [id, "sub_browser_" + id],
    );
  if (admin)
    await pool.query(
      "INSERT INTO braincraze.account_security(user_id,enabled,totp_secret) VALUES($1,true,'explicit fixture, no actual authenticator')",
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
  return { id, sid, username, email };
}

test("mobile pricing, plan selection and billing show real unconfigured and empty states", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/pricing");
  await expect(page.getByText("$7.99", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Yearly", exact: true }).click();
  await expect(page.getByText("$69.99", { exact: false })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await login(context);
  await page.goto("/subscription");
  await expect(
    page.getByRole("button", { name: "Choose Premium", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Paid checkout is unavailable", { exact: false }),
  ).toBeVisible();
  await page.goto("/billing?checkout=returned");
  await expect(
    page.getByText("No paid subscription", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No invoices found.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No saved default payment method")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/billing-mobile.png",
    fullPage: true,
  });
});

test("settings save profile, privacy and picture; private profile blocks another member", async ({
  page,
  context,
  browser,
}) => {
  const u = await login(context, { role: "Faculty" });
  await page.goto("/settings");
  await page.getByLabel("Bio", { exact: true }).fill("A synthetic campus bio.");
  await page.getByLabel("Who can view your profile?").selectOption("private");
  await page.getByRole("button", { name: "Save profile & privacy" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile and privacy saved" }),
  ).toBeVisible();
  const png = await sharp({
    create: { width: 25, height: 25, channels: 3, background: "#dce8c1" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Profile picture", { exact: true })
    .setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Current picture")).toBeVisible();
  await page.goto("/profiles/" + u.username);
  await expect(
    page.getByText("Verified Faculty", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("A synthetic campus bio.")).toBeVisible();
  const other = await browser.newContext();
  await login(other);
  const p = await other.newPage();
  await p.goto("/profiles/" + u.username);
  await expect(
    p.getByRole("heading", { name: "Profile unavailable", exact: true }),
  ).toBeVisible();
  await other.close();
});

test("authenticator setup enables 2FA and a recovery code completes a password login", async ({
  page,
  context,
}) => {
  const u = await login(context);
  await page.goto("/settings");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Set up 2FA", exact: true }).click();
  const secret = await page.locator(".setup-secret").innerText();
  const otp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page
    .getByLabel("Authenticator or recovery code", { exact: true })
    .fill(otp.generate());
  await page
    .getByRole("button", {
      name: "Enable two-factor authentication",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Save these recovery codes" }),
  ).toBeVisible();
  const recovery = (
    await page.locator(".recovery-codes pre").innerText()
  ).split("\n");
  expect(recovery).toHaveLength(10);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email address", { exact: true }).fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/two-factor$/);
  await page
    .getByLabel("Authenticator or recovery code", { exact: true })
    .fill(recovery[0]);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("Premium and verification frontend guards agree with backend; themes save and expire", async ({
  page,
  context,
}) => {
  const u = await login(context);
  await page.goto("/marketplace");
  await expect(
    page.getByRole("heading", { name: "Premium membership required" }),
  ).toBeVisible();
  expect((await page.request.get("/api/platform/listings")).status()).toBe(403);
  await pool.query(
    "INSERT INTO braincraze.subscriptions(user_id,stripe_subscription_id,stripe_price_id,status,period_end) VALUES($1,$2,'price_browser_fixture','active',now()+interval '1 day')",
    [u.id, "sub_browser_" + u.id],
  );
  await page.goto("/features/themes");
  await page.getByLabel("Advanced theme").selectOption("midnight");
  await page.getByLabel("Study buddy skin").selectOption("fox");
  await page.getByRole("button", { name: "Save appearance" }).click();
  await expect(page.getByRole("status")).toContainText("Appearance saved");
  await page.goto("/profiles/" + u.username);
  await expect(page.locator(".public-profile")).toHaveClass(/theme-midnight/);
  await expect(
    page.getByText("Premium member", { exact: false }),
  ).toBeVisible();
  await pool.query(
    "UPDATE braincraze.subscriptions SET period_end=now()-interval '1 second' WHERE user_id=$1",
    [u.id],
  );
  await page.reload();
  await expect(page.locator(".public-profile")).toHaveClass(/theme-classic/);
  await expect(page.getByText("Premium member", { exact: false })).toHaveCount(
    0,
  );
});

test("approved badges render on posts, messages and marketplace and disappear after revocation", async ({
  page,
  context,
}) => {
  const u = await login(context, { premium: true, role: "Tutor" });
  await page.goto("/posts");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Synthetic badge post fixture");
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(
    page
      .locator(".feed-item")
      .filter({ hasText: "Synthetic badge post fixture" })
      .getByText("Verified Tutor", { exact: true }),
  ).toBeVisible();
  await page.goto("/marketplace");
  await page.getByLabel("Listing title").fill("Synthetic listing fixture");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Not a real marketplace offer");
  await page.getByLabel("Price (USD)").fill("5.00");
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(
    page
      .locator(".feed-item")
      .filter({ hasText: "Synthetic listing fixture" })
      .getByText("Verified Tutor", { exact: true }),
  ).toBeVisible();
  const recipientId = randomUUID(),
    username = "rc_" + recipientId.replaceAll("-", "").slice(0, 18);
  ids.push(recipientId);
  await pool.query(
    "INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role) VALUES($1,'Recipient','Fixture',$2,$3,'Fixture','Student')",
    [recipientId, username, username + "@example.test"],
  );
  await page.goto("/messages");
  await page.getByLabel("Recipient username").fill(username);
  await page
    .getByLabel("Message", { exact: true })
    .fill("Synthetic direct message");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .locator(".feed-item")
      .filter({ hasText: "Synthetic direct message" })
      .getByText("Verified Tutor", { exact: true }),
  ).toBeVisible();
  await pool.query(
    "UPDATE braincraze.users SET school_verified=false WHERE id=$1",
    [u.id],
  );
  await page.reload();
  await expect(
    page
      .locator(".feed-item")
      .filter({ hasText: "Synthetic direct message" })
      .getByText("Verified Tutor", { exact: true }),
  ).toHaveCount(0);
});

test("admin dashboard blocks unscanned approval, reviews clean evidence, and suspends an account", async ({
  page,
  context,
  browser,
}) => {
  await login(context, { admin: true, role: "Staff" });
  const studentContext = await browser.newContext();
  const student = await login(studentContext, { approved: false });
  const studentPage = await studentContext.newPage();
  await studentPage.goto("/school-verification/upload");
  await studentPage
    .getByRole("combobox", { name: "School", exact: true })
    .fill(schoolName);
  await studentPage
    .getByRole("option", { name: schoolName, exact: true })
    .click();
  const png = await sharp({
    create: { width: 30, height: 20, channels: 3, background: "#dce8c1" },
  })
    .png()
    .toBuffer();
  await studentPage
    .getByLabel("School ID document", { exact: true })
    .setInputFiles({
      name: "id-fixture.png",
      mimeType: "image/png",
      buffer: png,
    });
  await studentPage
    .getByRole("button", { name: "Submit verification", exact: true })
    .click();
  await expect(
    studentPage.getByRole("heading", { name: "ID submitted for review" }),
  ).toBeVisible();
  await page.goto("/admin/verifications");
  const row = page.getByRole("row").filter({ hasText: student.username });
  await row.getByRole("button", { name: "Review", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toBeDisabled();
  // Explicit synthetic scan state only; no claim that ClamAV ran.
  await pool.query(
    "UPDATE braincraze.school_verification_requests SET document_scan_status='clean' WHERE user_id=$1",
    [student.id],
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await row.getByRole("button", { name: "Review", exact: true }).click();
  await page
    .getByLabel("Decision reason", { exact: true })
    .fill("Synthetic affiliation fixture approved");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Action saved");
  await studentPage.goto("/profiles/" + student.username);
  await expect(
    studentPage.getByText("Verified Student", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search username", { exact: true })
    .fill(student.username);
  await page.getByRole("button", { name: "Search accounts" }).click();
  await page
    .getByLabel("Moderation reason")
    .fill("Synthetic moderation fixture");
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(
    page.locator(".moderation-row").filter({ hasText: student.username }),
  ).toContainText("suspended");
  expect(
    (await studentPage.request.get("/api/platform/settings")).status(),
  ).toBe(401);
  await studentContext.close();
});
