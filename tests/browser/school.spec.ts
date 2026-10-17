import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { removeDocument } from "../../apps/web/lib/school/documents";
process.loadEnvFile("apps/web/.env.local");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const run = randomUUID().slice(0, 8),
  schoolId = randomUUID(),
  schoolName = `Browser school fixture ${run}`,
  domain = `campus-${run}.example.test`,
  users: string[] = [],
  emails: string[] = [];
test.beforeAll(async () => {
  await pool.query("INSERT INTO braincraze.schools(id,name) VALUES($1,$2)", [
    schoolId,
    schoolName,
  ]);
  await pool.query(
    "INSERT INTO braincraze.school_email_domains(school_id,domain,email_roles,policy_reference,reviewed_by) VALUES($1,$2,ARRAY['Student'],'https://fixture.example.test/policy','browser fixture')",
    [schoolId, domain],
  );
});
test.afterAll(async () => {
  const docs = await pool.query(
    "SELECT document_key FROM braincraze.school_verification_requests WHERE user_id=ANY($1) AND document_key IS NOT NULL",
    [users],
  );
  for (const row of docs.rows) await removeDocument(row.document_key);
  await pool.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [users]);
  await pool.query(
    "DELETE FROM braincraze.school_email_domains WHERE school_id=$1",
    [schoolId],
  );
  await pool.query("DELETE FROM braincraze.schools WHERE id=$1", [schoolId]);
  for (const name of await readdir(process.env.MAIL_OUTBOX_DIR!)) {
    const mail = JSON.parse(
      await readFile(join(process.env.MAIL_OUTBOX_DIR!, name), "utf8"),
    );
    if (emails.includes(mail.to))
      await unlink(join(process.env.MAIL_OUTBOX_DIR!, name));
  }
  await pool.end();
});
async function login(
  context: import("@playwright/test").BrowserContext,
  human = true,
  email = true,
) {
  const id = randomUUID(),
    sessionId = randomUUID(),
    token = randomBytes(32).toString("hex");
  users.push(id);
  await pool.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at,human_verified,human_verified_at,human_verification_provider) VALUES($1,'Campus','Browser',$2,$3,'Self-reported school','Student',CASE WHEN $4 THEN now() ELSE NULL END,$5,CASE WHEN $5 THEN now() ELSE NULL END,CASE WHEN $5 THEN 'turnstile' ELSE NULL END)`,
    [
      id,
      `sc_${id.replaceAll("-", "").slice(0, 20)}`,
      `school-browser-${id}@example.test`,
      email,
      human,
    ],
  );
  await pool.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember) VALUES($1,$2,$3,'School browser fixture',now()+interval '12 hours',false)`,
    [sessionId, id, createHash("sha256").update(token).digest("hex")],
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
async function chooseSchool(page: import("@playwright/test").Page) {
  await page
    .getByRole("combobox", { name: "School", exact: true })
    .fill(schoolName);
  await page.getByRole("option", { name: schoolName, exact: true }).click();
}
const image = () =>
  sharp({
    create: { width: 120, height: 75, channels: 3, background: "#d5e8bd" },
  })
    .png()
    .toBuffer();

test("school route enforces login, email, human, then school ordering", async ({
  page,
  context,
}) => {
  await page.goto("/school-verification");
  await expect(page).toHaveURL(/\/login$/);
  const id = await login(context, false, false);
  await page.goto("/school-verification");
  await expect(page).toHaveURL(/\/verify-email$/);
  await pool.query(
    "UPDATE braincraze.users SET email_verified_at=now() WHERE id=$1",
    [id],
  );
  await page.goto("/school-verification");
  await expect(page).toHaveURL(/\/human-verification$/);
  await pool.query(
    "UPDATE braincraze.users SET human_verified=true,human_verified_at=now(),human_verification_provider='turnstile' WHERE id=$1",
    [id],
  );
  await page.goto("/account");
  await expect(page).toHaveURL(/\/school-verification$/);
  await expect(
    page.getByRole("heading", { name: "School Verification", exact: true }),
  ).toBeVisible();
});

test("mobile school search, all selectable methods, role policy, email failure and success", async ({
  page,
  context,
}) => {
  const id = await login(context);
  const email = `browser-${id}@${domain}`;
  emails.push(email);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/school-verification");
  await chooseSchool(page);
  for (const label of [
    "Upload school ID",
    "Scan school ID",
    "University email",
  ]) {
    await page.getByRole("radio", { name: label, exact: true }).check();
    await expect(
      page.getByRole("radio", { name: label, exact: true }),
    ).toBeChecked();
  }
  await page.getByLabel("Role", { exact: true }).selectOption("Faculty");
  await expect(
    page.getByText(
      "Email verification is not available for this school and role.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send university email code" }),
  ).toBeDisabled();
  await page.getByLabel("Role", { exact: true }).selectOption("Student");
  await page
    .getByRole("textbox", { name: "University email", exact: true })
    .fill(email);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/school-form-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Send university email code" })
    .click();
  await expect(
    page.getByText("Check your university email", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^(15:00|14:[0-5][0-9])$/);
  await page
    .getByLabel("School email verification code", { exact: true })
    .fill("000000");
  await page
    .getByRole("button", { name: "Verify school email", exact: true })
    .click();
  await expect(
    page
      .locator(".school-form")
      .getByRole("alert")
      .filter({ hasText: "incorrect" }),
  ).toBeVisible();
  let code = "";
  for (const name of (await readdir(process.env.MAIL_OUTBOX_DIR!))
    .sort()
    .reverse()) {
    const mail = JSON.parse(
      await readFile(join(process.env.MAIL_OUTBOX_DIR!, name), "utf8"),
    );
    if (mail.to === email) {
      code = mail.text.match(/code is (\d{6})/)[1];
      break;
    }
  }
  expect(code.length).toBe(6);
  await page
    .getByLabel("School email verification code", { exact: true })
    .fill(code);
  await page
    .getByRole("button", { name: "Verify school email", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "School Verified", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "School affiliation verified",
  );
  await page.getByRole("link", { name: "Continue to account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(schoolName, { exact: true })).toBeVisible();
});

test("school ID upload remains private and pending without automatic approval", async ({
  page,
  context,
}) => {
  const id = await login(context);
  await page.goto("/school-verification");
  await chooseSchool(page);
  await page.getByLabel("Role", { exact: true }).selectOption("Faculty");
  await page
    .getByRole("radio", { name: "Upload school ID", exact: true })
    .check();
  await page.getByLabel("School ID document", { exact: true }).setInputFiles({
    name: "fixture-school-id.png",
    mimeType: "image/png",
    buffer: await image(),
  });
  await page.getByRole("button", { name: "Submit ID for review" }).click();
  await expect(
    page.getByRole("heading", { name: "Your ID is pending review" }),
  ).toBeVisible();
  await expect(page.getByText("Faculty · " + schoolName)).toBeVisible();
  expect(
    (
      await pool.query(
        "SELECT school_verified FROM braincraze.users WHERE id=$1",
        [id],
      )
    ).rows[0].school_verified,
  ).toBe(false);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/school-verification$/);
  await page.screenshot({
    path: "test-results/school-pending-review.png",
    fullPage: true,
  });
});

test("camera fixture captures an image, stops its tracks, and submits the same review workflow", async ({
  page,
  context,
}) => {
  const id = await login(context);
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const draw = () => {
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#cfe5bb";
      c.fillRect(0, 0, 640, 400);
      c.fillStyle = "#24452d";
      c.font = "24px sans-serif";
      c.fillText("CAMERA TEST FIXTURE — NOT AN ID", 35, 200);
    };
    draw();
    const media = canvas.captureStream(5);
    (window as unknown as { schoolStopped: number }).schoolStopped = 0;
    for (const track of media.getTracks()) {
      const stop = track.stop.bind(track);
      track.stop = () => {
        (window as unknown as { schoolStopped: number }).schoolStopped++;
        stop();
      };
    }
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          draw();
          const fresh = canvas.captureStream(5);
          for (const track of fresh.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => { (window as unknown as { schoolStopped: number }).schoolStopped++; stop(); };
          }
          return fresh;
        },
      },
    });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/school-verification/scan");
  await chooseSchool(page);
  await page.getByRole("button", { name: "Open camera" }).click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".camera-guide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit verification", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Capture ID" }).click();
  await expect(page.getByRole("heading", { name: "Preview School ID" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your captured school ID, visible only in this browser" })).toBeVisible();
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preview School ID" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit verification", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Capture ID" })).toBeEnabled();
  await page.getByRole("button", { name: "Capture ID" }).click();
  await expect(page.getByRole("status")).toContainText("Photo captured");
  expect(
    await page.evaluate(
      () => (window as unknown as { schoolStopped: number }).schoolStopped,
    ),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Submit verification", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ID submitted for review" }),
  ).toBeVisible();
  const request = (await pool.query("SELECT method,status FROM braincraze.school_verification_requests WHERE user_id=$1", [id])).rows[0];
  expect(request).toMatchObject({ method: "camera", status: "pending_review" });
});

test("camera denial is actionable and upload remains selectable", async ({
  page,
  context,
}) => {
  await login(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          throw new DOMException("Camera permission denied", "NotAllowedError");
        },
      },
    });
  });
  await page.goto("/school-verification");
  await chooseSchool(page);
  await page
    .getByRole("radio", { name: "Scan school ID", exact: true })
    .check();
  await page.getByRole("button", { name: "Open camera" }).click();
  await expect(page.locator(".school-camera").getByRole("alert")).toContainText(
    "Upload school ID",
  );
  await page
    .getByRole("radio", { name: "Upload school ID", exact: true })
    .check();
  await expect(
    page.getByLabel("School ID document", { exact: true }),
  ).toBeVisible();
});

test("school status outage shows an error and retry restores the actual form and keyboard search", async ({
  page,
  context,
}) => {
  await login(context);
  let first = true;
  await page.route("**/api/school/status", async (route) => {
    if (first) {
      first = false;
      await route.fulfill({
        status: 503,
        json: { error: "School verification is temporarily unavailable." },
      });
    } else await route.continue();
  });
  await page.goto("/school-verification");
  await expect(page.locator(".school-form").getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.getByRole("button", { name: "Retry school verification" }).click();
  await expect(page.getByLabel("Role", { exact: true })).toBeVisible();
  const search = page.getByRole("combobox", { name: "School", exact: true });
  await search.fill(schoolName);
  await expect(
    page.getByRole("option", { name: schoolName, exact: true }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(search).toHaveValue(schoolName);
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("dedicated mobile ID upload previews, removes, rejects invalid files and submits a dropped image", async ({ page, context }) => {
  const id = await login(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/school-verification/upload");
  await expect(page.getByRole("heading", { name: "Upload School ID", exact: true })).toBeVisible();
  await chooseSchool(page);
  const input = page.getByLabel("School ID document", { exact: true });
  await input.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(page.locator(".id-uploader").getByRole("alert")).toContainText("JPG, PNG, or PDF");
  await expect(page.getByRole("button", { name: "Submit verification", exact: true })).toBeDisabled();
  await input.setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: await image() });
  await expect(page.getByAltText("Selected school ID preview")).toBeVisible();
  await page.getByRole("button", { name: "Remove upload" }).click();
  await expect(page.getByAltText("Selected school ID preview")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit verification", exact: true })).toBeDisabled();
  const bytes = Array.from(await image());
  const transfer = await page.evaluateHandle(bytes => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
    return data;
  }, bytes);
  await page.getByRole("group", { name: "School ID upload area" }).dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByAltText("Selected school ID preview")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Submit verification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ID submitted for review" })).toBeVisible();
  expect((await pool.query("SELECT school_verified FROM braincraze.users WHERE id=$1", [id])).rows[0].school_verified).toBe(false);
});

test("PDF selection displays a private file card without embedding the document", async ({ page, context }) => {
  await login(context);
  await page.goto("/school-verification/upload");
  await chooseSchool(page);
  await page.getByLabel("School ID document", { exact: true }).setInputFiles({ name: "fixture.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%synthetic test fixture\n%%EOF") });
  await expect(page.getByText("PDF selected; no inline preview", { exact: false })).toBeVisible();
  await expect(page.locator(".id-preview iframe, .id-preview embed, .id-preview img")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit verification", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ID submitted for review" })).toBeVisible();
});

test("scan screen denies submission after permission refusal and offers upload fallback", async ({ page, context }) => {
  await login(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => { throw new DOMException("Denied", "NotAllowedError"); } } });
  });
  await page.goto("/school-verification/scan");
  await chooseSchool(page);
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.locator(".school-camera").getByRole("alert")).toContainText("Camera permission was denied");
  await expect(page.getByRole("button", { name: "Submit verification", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Upload school ID instead" }).click();
  await expect(page).toHaveURL(/\/school-verification\/upload$/);
});

test("leaving scan screen stops a camera stream even when permission resolves late", async ({ page, context }) => {
  await login(context);
  await page.addInitScript(() => {
    (window as any).stoppedLate = 0;
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => new Promise(resolve => {
      (window as any).resolveCamera = () => resolve({ getTracks: () => [{ stop: () => (window as any).stoppedLate++ }] });
    }) } });
  });
  await page.goto("/school-verification/scan");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).resolveCamera)).toBe("function");
  await page.getByRole("link", { name: "Upload school ID instead" }).click();
  await expect(page).toHaveURL(/\/school-verification\/upload$/);
  await page.evaluate(() => (window as any).resolveCamera());
  await expect.poll(() => page.evaluate(() => (window as any).stoppedLate)).toBe(1);
});
