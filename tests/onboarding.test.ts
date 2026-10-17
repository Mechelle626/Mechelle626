import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import * as OTPAuth from "otpauth";
import { db } from "../apps/web/lib/auth/db";
import { digest, hashPassword } from "../apps/web/lib/auth/security";
import { beginMfa, enableMfa } from "../apps/web/lib/platform/mfa";
import { readDocument, removeDocument } from "../apps/web/lib/school/documents";
import { badgeFor } from "../apps/web/lib/platform/access";
import {
  residenceSchema,
  validateResidence,
} from "../apps/web/lib/onboarding/registration";
import { languages, direction } from "../apps/web/lib/i18n/config";
import {
  translate,
  currencyFormat,
  dateFormat,
  numberFormat,
} from "../apps/web/lib/i18n/translate";
import { nextStep } from "../apps/web/lib/onboarding/flow";
const origin = process.env.APP_BASE_URL!,
  schoolId = randomUUID(),
  ids: string[] = [],
  emails: string[] = [];
const password = "Onboarding fixture secure password!",
  hash = await hashPassword(password);
await db.query("INSERT INTO braincraze.schools(id,name) VALUES($1,$2)", [
  schoolId,
  "Identity fixture institution " + schoolId,
]);
async function fixture(admin = false, required = true) {
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomBytes(32).toString("hex"),
    name = "on_" + id.replaceAll("-", "").slice(0, 18);
  ids.push(id);
  await db.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,password_hash,school,role,email_verified_at,human_verified,human_verified_at,human_verification_provider,onboarding_required,institution_name,institution_id,country,region,is_admin) VALUES($1,'Identity','Fixture',$2,$3,$4,'Fixture school','Student',now(),true,now(),'turnstile',$5,$6,$7,'Fixture territory','Fixture region',$8)`,
    [
      id,
      name,
      name + "@example.test",
      hash,
      required,
      "Identity fixture institution " + schoolId,
      schoolId,
      admin,
    ],
  );
  await db.query(
    "INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember) VALUES($1,$2,$3,'Identity test fixture',now()+interval '12 hours',false)",
    [sid, id, digest(token)],
  );
  if (admin) {
    const setup = await beginMfa(id, name + "@example.test"),
      code = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(setup.secret),
      }).generate();
    await enableMfa(id, sid, code);
  }
  return { id, sid, cookie: `bc_session=${token}` };
}
async function api(
  path: string,
  user?: { cookie: string },
  body?: unknown,
  requestOrigin = origin,
) {
  return fetch(origin + "/api/onboarding/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body === undefined
        ? {}
        : { Origin: requestOrigin, "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
}
const image = () =>
  sharp({
    create: { width: 60, height: 40, channels: 3, background: "#dde9bf" },
  })
    .png()
    .toBuffer();
async function upload(
  user: { cookie: string },
  type: string,
  requestId?: string,
  method = type === "selfie" ? "camera" : "upload",
  data?: Buffer,
) {
  const form = new FormData();
  form.set("type", type);
  form.set("method", method);
  if (requestId) form.set("requestId", requestId);
  form.set(
    "document",
    new Blob([new Uint8Array(data ?? (await image()))], { type: "image/png" }),
    "synthetic-fixture.png",
  );
  return fetch(origin + "/api/onboarding/identity/document", {
    method: "POST",
    headers: { Cookie: user.cookie, Origin: origin },
    body: form,
  });
}
async function pair(user: { cookie: string }, type = "institution_id") {
  const selfie = await upload(user, "selfie");
  assert.equal(selfie.status, 201);
  const s = await selfie.json();
  const evidence = await upload(user, type, s.verification.request.id);
  assert.equal(evidence.status, 201);
  return (await evidence.json()).verification;
}
async function clean(id: string) {
  await db.query(
    `UPDATE braincraze."VerificationDocuments" SET scan_status='clean' WHERE verification_id=$1`,
    [id],
  );
} // Scan fixture only, not a real malware scan.
after(async () => {
  const docs = await db.query(
    `SELECT document_key FROM braincraze."VerificationDocuments" WHERE user_id=ANY($1)`,
    [ids],
  );
  for (const key of new Set(docs.rows.map((r) => r.document_key)))
    await removeDocument(key);
  await db.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [ids]);
  await db.query("DELETE FROM braincraze.schools WHERE id=$1", [schoolId]);
  for (const file of await readdir(process.env.MAIL_OUTBOX_DIR!)) {
    const mail = JSON.parse(
      await readFile(join(process.env.MAIL_OUTBOX_DIR!, file), "utf8"),
    );
    if (emails.includes(mail.to))
      await unlink(join(process.env.MAIL_OUTBOX_DIR!, file));
  }
  await db.end();
});

test("countries, territories, administrative areas and manual residence use real dataset validation", async () => {
  const countries = await (await api("options?kind=countries")).json();
  assert.ok(countries.options.length >= 240);
  assert.ok(countries.options.some((x: any) => x.code === "PR"));
  assert.ok(countries.options.some((x: any) => x.code === "GU"));
  const states = await (
    await api("options?kind=regions&country=US&q=California")
  ).json();
  assert.ok(states.options.some((x: any) => x.code === "CA"));
  const manual = residenceSchema.parse({
    country: "የሙከራ አገር",
    region: "自訂行政區",
    institutionName: "Établissement de test",
    noEducationalEmail: true,
    preferredLanguage: "am",
  });
  await validateResidence(manual);
  await assert.rejects(validateResidence({ ...manual, countryCode: "ZZ" }), {
    status: 400,
  });
  await assert.rejects(
    validateResidence({
      ...manual,
      country: "United States",
      countryCode: "US",
      region: "Wrong state",
      regionCode: "CA",
    }),
    { status: 400 },
  );
  assert.equal(
    residenceSchema.safeParse({ ...manual, noEducationalEmail: false }).success,
    false,
  );
  assert.equal((await api("options?kind=invented")).status, 400);
});

test("registration requires residence/institution details and permits an explicit no-academic-email route", async () => {
  const id = randomUUID().slice(0, 8),
    email = `on-reg-${id}@example.test`;
  emails.push(email);
  const base = {
    firstName: "Registration",
    lastName: "Fixture",
    username: "on_reg_" + id,
    email,
    password,
    confirmPassword: password,
    school: "Manually entered institution",
    role: "Student",
  };
  const send = (body: unknown) =>
    fetch(origin + "/api/auth/register", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await send(base)).status, 400);
  const details = {
    country: "Manual country fixture",
    region: "Manual region fixture",
    institutionName: base.school,
    preferredLanguage: "fr",
    noEducationalEmail: false,
  };
  assert.equal((await send({ ...base, ...details })).status, 400);
  const r = await send({
    ...base,
    ...details,
    noEducationalEmail: true,
    identity_verification_status: "verified",
    is_admin: true,
  });
  assert.equal(r.status, 201);
  const row = (
    await db.query("SELECT * FROM braincraze.users WHERE email=$1", [email])
  ).rows[0];
  ids.push(row.id);
  assert.equal(row.country, details.country);
  assert.equal(row.region, details.region);
  assert.equal(row.institution_name, base.school);
  assert.equal(row.preferred_language, "fr");
  assert.equal(row.institution_email, null);
  assert.equal(row.onboarding_required, true);
  assert.equal(row.identity_verification_status, "not_started");
  assert.equal(row.is_admin, false);
});

test("identity APIs enforce email/human gates, selfie-first order, one document and private status responses", async () => {
  assert.equal((await api("identity/status")).status, 401);
  const u = await fixture();
  assert.equal((await upload(u, "institution_id", randomUUID())).status, 409);
  assert.equal((await upload(u, "selfie", undefined, "upload")).status, 400);
  await db.query(
    "UPDATE braincraze.users SET human_verified=false WHERE id=$1",
    [u.id],
  );
  assert.equal((await upload(u, "selfie")).status, 403);
  await db.query(
    "UPDATE braincraze.users SET human_verified=true WHERE id=$1",
    [u.id],
  );
  const s = await (await upload(u, "selfie")).json();
  assert.equal(s.verification.request.status, "collecting");
  assert.equal(s.verification.selfieStatus, "pending_review");
  const serialized = JSON.stringify(s);
  for (const key of ["document_url", "document_key", "private://"])
    assert.equal(serialized.includes(key), false);
  const id = s.verification.request.documents[0].id;
  assert.equal((await api("admin/document/" + id, u)).status, 403);
  assert.equal(
    (await fetch(origin + "/verification-documents/" + id)).status,
    404,
  );
  const doc = (
    await db.query(
      `SELECT * FROM braincraze."VerificationDocuments" WHERE id=$1`,
      [id],
    )
  ).rows[0];
  const cipher = await readFile(
    join(process.env.SCHOOL_DOCUMENT_DIR!, doc.document_key + ".enc"),
  );
  assert.equal(cipher.subarray(0, 4).toString(), "BCS1");
  assert.equal(
    (await sharp(await readDocument(doc.document_key, u.id, id)).metadata())
      .format,
    "jpeg",
  );
  await assert.rejects(readDocument(doc.document_key, randomUUID(), id));
  const second = await upload(u, "institution_id", s.verification.request.id);
  assert.equal(second.status, 201);
  assert.equal(
    (await upload(u, "passport", s.verification.request.id)).status,
    409,
  );
});

test("government ID review is manual, scan-gated, audited, and cannot grant school affiliation", async () => {
  const u = await fixture(),
    admin = await fixture(true, false),
    status = await pair(u, "passport"),
    id = status.request.id;
  assert.equal((await api("admin/identity", u)).status, 403);
  const review = (decision: string, approveAffiliation = false) =>
    api("admin/identity/review", admin, {
      id,
      decision,
      notes: "Synthetic identity review decision",
      approveAffiliation,
    });
  assert.equal((await review("verified")).status, 400);
  assert.equal(
    (await api("admin/document/" + status.request.documents[0].id, admin))
      .status,
    403,
  );
  assert.equal((await review("under_review")).status, 200);
  assert.equal(
    (await (await api("identity/status", u)).json()).status,
    "under_review",
  );
  await clean(id);
  assert.equal((await review("verified", true)).status, 400);
  assert.equal((await review("verified")).status, 200);
  const approved = await (await api("identity/status", u)).json();
  assert.equal(approved.status, "verified");
  assert.equal(approved.selfieStatus, "verified");
  assert.equal(await badgeFor(u.id), null);
  const page = await fetch(origin + "/account", {
    headers: { Cookie: u.cookie },
    redirect: "manual",
  });
  assert.equal(page.status, 307);
  assert.ok(page.headers.get("location")?.endsWith("/tutorial"));
  assert.ok(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM braincraze.identity_review_logs WHERE verification_id=$1",
        [id],
      )
    ).rows[0].n >= 2,
  );
});

test("institution review may award existing academic approval only with an explicit school-affiliation decision", async () => {
  const u = await fixture(),
    admin = await fixture(true, false),
    s = await pair(u),
    id = s.request.id;
  await clean(id);
  assert.equal(
    (
      await api("admin/identity/review", admin, {
        id,
        decision: "verified",
        notes: "Synthetic institution affiliation review",
        approveAffiliation: true,
      })
    ).status,
    200,
  );
  assert.equal(await badgeFor(u.id), "Student");
  const d = (
    await db.query(
      `SELECT d.id,d.document_key,s.document_key AS school_key FROM braincraze."VerificationDocuments" d JOIN braincraze.school_verification_requests s ON s.id=d.id WHERE d.verification_id=$1`,
      [id],
    )
  ).rows[0];
  assert.equal(d.school_key, d.document_key);
  const response = await fetch(
    origin + "/api/platform/admin/document/" + d.id,
    { headers: { Cookie: admin.cookie } },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
});

test("additional-information/rejection states persist; resubmission supersedes the old request and prevents stale approval", async () => {
  const u = await fixture(),
    admin = await fixture(true, false),
    s = await pair(u, "national_id"),
    id = s.request.id;
  assert.equal(
    (
      await api("admin/identity/review", admin, {
        id,
        decision: "additional_information_required",
        notes: "Submit a clearer synthetic fixture image",
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await api("identity/status", u)).json()).status,
    "additional_information_required",
  );
  const replacement = await (await upload(u, "selfie")).json();
  assert.notEqual(replacement.verification.request.id, id);
  assert.equal(replacement.verification.request.status, "collecting");
  assert.equal(
    (
      await api("admin/identity/review", admin, {
        id,
        decision: "verified",
        notes: "Stale identity proof cannot be approved",
      })
    ).status,
    409,
  );
  const next = await (
    await upload(u, "government_id", replacement.verification.request.id)
  ).json();
  assert.equal(
    (
      await api("admin/identity/review", admin, {
        id: next.verification.request.id,
        decision: "rejected",
        notes: "Synthetic rejection decision",
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await api("identity/status", u)).json()).status,
    "rejected",
  );
});

test("identity is a separate API gate even for paid accounts; discovery accurately labels unbuilt and school-only features", async () => {
  const u = await fixture();
  await db.query(
    "INSERT INTO braincraze.subscriptions(user_id,stripe_subscription_id,stripe_price_id,status,period_end) VALUES($1,$2,'price_identity_fixture','active',now()+interval '1 day')",
    [u.id, "sub_identity_" + u.id],
  );
  const premium = await fetch(origin + "/api/platform/features/analytics", {
    headers: { Cookie: u.cookie },
  });
  assert.equal(premium.status, 403);
  for (const path of ["posts", "messages"])
    assert.equal(
      (
        await fetch(origin + "/api/platform/" + path, {
          headers: { Cookie: u.cookie },
        })
      ).status,
      403,
    );
  const before = await (await api("discovery", u)).json();
  assert.equal(
    before.features.find((x: any) => x.name === "Marketplace").available,
    false,
  );
  assert.equal(
    before.features.find((x: any) => x.name === "Profile Customization")
      .available,
    true,
  );
  assert.equal(
    before.features.find((x: any) => x.name === "GPA Tools").lock,
    "coming_soon",
  );
  assert.equal(
    (await api("tutorial", u, { step: 0, status: "skipped" })).status,
    403,
  );
  await db.query(
    "UPDATE braincraze.users SET identity_verification_status='verified',selfie_verification_status='verified' WHERE id=$1",
    [u.id],
  ); // Explicit approval fixture for feature/tour isolation.
  const after = await (await api("discovery", u)).json();
  assert.equal(
    after.features.find((x: any) => x.name === "Marketplace").available,
    true,
  );
  assert.equal(
    after.features.find((x: any) => x.name === "Study Partner Matching")
      .available,
    false,
  );
  assert.equal(
    (await api("tutorial", u, { step: 0, status: "completed" })).status,
    400,
  );
  assert.equal(
    (await api("tutorial", u, { step: 3, status: "in_progress" })).status,
    200,
  );
  assert.equal((await (await api("tutorial", u)).json()).step, 3);
  assert.equal(
    (await api("tutorial", u, { step: 10, status: "completed" })).status,
    200,
  );
});

test("language preferences validate all 18 locales, persist, format with Intl, and preserve missing-copy fallback", async () => {
  assert.equal(languages.length, 18);
  for (const { code } of languages) {
    const r = await api("messages?language=" + code);
    assert.equal(r.status, 200);
    const c = await r.json();
    assert.equal(typeof (c["Language"] ?? "Language"), "string");
    assert.doesNotThrow(() => dateFormat("2026-10-17T12:30:00Z", code));
    assert.doesNotThrow(() => currencyFormat(7.99, "USD", code));
    assert.doesNotThrow(() => numberFormat(1234.5, code));
  }
  assert.equal(direction("ar"), "rtl");
  assert.equal(direction("yi"), "rtl");
  assert.equal(direction("fr"), "ltr");
  assert.equal(translate("Private user content", {}), "Private user content");
  assert.equal(translate("toString", {}), "toString");
  assert.equal(translate("constructor", {}), "constructor");
  assert.equal(
    translate("Hello $&", { "Hello {0}": "Bonjour {0}" }),
    "Bonjour $&",
  );
  assert.equal(translate(" Login ", { Login: "Connexion" }), " Connexion ");
  assert.equal(
    translate("Resend in 12s", { "Resend in {0}s": "Renvoyer dans {0}s" }),
    "Renvoyer dans 12s",
  );
  assert.match(currencyFormat(7.99, "USD", "fr"), /7,99/);
  const u = await fixture();
  assert.equal((await api("preferences", u, { language: "ar" })).status, 200);
  assert.equal(
    (
      await db.query(
        "SELECT preferred_language FROM braincraze.users WHERE id=$1",
        [u.id],
      )
    ).rows[0].preferred_language,
    "ar",
  );
  assert.equal((await api("preferences", u, { language: "xx" })).status, 400);
  assert.equal(
    (
      await api(
        "preferences",
        u,
        { language: "fr" },
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    nextStep({
      email_verified_at: "now",
      human_verified: true,
      school_verified: false,
      onboarding_required: true,
      identity_verification_status: "not_started",
    }),
    "/identity-verification",
  );
  assert.equal(
    nextStep({
      email_verified_at: "now",
      human_verified: true,
      school_verified: false,
      onboarding_required: false,
    }),
    "/school-verification",
  );
});

test("unverified new accounts can preview feature discovery without unlocking protected settings or content", async () => {
  const u = await fixture();
  await db.query(
    "UPDATE braincraze.users SET email_verified_at=NULL,human_verified=false WHERE id=$1",
    [u.id],
  );
  const response = await api("discovery", u);
  assert.equal(response.status, 200);
  const view = await response.json();
  assert.equal(view.identityReady, false);
  assert.equal(view.verificationNext, "/verify-email");
  assert.equal(
    view.features.find((x: any) => x.name === "Profile Customization")
      .available,
    false,
  );
  assert.equal(
    (
      await fetch(origin + "/api/platform/settings", {
        headers: { Cookie: u.cookie },
      })
    ).status,
    403,
  );
  const page = await fetch(origin + "/discover", {
    headers: { Cookie: u.cookie },
    redirect: "manual",
  });
  assert.equal(page.status, 200);
});
