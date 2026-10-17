import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  readdir,
  readFile,
  unlink,
  mkdtemp,
  writeFile,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { approveSchoolFixture, cleanupSchoolFixtures } from "./fixtures/school";
import {
  hashPassword,
  verifyPassword,
  registrationSchema,
} from "../apps/web/lib/auth/security";
import { passwordStrength } from "../apps/web/lib/auth/contracts";
const origin = process.env.APP_BASE_URL!;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const run = randomUUID().slice(0, 8),
  emails: string[] = [];
const mailDir = process.env.MAIL_OUTBOX_DIR ?? resolve("apps/web/.local/mail");
const password = "An original twelve-word idea!";
async function call(
  action: string,
  body?: unknown,
  cookie?: string,
  requestOrigin = origin,
) {
  const response = await fetch(`${origin}/api/auth/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: requestOrigin }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }
  return {
    response,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
async function latestMail(email: string, subject: string) {
  for (const file of (await readdir(mailDir)).sort().reverse()) {
    const mail = JSON.parse(await readFile(resolve(mailDir, file), "utf8"));
    if (mail.to === email && mail.subject === subject) return mail;
  }
  throw new Error("Expected local outbox message was not produced.");
}
async function register(label: string) {
  const email = `bc-${run}-${label}@example.test`;
  emails.push(email);
  const result = await call("register", {
    firstName: "Ada",
    lastName: "Lovelace",
    username: `bc_${run}_${label}`,
    email,
    password,
    confirmPassword: password,
    school: "Test School — fixture",
    country:"Fixture territory",region:"Fixture administrative area",institutionName:"Test School — fixture",noEducationalEmail:true,preferredLanguage:"en",
    role: "Student",
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.emailSent, true);
  assert.ok(result.cookie);
  return { ...result, email };
}
async function verify(email: string, cookie: string) {
  const mail = await latestMail(email, "Verify your BrainCraze email");
  const code = mail.text.match(/code is (\d{6})/)[1];
  const result = await call("verify-email", { code }, cookie);
  assert.equal(result.response.status, 200);
  // Account/session regression tests isolate Step 1–2 from live CAPTCHA providers.
  // This explicit database fixture is not an application bypass; Step 3 has its own tests.
  await pool.query(
    "UPDATE braincraze.users SET human_verified=true,human_verified_at=now(),human_verification_provider='turnstile' WHERE email=$1",
    [email],
  );
  await approveSchoolFixture(pool, email);
  return result;
}
after(async () => {
  await pool.query("DELETE FROM braincraze.users WHERE email=ANY($1)", [
    emails,
  ]);
  for (const file of await readdir(mailDir)) {
    const mail = JSON.parse(await readFile(resolve(mailDir, file), "utf8"));
    if (emails.includes(mail.to)) await unlink(resolve(mailDir, file));
  }
  await cleanupSchoolFixtures(pool);
  await pool.end();
});
test("passwords are salted, hashed, and verified; registration rejects admin and mismatch", async () => {
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(a.includes(password), false);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  assert.equal(await verifyPassword(password, null), false);
  const base = {
    firstName: "A",
    lastName: "B",
    username: "test_user",
    email: "a@example.test",
    password,
    confirmPassword: password,
    school: "Test School",
    role: "Student",
  };
  assert.equal(
    registrationSchema.safeParse({ ...base, role: "Administrator" }).success,
    false,
  );
  assert.equal(
    registrationSchema.safeParse({ ...base, confirmPassword: "different" })
      .success,
    false,
  );
  assert.equal(passwordStrength("short").score, 1);
  assert.equal(passwordStrength(password).score, 4);
});
test("registration, duplicate validation, mailbox verification, protected account, logout", async () => {
  const user = await register("main");
  const record = await pool.query(
    "SELECT password_hash,email_verified_at FROM braincraze.users WHERE email=$1",
    [user.email],
  );
  assert.ok(record.rows[0].password_hash.startsWith("scrypt$"));
  assert.equal(record.rows[0].email_verified_at, null);
  assert.equal(
    (await call("sessions", undefined, user.cookie)).response.status,
    403,
  );
  const gated = await fetch(`${origin}/account`, {
    headers: { Cookie: user.cookie },
    redirect: "manual",
  });
  assert.equal(gated.status, 307);
  assert.ok(gated.headers.get("location")?.includes("/verify-email"));
  const duplicate = await call("register", {
    firstName: "Other",
    lastName: "Person",
    username: `bc_${run}_other`,
    email: user.email.toUpperCase(),
    password,
    confirmPassword: password,
    school: "Test",
    country:"Fixture territory",region:"Fixture administrative area",institutionName:"Test",noEducationalEmail:true,preferredLanguage:"en",
    role: "Student",
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(
    (await call("verify-email", { code: "000000" }, user.cookie)).response
      .status,
    400,
  );
  const verified = await verify(user.email, user.cookie);
  assert.notEqual(verified.cookie, user.cookie);
  assert.equal((await call("me", undefined, user.cookie)).response.status, 401);
  assert.equal(
    (await call("verify-email", { code: "000000" }, verified.cookie)).response
      .status,
    400,
  );
  assert.equal(
    (await fetch(`${origin}/account`, { headers: { Cookie: verified.cookie } }))
      .status,
    200,
  );
  const sessions = await call("sessions", undefined, verified.cookie);
  assert.equal(sessions.response.status, 200);
  assert.equal(sessions.data.sessions.length, 1);
  assert.equal(sessions.data.sessions[0].current, true);
  assert.equal(
    (await call("logout", {}, verified.cookie)).response.status,
    200,
  );
  assert.equal(
    (await call("me", undefined, verified.cookie)).response.status,
    401,
  );
});
test("login errors, remember-me cookie, multiple sessions, ownership and revocation", async () => {
  const user = await register("sessions");
  await verify(user.email, user.cookie);
  assert.equal(
    (await call("login", { email: user.email, password: "incorrect" })).response
      .status,
    401,
  );
  const standard = await call("login", {
    email: user.email,
    password,
    remember: false,
  });
  assert.equal(standard.response.status, 200);
  assert.equal(
    standard.response.headers.get("set-cookie")!.includes("Max-Age"),
    false,
  );
  const remembered = await call("login", {
    email: user.email,
    password,
    remember: true,
  });
  assert.ok(
    remembered.response.headers.get("set-cookie")!.includes("Max-Age=2592000"),
  );
  assert.ok(
    remembered.response.headers.get("set-cookie")!.includes("HttpOnly"),
  );
  assert.ok(
    remembered.response.headers.get("set-cookie")!.includes("SameSite=lax"),
  );
  const list = await call("sessions", undefined, remembered.cookie);
  const own = list.data.sessions.find((s: { current: boolean }) => s.current);
  assert.ok(own);
  const other = await register("other");
  const otherSession = await pool.query(
    "SELECT s.id FROM braincraze.sessions s JOIN braincraze.users u ON u.id=s.user_id WHERE u.email=$1",
    [other.email],
  );
  await call(
    "revoke-session",
    { id: otherSession.rows[0].id },
    remembered.cookie,
  );
  assert.equal(
    (await call("me", undefined, other.cookie)).response.status,
    200,
  );
  assert.equal(
    (await call("revoke-other-sessions", {}, remembered.cookie)).response
      .status,
    200,
  );
  assert.equal(
    (await call("me", undefined, standard.cookie)).response.status,
    401,
  );
  assert.equal(
    (await call("me", undefined, remembered.cookie)).response.status,
    200,
  );
  await call("revoke-session", { id: own.id }, remembered.cookie);
  assert.equal(
    (await call("me", undefined, remembered.cookie)).response.status,
    401,
  );
});
test("reset uses a single-use token, rejects old password, and invalidates sessions", async () => {
  const user = await register("reset");
  const verified = await verify(user.email, user.cookie);
  const known = await call("forgot-password", { email: user.email });
  const unknown = await call("forgot-password", {
    email: `missing-${run}@example.test`,
  });
  assert.equal(known.response.status, 200);
  assert.deepEqual(known.data, unknown.data);
  const mail = await latestMail(user.email, "Reset your BrainCraze password");
  const token = mail.text.match(/#token=([a-f0-9]{64})/)[1];
  const nextPassword = "A brand new long passphrase!";
  assert.equal(
    (
      await call("reset-password", {
        token,
        password: nextPassword,
        confirmPassword: "mismatch",
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await call("reset-password", {
        token,
        password: nextPassword,
        confirmPassword: nextPassword,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await call("me", undefined, verified.cookie)).response.status,
    401,
  );
  assert.equal(
    (
      await call("reset-password", {
        token,
        password: nextPassword,
        confirmPassword: nextPassword,
      })
    ).response.status,
    400,
  );
  assert.equal(
    (await call("login", { email: user.email, password })).response.status,
    401,
  );
  assert.equal(
    (await call("login", { email: user.email, password: nextPassword }))
      .response.status,
    200,
  );
});
test("expired verification/reset proofs fail and failed code attempts persist", async () => {
  const user = await register("expired");
  const userId = (
    await pool.query("SELECT id FROM braincraze.users WHERE email=$1", [
      user.email,
    ])
  ).rows[0].id;
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await call("verify-email", { code: "000000" }, user.cookie)).response
        .status,
      400,
    );
  assert.equal(
    (
      await pool.query(
        'SELECT attempts FROM braincraze."EmailVerification" WHERE user_id=$1',
        [userId],
      )
    ).rows[0].attempts,
    5,
  );
  const mail = await latestMail(user.email, "Verify your BrainCraze email");
  const code = mail.text.match(/code is (\d{6})/)[1];
  assert.equal(
    (await call("verify-email", { code }, user.cookie)).response.status,
    400,
  );
  await pool.query(
    "UPDATE braincraze.\"EmailVerification\" SET attempts=0,expires_at=now()-interval '1 minute' WHERE user_id=$1",
    [userId],
  );
  assert.equal(
    (await call("verify-email", { code }, user.cookie)).response.status,
    400,
  );
  assert.equal(
    (await call("resend-verification", {}, user.cookie)).response.status,
    429,
  );
  await call("forgot-password", { email: user.email });
  const reset = await latestMail(user.email, "Reset your BrainCraze password");
  const token = reset.text.match(/#token=([a-f0-9]{64})/)[1];
  await pool.query(
    "UPDATE braincraze.challenges SET expires_at=now()-interval '1 minute' WHERE user_id=$1 AND kind='reset'",
    [userId],
  );
  assert.equal(
    (
      await call("reset-password", {
        token,
        password,
        confirmPassword: password,
      })
    ).response.status,
    400,
  );
});
test("CSRF, payload limits, allowed roles and anonymous protection are enforced", async () => {
  assert.equal((await call("me")).response.status, 401);
  assert.equal(
    (
      await call(
        "login",
        { email: "a@example.test", password },
        undefined,
        "https://attacker.invalid",
      )
    ).response.status,
    403,
  );
  assert.equal(
    (
      await call("register", {
        firstName: "A",
        lastName: "B",
        username: "admin",
        email: "a@example.test",
        password,
        confirmPassword: password,
        school: "Test",
    country:"Fixture territory",region:"Fixture administrative area",institutionName:"Test",noEducationalEmail:true,preferredLanguage:"en",
        role: "Administrator",
      })
    ).response.status,
    400,
  );
  assert.equal(
    (await call("login", { junk: "x".repeat(17000) })).response.status,
    413,
  );
  const callback = await fetch(
    `${origin}/api/auth/oauth/google/callback?state=invalid&code=invalid`,
    { redirect: "manual" },
  );
  assert.equal(callback.status, 303);
  assert.ok(callback.headers.get("location")?.includes("/login?error="));
});
test("login rate limit and expired session are enforced", async () => {
  const address = `throttle-${run}@example.test`;
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await call("login", { email: address, password: "wrong" })).response
        .status,
      401,
    );
  assert.equal(
    (await call("login", { email: address, password: "wrong" })).response
      .status,
    429,
  );
  const user = await register("timeout");
  await pool.query(
    "UPDATE braincraze.sessions SET last_seen_at=now()-interval '31 minutes' WHERE user_id=(SELECT id FROM braincraze.users WHERE email=$1)",
    [user.email],
  );
  assert.equal((await call("me", undefined, user.cookie)).response.status, 401);
});

test("verification status exposes expiry/cooldown but no code; proof is hashed for a 15-minute lifetime", async () => {
  const user = await register("status");
  assert.equal((await call("verification-status")).response.status, 401);
  const result = await call("verification-status", undefined, user.cookie);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.data.verified, false);
  assert.equal(result.data.email, user.email);
  assert.equal(result.data.deliveryStatus, "sent");
  assert.equal(result.data.remainingAttempts, 5);
  assert.ok(
    Date.parse(result.data.expiresAt) - Date.parse(result.data.serverNow) >
      14 * 60 * 1000,
  );
  assert.ok(
    Date.parse(result.data.resendAvailableAt) >
      Date.parse(result.data.serverNow),
  );
  assert.equal("code" in result.data, false);
  assert.equal("token_hash" in result.data, false);
  const record = await pool.query(
    `SELECT v.*,extract(epoch from (v.expires_at-v.created_at))::integer AS lifetime FROM braincraze."EmailVerification" v JOIN braincraze.users u ON u.id=v.user_id WHERE u.email=$1`,
    [user.email],
  );
  const mail = await latestMail(user.email, "Verify your BrainCraze email");
  const code = mail.text.match(/code is (\d{6})/)[1];
  assert.equal(record.rows[0].lifetime, 900);
  assert.equal(record.rows[0].verified, false);
  assert.equal(record.rows[0].code.length, 64);
  assert.equal(record.rows[0].code === code, false);
  assert.ok(mail.text.includes("15 minutes"));
  const verified = await verify(user.email, user.cookie);
  const saved = await pool.query(
    `SELECT v.verified,v.verified_at IS NOT NULL AS stamped FROM braincraze."EmailVerification" v JOIN braincraze.users u ON u.id=v.user_id WHERE u.email=$1`,
    [user.email],
  );
  assert.equal(saved.rows[0].verified, true);
  assert.equal(saved.rows[0].stamped, true);
  assert.equal(verified.data.message, "Email Verified");
  assert.equal(verified.data.verification.verified, true);
  assert.equal(
    (await call("verification-status", undefined, verified.cookie)).data
      .verified,
    true,
  );
  assert.equal(
    (await call("verify-email", { code }, verified.cookie)).response.status,
    400,
  );
});

test("resend replaces the proof, resets the timer/attempts, and enforces cooldown under concurrency", async () => {
  const user = await register("resend");
  const first = await latestMail(user.email, "Verify your BrainCraze email");
  const oldCode = first.text.match(/code is (\d{6})/)[1];
  assert.equal(
    (await call("resend-verification", {}, user.cookie)).response.status,
    429,
  );
  await call("verify-email", { code: "000000" }, user.cookie);
  await pool.query(
    `UPDATE braincraze."EmailVerification" SET created_at=now()-interval '61 seconds' WHERE user_id=(SELECT id FROM braincraze.users WHERE email=$1)`,
    [user.email],
  );
  const results = await Promise.all([
    call("resend-verification", {}, user.cookie),
    call("resend-verification", {}, user.cookie),
  ]);
  assert.deepEqual(results.map((r) => r.response.status).sort(), [200, 429]);
  const success = results.find((r) => r.response.status === 200)!;
  assert.equal(success.data.verification.remainingAttempts, 5);
  assert.ok(
    Date.parse(success.data.verification.expiresAt) -
      Date.parse(success.data.verification.serverNow) >
      14 * 60 * 1000,
  );
  const latest = await latestMail(user.email, "Verify your BrainCraze email");
  const newCode = latest.text.match(/code is (\d{6})/)[1];
  assert.equal(newCode === oldCode, false);
  assert.equal(
    (await call("verify-email", { code: oldCode }, user.cookie)).response
      .status,
    400,
  );
  assert.equal(
    (await call("verify-email", { code: newCode }, user.cookie)).response
      .status,
    200,
  );
});

test("ownership is session-bound and expiry is enforced at the 15-minute boundary", async () => {
  const first = await register("owner"),
    second = await register("target");
  const mail = await latestMail(first.email, "Verify your BrainCraze email");
  const code = mail.text.match(/code is (\d{6})/)[1];
  const status = await call("verification-status", undefined, first.cookie);
  assert.equal(status.data.email, first.email);
  // A supplied account ID never overrides the authenticated account.
  const id = (
    await pool.query("SELECT id FROM braincraze.users WHERE email=$1", [
      second.email,
    ])
  ).rows[0].id;
  const firstId = (
    await pool.query("SELECT id FROM braincraze.users WHERE email=$1", [
      first.email,
    ])
  ).rows[0].id;
  const other = await latestMail(second.email, "Verify your BrainCraze email");
  const otherCode = other.text.match(/code is (\d{6})/)[1];
  const foreignCode = code !== otherCode ? code : "000000";
  assert.equal(
    (
      await call(
        "verify-email",
        { code: foreignCode, user_id: firstId },
        second.cookie,
      )
    ).response.status,
    400,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT email_verified_at FROM braincraze.users WHERE id=$1",
        [id],
      )
    ).rows[0].email_verified_at,
    null,
  );
  await pool.query(
    `UPDATE braincraze."EmailVerification" SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE user_id=(SELECT id FROM braincraze.users WHERE email=$1)`,
    [first.email],
  );
  const expired = await call("verify-email", { code }, first.cookie);
  assert.equal(expired.response.status, 400);
  assert.ok(expired.data.error.includes("expired"));
  assert.equal(
    (await call("sessions", undefined, first.cookie)).response.status,
    403,
  );
});

test("email delivery failure is recorded and cannot grant verification", async () => {
  const user = await register("mailfail");
  const userId = (
    await pool.query("SELECT id FROM braincraze.users WHERE email=$1", [
      user.email,
    ])
  ).rows[0].id;
  await pool.query(
    `UPDATE braincraze."EmailVerification" SET created_at=now()-interval '61 seconds' WHERE user_id=$1`,
    [userId],
  );
  const folder = await mkdtemp(resolve("apps/web/.local/mail-failure-"));
  const blocked = resolve(folder, "not-a-directory");
  await writeFile(blocked, "Local test fixture");
  const old = process.env.MAIL_OUTBOX_DIR;
  const { issueVerification } =
    await import("../apps/web/lib/auth/email-verification");
  const { db } = await import("../apps/web/lib/auth/db");
  try {
    // Deliberately fail the local filesystem transport, without disabling TLS or contacting SMTP.
    process.env.MAIL_OUTBOX_DIR = blocked;
    assert.equal(await issueVerification(userId, user.email), false);
    const status = await call("verification-status", undefined, user.cookie);
    assert.equal(status.data.deliveryStatus, "failed");
    assert.equal(status.data.verified, false);
    const verify = await call("verify-email", { code: "000000" }, user.cookie);
    assert.equal(verify.response.status, 400);
    assert.ok(verify.data.error.includes("not been sent successfully"));
    assert.equal(
      (await call("sessions", undefined, user.cookie)).response.status,
      403,
    );
  } finally {
    if (old === undefined) delete process.env.MAIL_OUTBOX_DIR;
    else process.env.MAIL_OUTBOX_DIR = old;
    await rm(folder, { recursive: true, force: true });
    await db.end();
  }
});
