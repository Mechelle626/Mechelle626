import { test, expect } from "@playwright/test";
import { readFile, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  approveSchoolFixture,
  cleanupSchoolFixtures,
} from "../fixtures/school";
process.loadEnvFile("apps/web/.env.local");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const emails: string[] = [];
const outbox = process.env.MAIL_OUTBOX_DIR ?? resolve("apps/web/.local/mail");
async function mailFor(email: string, subject: string) {
  for (const file of (await readdir(outbox)).sort().reverse()) {
    const mail = JSON.parse(await readFile(resolve(outbox, file), "utf8"));
    if (mail.to === email && mail.subject === subject) return mail;
  }
  throw new Error("Expected development email not found.");
}
test.afterAll(async () => {
  await pool.query("DELETE FROM braincraze.users WHERE email=ANY($1)", [
    emails,
  ]);
  for (const file of await readdir(outbox)) {
    const mail = JSON.parse(await readFile(resolve(outbox, file), "utf8"));
    if (emails.includes(mail.to)) await unlink(resolve(outbox, file));
  }
  await cleanupSchoolFixtures(pool);
  await pool.end();
});
test("desktop signup → verify → sessions → logout → login → forgot → reset", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8),
    email = `browser-${id}@example.test`,
    password = "A curious mind starts here!";
  emails.push(email);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "Find your kind of brilliant." }),
  ).toBeVisible();
  const journey = page.getByRole("navigation", {
    name: "Your signup and verification progress",
  });
  await expect(journey.locator('[aria-current="step"]')).toContainText(
    "Create account",
  );
  await expect(journey.locator('[data-state="locked"]')).toHaveCount(3);
  await page.getByLabel("First name", { exact: true }).fill("Katherine");
  await page.getByLabel("Last name", { exact: true }).fill("Johnson");
  await page.getByLabel("Username", { exact: true }).fill(`browser_${id}`);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByLabel("Country or Territory of Residence", { exact: true })
    .fill("Fixture territory");
  await page
    .getByLabel("State / Province / Region", { exact: true })
    .fill("Fixture region");
  await page
    .getByLabel("Institution Name", { exact: true })
    .fill("Browser Test School");
  await page
    .getByLabel("I do not have an educational email address", { exact: true })
    .check();
  await page.getByLabel("Your role", { exact: true }).selectOption("Faculty");
  await expect(page.getByText("Strong length and variety")).toBeVisible();
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.screenshot({
    path: "test-results/signup-desktop.png",
    fullPage: true,
  });
  const registration = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/register") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  const registered = await registration;
  expect(
    registered.status(),
    "Registration must succeed before email verification",
  ).toBe(201);
  await page.waitForURL("**/verify-email");
  await expect(journey.locator('[aria-current="step"]')).toContainText(
    "Verify email",
  );
  await expect(journey.locator('[data-state="complete"]')).toHaveCount(1);
  // Returning to signup resumes the saved server-side flow rather than creating another account.
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/verify-email$/);
  const verification = await mailFor(email, "Verify your BrainCraze email");
  const code = verification.text.match(/code is (\d{6})/)[1];
  await page.getByLabel("Verification code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email Verified", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("✓ Email Verified");
  await page
    .getByRole("link", { name: "Continue to human verification" })
    .click();
  await page.waitForURL("**/human-verification");
  await expect(
    page.getByRole("heading", { name: "Verify you are human", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toBeDisabled();
  // Fixture approval isolates this account regression journey from live providers.
  await pool.query(
    "UPDATE braincraze.users SET human_verified=true,human_verified_at=now(),human_verification_provider='turnstile' WHERE email=$1",
    [email],
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Human Verified", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Continue to identity verification" })
    .click();
  await page.waitForURL("**/identity-verification");
  await expect(
    page.getByRole("heading", { name: "Verify Your Identity", exact: true }),
  ).toBeVisible();
  // Explicit synthetic approvals isolate this authentication regression from identity evidence/scans.
  await approveSchoolFixture(pool, email);
  await page.goto("/school-verification");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "School Verified", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue to account" }).click();
  await page.waitForURL("**/account");
  await expect(
    page.getByRole("heading", { name: "Welcome, Katherine." }),
  ).toBeVisible();
  await expect(page.getByText("Currently active")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Remember me").check();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/discover");
  await page.goto("/account");
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email." }),
  ).toBeVisible();
  const reset = await mailFor(email, "Reset your BrainCraze password");
  const token = reset.text.match(/#token=([a-f0-9]{64})/)[1];
  await page.goto(`/reset-password#token=${token}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page
    .getByLabel("New password", { exact: true })
    .fill("A completely different long password!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("A completely different long password!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re all set." }),
  ).toBeVisible();
  await page.goto("/account");
  await page.waitForURL("**/login");
  expect(errors).toEqual([]);
});
test("mobile screens fit, controls are labeled, and missing reset token fails closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of [
    "/signup",
    "/login",
    "/forgot-password",
    "/reset-password",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", {
        name: {
          "/signup": "Find your kind of brilliant.",
          "/login": "Hello again, bright mind.",
          "/forgot-password": "A fresh start.",
          "/reset-password": "New password. Same you.",
        }[path],
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Reset password", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("alert").filter({ hasText: "Open the reset link" }),
  ).toContainText("Open the reset link");
  await page.goto("/signup");
  await page.screenshot({
    path: "test-results/signup-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("First name", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Last name", { exact: true })).toBeFocused();
  const config = await (await page.request.get("/api/auth/config")).json();
  if (!config.providers.google)
    await expect(
      page.getByRole("button", { name: "Google", exact: true }),
    ).toBeDisabled();
});

test("mobile verification: countdown survives refresh, failures display, resend resets expiry, success persists", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8),
    email = `verification-${id}@example.test`;
  emails.push(email);
  const response = await page.request.post("/api/auth/register", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      firstName: "Grace",
      lastName: "Hopper",
      username: `verify_${id}`,
      email,
      password: "A long verification passphrase!",
      confirmPassword: "A long verification passphrase!",
      school: "Verification Test School",
      country: "Fixture territory",
      region: "Fixture region",
      institutionName: "Verification Test School",
      noEducationalEmail: true,
      preferredLanguage: "en",
      role: "Student",
    },
  });
  expect(response.status()).toBe(201);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/verify-email");
  await expect(page.getByRole("timer")).toHaveText(/^(15:00|14:[0-5][0-9])$/);
  await expect(page.getByRole("button", { name: /Resend in/ })).toBeDisabled();
  await expect(
    page.getByText("It has not been delivered to your inbox.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const initial = await mailFor(email, "Verify your BrainCraze email");
  const oldCode = initial.text.match(/code is (\d{6})/)[1];
  await page.getByLabel("Verification code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "That code is incorrect" }),
  ).toBeVisible();
  await expect(page.getByText("4 incorrect attempts remaining")).toBeVisible();
  await pool.query(
    `UPDATE braincraze."EmailVerification" SET created_at=now()-interval '61 seconds',expires_at=clock_timestamp()+interval '3 seconds' WHERE user_id=(SELECT id FROM braincraze.users WHERE email=$1)`,
    [email],
  );
  await page.reload();
  await expect(page.getByRole("timer")).toHaveText(/^00:0[0-3]$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "This code has expired" }),
  ).toBeVisible({ timeout: 7000 });
  await expect(
    page.getByRole("button", { name: "Verify email", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/verification-expired-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "saved to the local server outbox",
  );
  await expect(page.getByRole("timer")).toHaveText(/^(15:00|14:[0-5][0-9])$/);
  await expect(page.getByText("5 incorrect attempts remaining")).toBeVisible();
  await page.screenshot({
    path: "test-results/verification-mobile.png",
    fullPage: true,
  });
  const resent = await mailFor(email, "Verify your BrainCraze email");
  const newCode = resent.text.match(/code is (\d{6})/)[1];
  expect(newCode === oldCode).toBe(false);
  await page.getByLabel("Verification code", { exact: true }).fill(oldCode);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "That code is incorrect" }),
  ).toBeVisible();
  await page.getByLabel("Verification code", { exact: true }).fill(newCode);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email Verified", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/verification-success-mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Email Verified", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("✓ Email Verified");
});
