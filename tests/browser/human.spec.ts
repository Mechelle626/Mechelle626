import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import pg from "pg";
process.loadEnvFile("apps/web/.env.local");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const users: string[] = [];
async function signedIn(
  context: import("@playwright/test").BrowserContext,
  verified = true,
) {
  const id = randomUUID(),
    session = randomUUID(),
    token = randomBytes(32).toString("hex");
  users.push(id);
  await pool.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at) VALUES($1,'Human','Browser',$2,$3,'Human browser fixture school','Student',CASE WHEN $4 THEN now() ELSE NULL END)`,
    [
      id,
      `hb_${id.replaceAll("-", "").slice(0, 20)}`,
      `human-browser-${id}@example.test`,
      verified,
    ],
  );
  await pool.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember) VALUES($1,$2,$3,'Human UI fixture',now()+interval '12 hours',false)`,
    [session, id, createHash("sha256").update(token).digest("hex")],
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
test.afterAll(async () => {
  await pool.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [users]);
  await pool.end();
});

test("email gate redirects before CAPTCHA; missing keys keep the account locked on mobile", async ({
  page,
  context,
}) => {
  const id = await signedIn(context, false);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/human-verification");
  await expect(page).toHaveURL(/\/verify-email$/);
  await pool.query(
    "UPDATE braincraze.users SET email_verified_at=now() WHERE id=$1",
    [id],
  );
  await page.goto("/account");
  await expect(page).toHaveURL(/\/human-verification$/);
  await expect(
    page.getByRole("heading", { name: "Verify you are human", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toBeDisabled();
  const config = await (
    await page.request.get("/api/auth/human-status")
  ).json();
  if (!config.configured)
    await expect(page.locator(".human-form").getByRole("alert")).toContainText(
      "has not been configured",
    );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/human-unconfigured-mobile.png",
    fullPage: true,
  });
  const sessions = await page.request.get("/api/auth/sessions");
  expect(sessions.status()).toBe(200); // Owners can manage security while verification is pending.
  expect((await page.request.get("/api/platform/features/matching")).status()).toBe(403);
  expect(
    (
      await pool.query(
        "SELECT human_verified FROM braincraze.users WHERE id=$1",
        [id],
      )
    ).rows[0].human_verified,
  ).toBe(false);
});

const definitions = [
  {
    provider: "turnstile",
    global: "turnstile",
    callback: "brainCrazeTurnstileReady",
    script: "https://challenges.cloudflare.com/turnstile/v0/api.js**",
  },
  {
    provider: "recaptcha",
    global: "grecaptcha",
    callback: "brainCrazeRecaptchaReady",
    script: "https://www.google.com/recaptcha/api.js**",
  },
  {
    provider: "hcaptcha",
    global: "hcaptcha",
    callback: "brainCrazeHcaptchaReady",
    script: "https://js.hcaptcha.com/1/api.js**",
  },
] as const;
for (const definition of definitions) {
  test(`${definition.provider} UI fixture: expiration/error/retry/success callbacks; browser mocks cannot unlock the real API`, async ({
    page,
    context,
  }) => {
    const id = await signedIn(context);
    const challengeId = randomUUID();
    let approved = false,
      submissions = 0;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/api/auth/human-status", (route) =>
      route.fulfill({
        json: {
          humanVerified: approved,
          provider: definition.provider,
          siteKey: "BROWSER-TEST-FIXTURE-NOT-A-REAL-SITE-KEY",
          configured: true,
          next: approved ? "/account" : "/human-verification",
        },
      }),
    );
    await page.route("**/api/auth/human-challenge", (route) =>
      route.fulfill({ json: { humanVerified: false, challengeId } }),
    );
    await page.route(definition.script, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.${definition.global}={render:function(element,options){['Solve test fixture','Expire test fixture','Error test fixture'].forEach(function(label,index){const button=document.createElement('button');button.type='button';button.textContent=label;button.style.cssText='display:block;padding:10px;margin:5px;border:1px solid #dce5d3;border-radius:5px';button.onclick=function(){if(index===0)options.callback('browser-fixture-token');else if(index===1)options['expired-callback']();else options['error-callback']();};element.appendChild(button);});return 0;},reset:function(){},remove:function(){}};window.${definition.callback}();`,
      }),
    );
    await page.route("**/api/auth/verify-human", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.challengeId).toBe(challengeId);
      expect(body.token).toBe("browser-fixture-token");
      submissions++;
      if (submissions === 1) {
        await route.fulfill({
          status: 400,
          json: {
            error: "Fixture provider rejection: request a fresh challenge.",
          },
        });
        return;
      }
      approved = true;
      await route.fulfill({
        json: {
          humanVerified: true,
          message: "Human Verified",
          next: "/account",
        },
      });
    });
    await page.goto("/human-verification");
    await expect(
      page.getByRole("button", { name: "Verify and continue" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Expire test fixture" }).click();
    await expect(page.locator(".human-form").getByRole("alert")).toContainText(
      "expired",
    );
    await expect(
      page.getByRole("button", { name: "Verify and continue" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Try a new challenge" }).click();
    await page.getByRole("button", { name: "Error test fixture" }).click();
    await expect(page.locator(".human-form").getByRole("alert")).toContainText(
      "reported an error",
    );
    await page.getByRole("button", { name: "Try a new challenge" }).click();
    await page.getByRole("button", { name: "Solve test fixture" }).click();
    await expect(
      page.getByRole("button", { name: "Verify and continue" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(page.locator(".human-form").getByRole("alert")).toContainText(
      "Fixture provider rejection",
    );
    await expect(
      page.getByRole("button", { name: "Verify and continue" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Try a new challenge" }).click();
    await page.getByRole("button", { name: "Solve test fixture" }).click();
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Human Verified", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText("✓ Human Verified");
    expect(
      (
        await pool.query(
          "SELECT human_verified FROM braincraze.users WHERE id=$1",
          [id],
        )
      ).rows[0].human_verified,
    ).toBe(false);
    expect((await page.request.get("/api/auth/sessions")).status()).toBe(200);
    expect((await page.request.get("/api/platform/features/matching")).status()).toBe(403);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Human Verified", exact: true }),
    ).toBeVisible();
  });
}

test("blocked CAPTCHA script reports a load failure and offers a retry", async ({
  page,
  context,
}) => {
  await signedIn(context);
  await page.route("**/api/auth/human-status", (route) =>
    route.fulfill({
      json: {
        humanVerified: false,
        provider: "turnstile",
        siteKey: "BROWSER-TEST-FIXTURE",
        configured: true,
        next: "/human-verification",
      },
    }),
  );
  await page.route("**/api/auth/human-challenge", (route) =>
    route.fulfill({
      json: { humanVerified: false, challengeId: randomUUID() },
    }),
  );
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js**",
    (route) => route.abort(),
  );
  await page.goto("/human-verification");
  await expect(page.locator(".human-form").getByRole("alert")).toContainText(
    "could not load",
  );
  await expect(
    page.getByRole("button", { name: "Verify and continue" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Try a new challenge" }),
  ).toBeEnabled();
});
