import {
  reviewSchoolRequest,
  scanSchoolRequest,
} from "../apps/web/lib/school/review";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { db } from "../apps/web/lib/auth/db";
import { digest, randomToken } from "../apps/web/lib/auth/security";
import {
  startSchoolEmail,
  resendSchoolEmail,
  confirmSchoolEmail,
  submitSchoolDocument,
  schoolStatus,
  searchSchools,
  canonicalDomain,
} from "../apps/web/lib/school/service";
import {
  readDocument,
  removeDocument,
  validateDocument,
} from "../apps/web/lib/school/documents";

const run = randomUUID().slice(0, 8),
  schoolId = randomUUID(),
  domainId = randomUUID(),
  otherSchool = randomUUID();
const studentDomain = `students-${run}.example.test`,
  facultyDomain = `faculty-${run}.example.test`;
const users: string[] = [],
  emails: string[] = [],
  documentKeys: string[] = [];
const origin = process.env.APP_BASE_URL!,
  mailRoot = process.env.MAIL_OUTBOX_DIR!;
await db.query(
  "INSERT INTO braincraze.schools(id,name) VALUES($1,$2),($3,$4)",
  [
    schoolId,
    `School fixture ${run}`,
    otherSchool,
    `Other school fixture ${run}`,
  ],
);
await db.query(
  `INSERT INTO braincraze.school_email_domains(id,school_id,domain,email_roles,policy_reference,reviewed_by) VALUES($1,$2,$3,ARRAY['Student'],'https://fixtures.example.test/policy','automated fixture'),($4,$2,$5,ARRAY['Faculty'],'https://fixtures.example.test/policy','automated fixture')`,
  [domainId, schoolId, studentDomain, randomUUID(), facultyDomain],
);
async function fixture(human = true, emailVerified = true) {
  const id = randomUUID(),
    sid = randomUUID(),
    token = randomToken();
  users.push(id);
  await db.query(
    `INSERT INTO braincraze.users(id,first_name,last_name,username,email,school,role,email_verified_at,human_verified,human_verified_at,human_verification_provider) VALUES($1,'School','Fixture',$2,$3,'Unverified profile school','Student',CASE WHEN $4 THEN now() ELSE NULL END,$5,CASE WHEN $5 THEN now() ELSE NULL END,CASE WHEN $5 THEN 'turnstile' ELSE NULL END)`,
    [
      id,
      `school_${id.replaceAll("-", "").slice(0, 18)}`,
      `school-${id}@example.test`,
      emailVerified,
      human,
    ],
  );
  await db.query(
    `INSERT INTO braincraze.sessions(id,user_id,token_hash,user_agent,expires_at,remember) VALUES($1,$2,$3,'School fixture',now()+interval '12 hours',false)`,
    [sid, id, digest(token)],
  );
  return { id, sid, cookie: `bc_session=${token}` };
}
async function mailCode(email: string) {
  for (const file of (await readdir(mailRoot)).sort().reverse()) {
    const mail = JSON.parse(await readFile(join(mailRoot, file), "utf8"));
    if (
      mail.to === email &&
      mail.subject === "Verify your BrainCraze school email"
    )
      return mail.text.match(/code is (\d{6})/)[1] as string;
  }
  throw new Error("School email fixture was not written.");
}
async function begin(
  user: { id: string; sid: string },
  role: "Student" | "Faculty" = "Student",
) {
  const email = `user-${user.id}@${role === "Faculty" ? facultyDomain : studentDomain}`;
  emails.push(email);
  const result = await startSchoolEmail(user.id, user.sid, {
    schoolId,
    role,
    universityEmail: email,
  });
  assert.equal(result.emailSent, true);
  return {
    result,
    email,
    id: result.verification.request!.id,
    code: await mailCode(email),
  };
}
async function api(
  action: string,
  user?: { cookie: string },
  body?: unknown,
  requestOrigin = origin,
) {
  const response = await fetch(`${origin}/api/school/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(user ? { Cookie: user.cookie } : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: requestOrigin }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  return response;
}
after(async () => {
  for (const key of documentKeys) await removeDocument(key);
  await db.query("DELETE FROM braincraze.users WHERE id=ANY($1)", [users]);
  await db.query(
    "DELETE FROM braincraze.school_email_domains WHERE school_id=ANY($1)",
    [[schoolId, otherSchool]],
  );
  await db.query("DELETE FROM braincraze.schools WHERE id=ANY($1)", [
    [schoolId, otherSchool],
  ]);
  for (const file of await readdir(mailRoot)) {
    const mail = JSON.parse(await readFile(join(mailRoot, file), "utf8"));
    if (emails.includes(mail.to)) await unlink(join(mailRoot, file));
  }
  await db.end();
});

test("directory is searchable and only exact, reviewed school/domain/role combinations are accepted", async () => {
  const user = await fixture();
  assert.equal(
    (await searchSchools(run)).some((s) => s.id === schoolId),
    true,
  );
  for (const email of [
    `a@${studentDomain}.attacker.test`,
    `a@not-${studentDomain}`,
    `a@${facultyDomain}`,
  ])
    await assert.rejects(
      startSchoolEmail(user.id, user.sid, {
        schoolId,
        role: "Student",
        universityEmail: email,
      }),
      { status: 400 },
    );
  await assert.rejects(
    startSchoolEmail(user.id, user.sid, {
      schoolId: otherSchool,
      role: "Student",
      universityEmail: `a@${studentDomain}`,
    }),
    { status: 400 },
  );
  await assert.rejects(
    startSchoolEmail(user.id, user.sid, {
      schoolId,
      role: "Faculty",
      universityEmail: `a@${studentDomain}`,
    }),
    { status: 400 },
  );
  assert.throws(() => canonicalDomain("*.edu"));
  assert.throws(() => canonicalDomain("127.0.0.1"));
  assert.equal(canonicalDomain("EXAMPLE.EDU"), "example.edu");
});

test("15-minute hashed school email proof grants only the policy-approved school and role", async () => {
  const user = await fixture(),
    request = await begin(user, "Faculty");
  const stored = (
    await db.query(
      "SELECT *,extract(epoch from(code_expires_at-code_issued_at))::integer AS lifetime FROM braincraze.school_verification_requests WHERE id=$1",
      [request.id],
    )
  ).rows[0];
  assert.equal(stored.lifetime, 900);
  assert.equal(stored.code_hash.length, 64);
  assert.equal(stored.code_hash === request.code, false);
  assert.equal(request.result.verification.schoolVerified, false);
  const status = await confirmSchoolEmail(
    user.id,
    user.sid,
    request.id,
    request.code,
  );
  assert.equal(status.schoolVerified, true);
  assert.equal(status.verifiedSchool?.role, "Faculty");
  assert.equal(status.request?.status, "approved");
  assert.equal("code_hash" in status.request!, false);
  assert.equal("document_key" in status.request!, false);
  const userRow = (
    await db.query(
      "SELECT role,verified_school_id,school_verified FROM braincraze.users WHERE id=$1",
      [user.id],
    )
  ).rows[0];
  assert.equal(userRow.role, "Faculty");
  assert.equal(userRow.verified_school_id, schoolId);
  assert.equal(userRow.school_verified, true);
  await assert.rejects(
    confirmSchoolEmail(user.id, user.sid, request.id, request.code),
    { status: 400 },
  );
  assert.equal(
    (
      await fetch(`${origin}/account`, {
        headers: { Cookie: user.cookie },
        redirect: "manual",
      })
    ).status,
    200,
  );
});

test("ownership, failed-attempt limits, expiry, resend replacement and policy revocation fail closed", async () => {
  const user = await fixture(),
    other = await fixture(),
    request = await begin(user);
  await assert.rejects(
    confirmSchoolEmail(other.id, other.sid, request.id, request.code),
    { status: 400 },
  );
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      confirmSchoolEmail(user.id, user.sid, request.id, "000000"),
      { status: 400 },
    );
  assert.equal((await schoolStatus(user.id)).request?.remainingAttempts, 0);
  await assert.rejects(
    confirmSchoolEmail(user.id, user.sid, request.id, request.code),
    { status: 400 },
  );
  await assert.rejects(resendSchoolEmail(user.id, user.sid, request.id), {
    status: 429,
  });
  await db.query(
    "UPDATE braincraze.school_verification_requests SET code_issued_at=now()-interval '61 seconds' WHERE id=$1",
    [request.id],
  );
  const resent = await resendSchoolEmail(user.id, user.sid, request.id);
  assert.equal(resent.emailSent, true);
  const fresh = await mailCode(request.email);
  assert.equal(fresh === request.code, false);
  assert.equal(resent.verification.request?.remainingAttempts, 5);
  await assert.rejects(
    confirmSchoolEmail(user.id, user.sid, request.id, request.code),
    { status: 400 },
  );
  await db.query(
    "UPDATE braincraze.school_email_domains SET active=false WHERE id=$1",
    [domainId],
  );
  await assert.rejects(
    confirmSchoolEmail(user.id, user.sid, request.id, fresh),
    { status: 400 },
  );
  await db.query(
    "UPDATE braincraze.school_email_domains SET active=true WHERE id=$1",
    [domainId],
  );
  await db.query(
    "UPDATE braincraze.school_verification_requests SET code_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [request.id],
  );
  await assert.rejects(
    confirmSchoolEmail(user.id, user.sid, request.id, fresh),
    { status: 400 },
  );
  assert.equal((await schoolStatus(user.id)).schoolVerified, false);
});

test("both ID methods encrypt and quarantine evidence; clean scan and explicit reviewer decision are required", async () => {
  const bytes = await sharp({
    create: { width: 32, height: 20, channels: 3, background: "#cce8b8" },
  })
    .png()
    .toBuffer();
  for (const method of ["upload", "camera"] as const) {
    const user = await fixture();
    const status = await submitSchoolDocument(
      user.id,
      user.sid,
      { schoolId, role: "Tutor" },
      method,
      bytes,
      "image/png",
    );
    const id = status.request!.id;
    assert.equal(status.schoolVerified, false);
    assert.equal(status.request?.status, "pending_review");
    assert.equal(status.request?.documentScanStatus, "pending");
    const row = (
      await db.query(
        "SELECT * FROM braincraze.school_verification_requests WHERE id=$1",
        [id],
      )
    ).rows[0];
    documentKeys.push(row.document_key);
    const encrypted = await readFile(
      join(process.env.SCHOOL_DOCUMENT_DIR!, `${row.document_key}.enc`),
    );
    assert.equal(encrypted.subarray(0, 4).toString(), "BCS1");
    assert.equal(encrypted.includes(bytes), false);
    const plain = await readDocument(row.document_key, user.id, id);
    assert.equal((await sharp(plain).metadata()).format, "jpeg");
    await assert.rejects(readDocument(row.document_key, randomUUID(), id));
    await assert.rejects(
      reviewSchoolRequest(
        id,
        "approve",
        "fixture reviewer",
        "Fixture approval",
      ),
      { status: 400 },
    );
    // This is an injected scan fixture, not a real malware scan or proof of identity.
    assert.equal(
      await scanSchoolRequest(id, "fixture scanner", async () => "clean"),
      "clean",
    );
    await reviewSchoolRequest(
      id,
      "approve",
      "fixture reviewer",
      "Fixture identity review approved",
    );
    assert.equal((await schoolStatus(user.id)).schoolVerified, true);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::integer AS count FROM braincraze.school_review_logs WHERE request_id=$1",
          [id],
        )
      ).rows[0].count,
      2,
    );
  }
});

test("bad files and scanner failure cannot approve an affiliation", async () => {
  await assert.rejects(
    validateDocument(Buffer.from("<svg>not an ID</svg>"), "image/svg+xml"),
    { status: 400 },
  );
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  await assert.rejects(validateDocument(image, "application/pdf"), {
    status: 400,
  });
  await assert.rejects(
    validateDocument(Buffer.alloc(10 * 1024 * 1024 + 1), "image/png"),
    { status: 400 },
  );
  const user = await fixture(),
    status = await submitSchoolDocument(
      user.id,
      user.sid,
      { schoolId, role: "Staff" },
      "upload",
      image,
      "image/png",
    );
  const id = status.request!.id;
  const row = (
    await db.query(
      "SELECT document_key FROM braincraze.school_verification_requests WHERE id=$1",
      [id],
    )
  ).rows[0];
  documentKeys.push(row.document_key);
  await assert.rejects(
    scanSchoolRequest(id, "fixture scanner", async () => {
      throw new Error("Fixture scanner unavailable");
    }),
    { status: 503 },
  );
  await assert.rejects(
    reviewSchoolRequest(
      id,
      "approve",
      "fixture reviewer",
      "Cannot approve an unscanned document",
    ),
    { status: 400 },
  );
  assert.equal((await schoolStatus(user.id)).schoolVerified, false);
  await scanSchoolRequest(id, "fixture scanner", async () => "infected");
  await assert.rejects(
    reviewSchoolRequest(
      id,
      "approve",
      "fixture reviewer",
      "Cannot approve infected content",
    ),
    { status: 400 },
  );
  await reviewSchoolRequest(
    id,
    "reject",
    "fixture reviewer",
    "Please submit clear current school identification.",
  );
  assert.equal((await schoolStatus(user.id)).request?.status, "rejected");
});

test("new evidence supersedes old proofs and revokes prior approval while review is pending", async () => {
  const user = await fixture(),
    request = await begin(user);
  await confirmSchoolEmail(user.id, user.sid, request.id, request.code);
  const image = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const status = await submitSchoolDocument(
    user.id,
    user.sid,
    { schoolId, role: "Faculty" },
    "camera",
    image,
    "image/png",
  );
  assert.equal(status.schoolVerified, false);
  const key = (
    await db.query(
      "SELECT document_key FROM braincraze.school_verification_requests WHERE id=$1",
      [status.request!.id],
    )
  ).rows[0].document_key;
  documentKeys.push(key);
  assert.equal(
    (
      await db.query(
        "SELECT status FROM braincraze.school_verification_requests WHERE id=$1",
        [request.id],
      )
    ).rows[0].status,
    "superseded",
  );
  await assert.rejects(
    confirmSchoolEmail(user.id, user.sid, request.id, request.code),
    { status: 400 },
  );
  await reviewSchoolRequest(
    status.request!.id,
    "needs_information",
    "fixture reviewer",
    "Please supply the current affiliation dates.",
  );
  assert.equal(
    (await schoolStatus(user.id)).request?.status,
    "needs_information",
  );
});

test("HTTP endpoints enforce earlier gates, CSRF, roles, ownership and non-public documents", async () => {
  assert.equal((await api("status")).status, 401);
  const humanMissing = await fixture(false),
    emailMissing = await fixture(true, false),
    user = await fixture();
  assert.equal((await api("status", humanMissing)).status, 403);
  assert.equal((await api("status", emailMissing)).status, 403);
  assert.equal(
    (
      await api("email/start", user, {
        schoolId,
        role: "Administrator",
        universityEmail: `a@${studentDomain}`,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        "email/start",
        user,
        { schoolId, role: "Student", universityEmail: `a@${studentDomain}` },
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  assert.equal((await api("documents/private-id", user)).status, 404);
  assert.equal(
    (
      await fetch(`${origin}/school-documents/anything.enc`, {
        headers: { Cookie: user.cookie },
      })
    ).status,
    404,
  );
  const account = await fetch(`${origin}/account`, {
    headers: { Cookie: user.cookie },
    redirect: "manual",
  });
  assert.equal(account.status, 307);
  assert.ok(account.headers.get("location")?.includes("/school-verification"));
  const forged = await api("email/start", user, {
    schoolId,
    role: "Student",
    universityEmail: `a@${studentDomain}`,
    school_verified: true,
  });
  assert.equal(forged.status, 400);
});

test("multipart ID uploads reject duplicate metadata and unknown fields before storing evidence", async () => {
  const user = await fixture();
  const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#ffffff" } }).png().toBuffer();
  for (const extra of ["role", "school_verified", "document"]) {
    const form = new FormData();
    form.set("schoolId", schoolId); form.set("role", "Student"); form.set("method", "upload");
    form.set("document", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "fixture.png");
    form.append(extra, "unexpected");
    const response = await fetch(`${origin}/api/school/submit-document`, { method: "POST", headers: { Cookie: user.cookie, Origin: origin }, body: form });
    assert.equal(response.status, 400);
  }
  assert.equal((await schoolStatus(user.id)).request, null);
});

test("camera submissions reject PDF evidence and keep school approval unset", async () => {
  const user = await fixture();
  await assert.rejects(submitSchoolDocument(user.id, user.sid, { schoolId, role: "Student" }, "camera", Buffer.from("%PDF-1.4\n%camera rejection fixture\n%%EOF"), "application/pdf"), { status: 400 });
  assert.equal((await schoolStatus(user.id)).request, null);
  assert.equal((await schoolStatus(user.id)).schoolVerified, false);
});
