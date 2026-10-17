import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { db, transaction } from "../apps/web/lib/auth/db";
import { digest, hashPassword, verifyPassword } from "../apps/web/lib/auth/security";
import { queueSecurityNotice } from "../apps/web/lib/auth/security-notifications";
import { identityStatus } from "../apps/web/lib/onboarding/identity";
import { renderEmail } from "../apps/web/lib/i18n/email";
import { formattingTokens } from "../apps/web/lib/i18n/store";
import { mailConfigured, smtpOptions } from "../apps/web/lib/auth/mail";
const origin = process.env.APP_BASE_URL!,
  ids: string[] = [];
async function fixture(admin = false) {
  const id = randomUUID(),
    session = randomUUID(),
    token = randomBytes(32).toString("hex");
  ids.push(id);
  await db.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at,human_verified,is_admin) VALUES($1,'Readiness','Fixture',$2,$3,'Test school','Student',now(),true,$4)`,
    [
      id,
      "ready_" + id.replaceAll("-", "").slice(0, 18),
      id + "@example.test",
      admin,
    ],
  );
  await db.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember,mfa_verified_at) VALUES($1,$2,$3,'Readiness isolated fixture',now()+interval '1 hour',false,now())`,
    [session, id, digest(token)],
  );
  if (admin)
    await db.query(
      `INSERT INTO braincraze.account_security(user_id,enabled,totp_secret) VALUES($1,true,'isolated test fixture only')`,
      [id],
    );
  return { id, session, cookie: "bc_session=" + token };
}
after(async () => {
  await db.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [ids]);
  await db.end();
});
async function request(path: string, user?: { cookie: string }) {
  return fetch(origin + "/api/platform/" + path, {
    headers: user ? { cookie: user.cookie } : {},
  });
}
test("admin overview and subscription inventory enforce role and recent MFA without leaking credentials", async () => {
  const admin = await fixture(true),
    member = await fixture();
  assert.equal((await request("admin/overview")).status, 401);
  assert.equal((await request("admin/overview", member)).status, 403);
  const response = await request("admin/overview", admin);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.counts.users, "number");
  assert.equal(body.readiness.services.stripe.liveTested, false);
  assert.equal(body.readiness.scanner.signaturesValidated, false);
  assert.ok(!JSON.stringify(body).includes(process.env.AUTH_SECRET!));
  assert.equal(
    (await request("admin/subscriptions?page=0", admin)).status,
    400,
  );
  assert.equal(
    (await request("admin/subscriptions?status=forged", admin)).status,
    400,
  );
  const subscriptions = await request("admin/subscriptions", admin);
  assert.equal(subscriptions.status, 200);
  assert.ok(Array.isArray((await subscriptions.json()).subscriptions));
  await db.query(
    "UPDATE braincraze.sessions SET mfa_verified_at=now()-interval '16 minutes' WHERE id=$1",
    [admin.session],
  );
  assert.equal((await request("admin/subscriptions", admin)).status, 403);
});
test("verification checklist reflects evidence rather than treating sign-in or upload as approval", async () => {
  const user = await fixture();
  const status = await identityStatus(user.id);
  assert.deepEqual(status.checklist, {
    email: true,
    human: true,
    selfie: false,
    document: false,
    scanned: false,
    approved: false,
  });
  assert.equal(status.request, null);
  assert.ok(!JSON.stringify(status).includes("document_key"));
});
test("security notices commit atomically and contain no authentication secrets", async () => {
  const user = await fixture();
  await assert.rejects(
    transaction(async (client) => {
      await queueSecurityNotice(client, user.id, "password_changed");
      throw new Error("Deliberate rollback");
    }),
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM braincraze.localized_email_queue WHERE user_id=$1",
        [user.id],
      )
    ).rows[0].n,
    0,
  );
  await transaction(async (client) => {
    await queueSecurityNotice(client, user.id, "password_reset");
  });
  const rows = (
    await db.query(
      "SELECT template,template_values,deduplication_key FROM braincraze.localized_email_queue WHERE user_id=$1",
      [user.id],
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].template, "security");
  assert.deepEqual(rows[0].template_values, [origin + "/settings"]);
  assert.ok(rows[0].deduplication_key.startsWith("security:password_reset:"));
  const email = await renderEmail("security", "fr", [origin + "/settings"]);
  assert.equal(email.language, "fr");
  assert.ok(email.text.includes(origin + "/settings"));
  assert.ok(!email.text.includes("{0}"));
});
test("translation validation preserves nested tag order, named variables, printf tokens, and line breaks", () => {
  const source =
    "<b><i>{name}</i></b> %02d %.2f %% ${value}\nhttps://example.test";
  assert.equal(
    formattingTokens(source),
    formattingTokens(source.replace(" %02d", " — %02d")),
  );
  assert.notEqual(
    formattingTokens(source),
    formattingTokens(source.replace("</i></b>", "</b></i>")),
  );
  assert.notEqual(
    formattingTokens(source),
    formattingTokens(source.replace("%.2f", "%f")),
  );
  assert.notEqual(
    formattingTokens(source),
    formattingTokens(source.replace("{name}", "{other}")),
  );
  assert.notEqual(
    formattingTokens(source),
    formattingTokens(source.replace("\n", " ")),
  );
});
test("SMTP uses TLS and development outbox cannot be used for a public deployment", () => {
  const before = {
    ...Object.fromEntries(
      ["MAIL_MODE", "SMTP_PORT", "APP_BASE_URL", "ALLOW_LOCAL_OUTBOX"].map(
        (k) => [k, process.env[k]],
      ),
    ),
  };
  try {
    process.env.SMTP_PORT = "587";
    assert.equal(smtpOptions().requireTLS, true);
    assert.equal(smtpOptions().secure, false);
    process.env.SMTP_PORT = "465";
    assert.equal(smtpOptions().secure, true);
    process.env.MAIL_MODE = "outbox";
    process.env.ALLOW_LOCAL_OUTBOX = "true";
    process.env.APP_BASE_URL = "https://braincraze.example";
    assert.equal(mailConfigured(), false);
    process.env.APP_BASE_URL = "bad-url";
    assert.equal(mailConfigured(), false);
    process.env.MAIL_MODE = "unknown";
    assert.equal(mailConfigured(), false);
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('password changes enqueue a security notice only after authenticated, successful mutation',async()=>{
const user=await fixture(),password='An existing fixture password!',next='A replacement fixture password!';
await db.query('UPDATE braincraze.users SET password_hash=$2 WHERE id=$1',[user.id,await hashPassword(password)]);
const send=(currentPassword:string)=>fetch(origin+'/api/platform/security/password',{method:'POST',headers:{Cookie:user.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({currentPassword,password:next})});
assert.notEqual((await send('incorrect')).status,200);assert.equal((await db.query('SELECT count(*)::int AS n FROM braincraze.localized_email_queue WHERE user_id=$1',[user.id])).rows[0].n,0);
assert.equal((await send(password)).status,200);const hash=(await db.query('SELECT password_hash FROM braincraze.users WHERE id=$1',[user.id])).rows[0].password_hash;assert.equal(await verifyPassword(next,hash),true);
const queue=(await db.query('SELECT template,deduplication_key FROM braincraze.localized_email_queue WHERE user_id=$1',[user.id])).rows;assert.equal(queue.length,1);assert.equal(queue[0].template,'security');assert.ok(queue[0].deduplication_key.startsWith('security:password_changed:'));
});
