import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { removeDocument } from "../../apps/web/lib/school/documents";
import { languages, direction } from "../../apps/web/lib/i18n/config";
process.loadEnvFile("apps/web/.env.local");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  schoolId = randomUUID(),
  schoolName = "Onboarding browser fixture " + randomUUID().slice(0, 8),
  ids: string[] = [],
  emails: string[] = [];
test.beforeAll(async () => {
  await pool.query("INSERT INTO braincraze.schools(id,name) VALUES($1,$2)", [
    schoolId,
    schoolName,
  ]);
});
test.afterAll(async () => {
  const docs = await pool.query(
    `SELECT document_key FROM braincraze."VerificationDocuments" WHERE user_id=ANY($1)`,
    [ids],
  );
  for (const d of docs.rows) await removeDocument(d.document_key);
  await pool.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [ids]);
  await pool.query("DELETE FROM braincraze.schools WHERE id=$1", [schoolId]);
  for (const f of await readdir(process.env.MAIL_OUTBOX_DIR!)) {
    const m = JSON.parse(
      await readFile(join(process.env.MAIL_OUTBOX_DIR!, f), "utf8"),
    );
    if (emails.includes(m.to))
      await unlink(join(process.env.MAIL_OUTBOX_DIR!, f));
  }
  await pool.end();
});
async function member(context: BrowserContext, admin = false) {
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomBytes(32).toString("hex"),
    username = "nb_" + id.replaceAll("-", "").slice(0, 18);
  ids.push(id);
  await pool.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at,human_verified,human_verified_at,human_verification_provider,onboarding_required,institution_name,institution_id,country,region,is_admin) VALUES($1,'Identity','Browser',$2,$3,'Self reported fixture','Student',now(),true,now(),'turnstile',$4,$5,$6,'Fixture territory','Fixture region',$7)`,
    [
      id,
      username,
      username + "@example.test",
      !admin,
      schoolName,
      schoolId,
      admin,
    ],
  );
  await pool.query(
    "INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember,mfa_verified_at) VALUES($1,$2,$3,'Onboarding browser fixture',now()+interval '12 hours',false,CASE WHEN $4 THEN now() ELSE NULL END)",
    [sid, id, createHash("sha256").update(token).digest("hex"), admin],
  );
  if (admin)
    await pool.query(
      "INSERT INTO braincraze.account_security(user_id,enabled,totp_secret) VALUES($1,true,'browser fixture only, not an authenticator secret')",
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
  return { id, username };
}
async function camera(page: Page) {
  await page.addInitScript(() => {
    (window as any).cameraRequests = [];
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async (constraints: unknown) => {
          (window as any).cameraRequests.push(constraints);
          const canvas = document.createElement("canvas");
          canvas.width = 480;
          canvas.height = 360;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#cde1b7";
          ctx.fillRect(0, 0, 480, 360);
          ctx.fillStyle = "#245033";
          ctx.fillText("SYNTHETIC SELFIE FIXTURE", 30, 180);
          return canvas.captureStream(5);
        },
      },
    });
  });
}

test("landing precedes authentication, persists a language choice and supports all 18 locale directions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("link", { name: "Login", exact: true }),
  ).toHaveAttribute("href", "/login");
  await expect(
    page.getByRole("link", { name: "Create Account", exact: true }),
  ).toHaveAttribute("href", "/signup");
  await page
    .getByLabel("Region selector", { exact: true })
    .fill("Fixture region preference");
  await page
    .getByRole("button", { name: "Save region preference", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Region preference saved.",
  );
  await page.reload();
  await expect(page.getByLabel("Region selector", { exact: true })).toHaveValue(
    "Fixture region preference",
  );
  for (const { code } of languages) {
    await page.locator(".locale-bar select").selectOption(code);
    await expect(page.locator("html")).toHaveAttribute("lang", code);
    await expect(page.locator("html")).toHaveAttribute("dir", direction(code));
    const catalog = JSON.parse(
      await readFile(`apps/web/messages/${code}.json`, "utf8"),
    );
    await expect(
      page.getByRole("link", { name: catalog["ui.9d6322c1f4d9d3f3"] ?? "Login", exact: true }),
    ).toHaveAttribute("href", "/login");
  }
  await page.locator(".locale-bar select").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/landing-ar-mobile.png",
    fullPage: true,
  });
});

test("localized registration preserves canonical role values and supports manual residence and no academic email", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.locator(".locale-bar select").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  const id = randomUUID().slice(0, 8),
    email = "on-ui-" + id + "@example.test";
  emails.push(email);
  await page.getByLabel("Prénom", { exact: true }).fill("Draft");
  await page.getByLabel("Nom", { exact: true }).fill("Locale");
  await page.locator('input[name="username"]').fill("on_ui_" + id);
  await page.locator('input[name="email"]').fill(email);
  await page
    .locator('input[name="password"]')
    .fill("A localized registration password!");
  await page
    .locator('input[name="confirmPassword"]')
    .fill("A localized registration password!");
  await page
    .getByRole("button", {
      name: "Can't find your country or territory?",
      exact: true,
    })
    .click();
  await page.locator('input[name="country"]').fill("Manual territory fixture");
  await page
    .getByRole("button", {
      name: "Can't find your region or state?",
      exact: true,
    })
    .click();
  await page.locator('input[name="region"]').fill("地域 fixture");
  await page
    .getByRole("button", { name: "Can't find your institution?", exact: true })
    .click();
  await page
    .locator('input[name="institutionName"]')
    .fill("École de test manuelle");
  await page.locator('input[name="noEducationalEmail"]').check();
  await page.locator('select[name="role"]').selectOption("Student");
  await expect(page.locator('select[name="role"] option:checked')).toHaveText(
    "Étudiant",
  );
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/api/auth/register") && r.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Créer un compte", exact: true })
    .click();
  const body = (await request).postDataJSON();
  expect(body.role).toBe("Student");
  expect(body.preferredLanguage).toBe("fr");
  expect(body.noEducationalEmail).toBe(true);
  await expect(page).toHaveURL(/\/verify-email$/);
  const row = (
    await pool.query(
      "SELECT id,country,region,institution_name,preferred_language,onboarding_required FROM braincraze.users WHERE email=$1",
      [email],
    )
  ).rows[0];
  ids.push(row.id);
  expect(row).toMatchObject({
    country: "Manual territory fixture",
    region: "地域 fixture",
    institution_name: "École de test manuelle",
    preferred_language: "fr",
    onboarding_required: true,
  });
});

test("selfie camera denial blocks progress without offering a selfie file upload", async ({
  page,
  context,
}) => {
  await member(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    });
  });
  await page.goto("/identity-verification");
  await page.getByRole("button", { name: "Open Camera", exact: true }).click();
  await expect(page.locator(".school-camera").getByRole("alert")).toContainText(
    "Camera permission was denied",
  );
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save selfie and continue", exact: true }),
  ).toBeDisabled();
});

test("mobile selfie, alternative ID, administrator review, tutorial skip/resume/replay and discovery work together", async ({
  page,
  context,
  browser,
}) => {
  const user = await member(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await camera(page);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/identity-verification$/);
  await page.getByRole("button", { name: "Open Camera", exact: true }).click();
  await expect(page.locator(".face-guide")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Capture Selfie", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Capture Selfie", exact: true })
    .click();
  await expect(
    page.getByAltText("Your captured selfie, visible only in this browser"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retake Selfie", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save selfie and continue", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Capture Selfie", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Capture Selfie", exact: true })
    .click();
  expect(
    await page.evaluate(() => (window as any).cameraRequests[0]),
  ).toMatchObject({ audio: false, video: { facingMode: { ideal: "user" } } });
  await page.screenshot({
    path: "test-results/selfie-preview-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save selfie and continue", exact: true })
    .click();
  await page
    .getByLabel("I do not have a school-issued ID", { exact: true })
    .check();
  await page
    .getByLabel("Alternative identity document", { exact: true })
    .selectOption("passport");
  const png = await sharp({
    create: { width: 80, height: 50, channels: 3, background: "#e3edcb" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Identity verification document", { exact: true })
    .setInputFiles({
      name: "synthetic-not-an-id.png",
      mimeType: "image/png",
      buffer: png,
    });
  await page
    .getByRole("button", { name: "Submit identity verification", exact: true })
    .click();
  await expect(
    page
      .locator(".identity-status")
      .getByRole("heading", { name: "Pending Review", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const adminContext = await browser.newContext();
  await member(adminContext, true);
  const admin = await adminContext.newPage();
  await admin.goto("/admin/identity");
  const row = admin.getByRole("row").filter({ hasText: user.username });
  await expect(row).toContainText("Alternative ID · Manual review");
  await row
    .getByRole("button", { name: "Review identity", exact: true })
    .click();
  await admin
    .getByLabel("Reviewer notes", { exact: true })
    .fill("Synthetic identity request under review");
  await expect(
    admin.getByRole("button", { name: "Approve identity", exact: true }),
  ).toBeDisabled();
  await admin
    .getByRole("button", { name: "Mark Under Review", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText(
    "Identity review saved",
  );
  await page
    .getByRole("button", { name: "Refresh review status", exact: true })
    .click();
  await expect(
    page
      .locator(".identity-status")
      .getByRole("heading", { name: "Under Review", exact: true }),
  ).toBeVisible();
  // Explicit clean-scan fixtures; no real malware scan is claimed.
  await pool.query(
    `UPDATE braincraze."VerificationDocuments" SET scan_status='clean' WHERE user_id=$1`,
    [user.id],
  );
  await admin
    .getByLabel("Review status", { exact: true })
    .selectOption("under_review");
  await row
    .getByRole("button", { name: "Review identity", exact: true })
    .click();
  await expect(
    admin.getByRole("link", { name: "Download private evidence", exact: true }),
  ).toHaveCount(2);
  await admin
    .getByLabel("Reviewer notes", { exact: true })
    .fill("Synthetic identity-only approval, no school affiliation");
  await admin
    .getByRole("button", { name: "Approve identity", exact: true })
    .click();
  await expect(admin.getByRole("status")).toContainText(
    "Identity review saved",
  );
  await page
    .getByRole("button", { name: "Refresh review status", exact: true })
    .click();
  await expect(
    page
      .locator(".identity-status")
      .getByRole("heading", { name: "Verified", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Continue Tutorial", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tutorial$/);
  await expect(page.locator(".tutorial-panel h3")).toHaveText("Dashboard");
  await page
    .getByRole("button", { name: "Continue Tutorial", exact: true })
    .click();
  await expect(page.locator(".tutorial-panel h3")).toHaveText(
    "Profile Customization",
  );
  await page.reload();
  await expect(page.locator(".tutorial-panel h3")).toHaveText(
    "Profile Customization",
  );
  await page
    .getByRole("button", { name: "Skip Tutorial", exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(
    page.locator(".discovery-card").filter({
      has: page.getByRole("heading", { name: "GPA Tools", exact: true }),
    }),
  ).toContainText("Coming soon");
  await expect(
    page.locator(".discovery-card").filter({
      has: page.getByRole("heading", {
        name: "Study Partner Matching",
        exact: true,
      }),
    }),
  ).toContainText("Verification required");
  await page
    .getByRole("link", { name: "Replay Tutorial Later", exact: true })
    .click();
  await expect(page.locator(".tutorial-panel h3")).toHaveText("Dashboard");
  for (let n = 0; n < 10; n++) {
    await page
      .getByRole("button", { name: "Continue Tutorial", exact: true })
      .click();
  }
  await expect(page.locator(".tutorial-panel h3")).toHaveText(
    "Subscription Features",
  );
  await page
    .getByRole("button", { name: "Finish Tutorial", exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover$/);
  expect(
    (
      await pool.query(
        "SELECT tutorial_status FROM braincraze.onboarding_progress WHERE user_id=$1",
        [user.id],
      )
    ).rows[0].tutorial_status,
  ).toBe("completed");
  expect(
    (
      await pool.query(
        "SELECT school_verified FROM braincraze.users WHERE id=$1",
        [user.id],
      )
    ).rows[0].school_verified,
  ).toBe(false);
  // Interface translations must never rewrite member-authored content.
  const post = await page.request.post("/api/platform/posts", {
    headers: { Origin: "http://localhost:3000" },
    data: { body: "Login" },
  });
  expect(post.status()).toBe(201);
  await page.goto("/posts");
  await page.locator(".locale-bar select").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator(".feed-item .content-body")).toHaveText("Login");
  await adminContext.close();
});
