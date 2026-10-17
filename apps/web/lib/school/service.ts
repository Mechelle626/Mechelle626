import { sendLocalizedEmail } from "../i18n/email";
import { message as bcText } from "../i18n/source";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { domainToASCII } from "node:url";
import { z } from "zod";
import type { PoolClient } from "pg";
import { db, transaction } from "../auth/db";
import { roles } from "../auth/contracts";
import { AuthError, emailSchema, proof } from "../auth/security";
import { mailConfigured } from "../auth/mail";
import {
  documentsConfigured,
  validateDocument,
  storeDocument,
  removeDocument,
} from "./documents";
import type { SchoolStatus } from "./contracts";

export const selectionSchema = z
  .object({ schoolId: z.uuid(), role: z.enum(roles) })
  .strict();
export const emailRequestSchema = selectionSchema
  .extend({ universityEmail: emailSchema })
  .strict();
export const schoolCodeSchema = z
  .object({
    requestId: z.uuid(),
    code: z.string().regex(/^\d{6}$/, bcText("ui.51361e99c23a7321")),
  })
  .strict();
export function canonicalDomain(value: string) {
  const domain = domainToASCII(value.trim().toLowerCase());
  if (
    domain.length > 253 ||
    !domain.includes(".") ||
    !domain
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    /^\d+(\.\d+){3}$/.test(domain)
  )
    throw new AuthError(400, bcText("ui.02d99eb9dcb9cd96"));
  return domain;
}
export async function lockSchoolUser(
  client: PoolClient,
  userId: string,
  sessionId: string,
) {
  const { rows } = await client.query(
    `SELECT u.* FROM braincraze.users u JOIN braincraze.sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-CASE WHEN s.remember THEN interval '7 days' ELSE interval '30 minutes' END FOR UPDATE OF u,s`,
    [userId, sessionId],
  );
  if (!rows[0]) throw new AuthError(401, bcText("ui.2e1d18330b893e9d"));
  if (rows[0].account_status !== "active") throw new AuthError(403, bcText("ui.d0e81258ed14cd2d"));
  if (!rows[0].email_verified_at)
    throw new AuthError(403, bcText("ui.a1e54d72a61edf4b"));
  if (!rows[0].human_verified)
    throw new AuthError(403, bcText("ui.7c18fdf59eed4020"));
  return rows[0];
}
async function activeSchool(client: PoolClient, schoolId: string) {
  const { rows } = await client.query(
    "SELECT id,name FROM braincraze.schools WHERE id=$1 AND active=true FOR SHARE",
    [schoolId],
  );
  if (!rows[0])
    throw new AuthError(400, bcText("ui.70d0e29888e79799"));
  return rows[0];
}
async function emailPolicy(
  client: PoolClient,
  schoolId: string,
  role: string,
  email: string,
) {
  const domain = canonicalDomain(email.slice(email.lastIndexOf("@") + 1));
  const { rows } = await client.query(
    `SELECT * FROM braincraze.school_email_domains WHERE school_id=$1 AND domain=$2 AND active=true AND $3=ANY(email_roles) FOR SHARE`,
    [schoolId, domain, role],
  );
  if (!rows[0])
    throw new AuthError(
      400,
      bcText("ui.baeff006c8c807c3"),
    );
  return rows[0];
}
async function clearPrevious(client: PoolClient, userId: string) {
  await client.query(
    `UPDATE braincraze.school_verification_requests SET status='superseded',code_hash=NULL,updated_at=clock_timestamp() WHERE user_id=$1 AND status IN ('awaiting_email','pending_review','needs_information','approved')`,
    [userId],
  );
  await client.query(
    "UPDATE braincraze.users SET school_verified=false,verified_school_id=NULL,verified_school_role=NULL,school_verified_at=NULL,updated_at=clock_timestamp() WHERE id=$1",
    [userId],
  );
}
export async function searchSchools(query: string) {
  const { rows } = await db.query(
    `SELECT s.id,s.name,COALESCE((SELECT array_agg(DISTINCT role) FROM braincraze.school_email_domains d CROSS JOIN LATERAL unnest(d.email_roles) AS role WHERE d.school_id=s.id AND d.active),ARRAY[]::text[]) AS "emailRoles" FROM braincraze.schools s WHERE s.active AND strpos(lower(s.name),lower($1))>0 ORDER BY s.name LIMIT 20`,
    [query.slice(0, 100)],
  );
  return rows;
}
export async function schoolStatus(userId: string): Promise<SchoolStatus> {
  const user = await db.query(
    "SELECT u.role,u.school_verified,u.verified_school_role,s.name AS verified_school_name FROM braincraze.users u LEFT JOIN braincraze.schools s ON s.id=u.verified_school_id WHERE u.id=$1",
    [userId],
  );
  if (!user.rows[0]) throw new AuthError(401, bcText("ui.2e1d18330b893e9d"));
  const { rows } = await db.query(
    `SELECT r.id,r.role,r.method,r.status,r.school_id AS "schoolId",s.name AS "schoolName",r.university_email AS "universityEmail",r.code_expires_at AS "codeExpiresAt",r.code_issued_at+interval '60 seconds' AS "resendAvailableAt",5-r.attempts AS "remainingAttempts",r.delivery_status AS "deliveryStatus",r.document_scan_status AS "documentScanStatus",r.reason,r.submitted_at AS "submittedAt" FROM braincraze.school_verification_requests r JOIN braincraze.schools s ON s.id=r.school_id WHERE r.user_id=$1 ORDER BY r.submitted_at DESC,r.id LIMIT 1`,
    [userId],
  );
  const now = await db.query("SELECT clock_timestamp() AS now");
  return {
    schoolVerified: user.rows[0].school_verified,
    verifiedSchool: user.rows[0].school_verified
      ? {
          name: user.rows[0].verified_school_name,
          role: user.rows[0].verified_school_role,
        }
      : null,
    role: user.rows[0].role,
    request: rows[0]
      ? {
          ...rows[0],
          codeExpiresAt: rows[0].codeExpiresAt?.toISOString() ?? null,
          resendAvailableAt: rows[0].resendAvailableAt?.toISOString() ?? null,
          submittedAt: rows[0].submittedAt.toISOString(),
        }
      : null,
    serverNow: now.rows[0].now.toISOString(),
    uploadsConfigured: documentsConfigured(),
    mailMode:
      process.env.MAIL_MODE === "outbox"
        ? "local-outbox"
        : mailConfigured()
          ? "smtp"
          : "unconfigured",
  };
}
async function deliverSchoolCode(
  id: string,
  email: string,
  hash: string,
  code: string,
) {
  try {
    const owner=(await db.query("SELECT user_id FROM braincraze.school_verification_requests WHERE id=$1",[id])).rows[0];
    await sendLocalizedEmail(owner.user_id,email,"school",[code]);
    await db.query(
      "UPDATE braincraze.school_verification_requests SET delivery_status='sent' WHERE id=$1 AND code_hash=$2",
      [id, hash],
    );
    return true;
  } catch {
    await db.query(
      "UPDATE braincraze.school_verification_requests SET delivery_status='failed' WHERE id=$1 AND code_hash=$2",
      [id, hash],
    );
    console.error(
      "School verification email delivery failed. Check mail configuration.",
    );
    return false;
  }
}
export async function startSchoolEmail(
  userId: string,
  sessionId: string,
  input: z.infer<typeof emailRequestSchema>,
) {
  if (!mailConfigured())
    throw new AuthError(503, bcText("ui.96b330e475224023"));
  const id = randomUUID(),
    code = randomInt(100000, 1000000).toString(),
    hash = proof(`school:${id}:${code}`);
  await transaction(async (client) => {
    await lockSchoolUser(client, userId, sessionId);
    await activeSchool(client, input.schoolId);
    const policy = await emailPolicy(
      client,
      input.schoolId,
      input.role,
      input.universityEmail,
    );
    const recent = await client.query(
      `SELECT 1 FROM braincraze.school_verification_requests WHERE user_id=$1 AND code_issued_at>clock_timestamp()-interval '60 seconds' LIMIT 1`,
      [userId],
    );
    if (recent.rowCount)
      throw new AuthError(
        429,
        bcText("ui.c30e47a18d347d84"),
      );
    await clearPrevious(client, userId);
    await client.query(
      `INSERT INTO braincraze.school_verification_requests(id,user_id,school_id,role,method,status,university_email,domain_id,code_hash,code_expires_at,code_issued_at,delivery_status) VALUES($1,$2,$3,$4,'email','awaiting_email',$5,$6,$7,clock_timestamp()+interval '15 minutes',clock_timestamp(),'pending')`,
      [
        id,
        userId,
        input.schoolId,
        input.role,
        input.universityEmail,
        policy.id,
        hash,
      ],
    );
  });
  return {
    emailSent: await deliverSchoolCode(id, input.universityEmail, hash, code),
    verification: await schoolStatus(userId),
  };
}
export async function resendSchoolEmail(
  userId: string,
  sessionId: string,
  id: string,
) {
  if (!mailConfigured())
    throw new AuthError(503, bcText("ui.96b330e475224023"));
  let code = randomInt(100000, 1000000).toString(),
    hash = proof(`school:${id}:${code}`);
  const email = await transaction(async (client) => {
    await lockSchoolUser(client, userId, sessionId);
    const { rows } = await client.query(
      `SELECT *,code_issued_at>clock_timestamp()-interval '60 seconds' AS cooling_down FROM braincraze.school_verification_requests WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [id, userId],
    );
    const row = rows[0];
    if (!row || row.status !== "awaiting_email")
      throw new AuthError(
        400,
        bcText("ui.0641dc00612ae13f"),
      );
    if (row.cooling_down)
      throw new AuthError(
        429,
        bcText("ui.57b9b84d29471ec2"),
      );
    await activeSchool(client, row.school_id);
    await emailPolicy(client, row.school_id, row.role, row.university_email);
    while (row.code_hash === hash) {
      code = randomInt(100000, 1000000).toString();
      hash = proof(`school:${id}:${code}`);
    }
    await client.query(
      `UPDATE braincraze.school_verification_requests SET code_hash=$2,code_expires_at=clock_timestamp()+interval '15 minutes',code_issued_at=clock_timestamp(),attempts=0,delivery_status='pending',updated_at=clock_timestamp() WHERE id=$1`,
      [id, hash],
    );
    return row.university_email as string;
  });
  return {
    emailSent: await deliverSchoolCode(id, email, hash, code),
    verification: await schoolStatus(userId),
  };
}
export async function approve(
  client: PoolClient,
  row: { id: string; user_id: string; school_id: string; role: string },
) {
  const actor=(await client.query("SELECT account_status FROM braincraze.users WHERE id=$1 FOR UPDATE",[row.user_id])).rows[0];
  if(actor?.account_status!=="active")throw new AuthError(403,bcText("ui.d0e81258ed14cd2d"));
  const school = await activeSchool(client, row.school_id);
  await client.query(
    `UPDATE braincraze.school_verification_requests SET status='approved',code_hash=NULL,approved_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,
    [row.id],
  );
  await client.query(
    "UPDATE braincraze.users SET school_verified=true,verified_school_id=$2,verified_school_role=$3,school_verified_at=clock_timestamp(),school=$4,role=$3,updated_at=clock_timestamp() WHERE id=$1",
    [row.user_id, row.school_id, row.role, school.name],
  );
}
export async function confirmSchoolEmail(
  userId: string,
  sessionId: string,
  id: string,
  code: string,
) {
  const outcome = await transaction(async (client) => {
    await lockSchoolUser(client, userId, sessionId);
    const { rows } = await client.query(
      `SELECT *,code_expires_at<=clock_timestamp() AS expired FROM braincraze.school_verification_requests WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [id, userId],
    );
    const row = rows[0];
    if (!row || row.status !== "awaiting_email")
      return "This school email request is invalid or already used.";
    if (row.expired)
      return "This school email code has expired. Request a new one.";
    if (row.attempts >= 5)
      return "Too many incorrect school email codes. Request a new one.";
    if (row.delivery_status !== "sent")
      return "The school verification email has not been sent successfully.";
    await activeSchool(client, row.school_id);
    await emailPolicy(client, row.school_id, row.role, row.university_email);
    const a = Buffer.from(row.code_hash ?? "", "hex"),
      b = Buffer.from(proof(`school:${id}:${code}`), "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await client.query(
        "UPDATE braincraze.school_verification_requests SET attempts=attempts+1 WHERE id=$1",
        [id],
      );
      return "That school email code is incorrect.";
    }
    await approve(client, row);
    return null;
  });
  if (outcome) throw new AuthError(400, outcome);
  return schoolStatus(userId);
}
export async function submitSchoolDocument(
  userId: string,
  sessionId: string,
  input: z.infer<typeof selectionSchema>,
  method: "upload" | "camera",
  bytes: Buffer,
  mime: string,
) {
  if (!documentsConfigured())
    throw new AuthError(503, bcText("ui.b62ac645a3e90b1e"));
  const sanitized = await validateDocument(bytes, mime);
  if (method === "camera" && sanitized.mime !== "image/jpeg")
    throw new AuthError(400, bcText("ui.537a41eee50c53bb"));
  const
    id = randomUUID(),
    key = randomUUID();
  // Bound encryption to account and request so ciphertext cannot be swapped across records.
  await storeDocument(key, userId, id, sanitized.bytes);
  try {
    await transaction(async (client) => {
      await lockSchoolUser(client, userId, sessionId);
      await activeSchool(client, input.schoolId);
      await clearPrevious(client, userId);
      await client.query(
        `INSERT INTO braincraze.school_verification_requests(id,user_id,school_id,role,method,status,document_key,document_mime,document_bytes,document_scan_status) VALUES($1,$2,$3,$4,$5,'pending_review',$6,$7,$8,'pending')`,
        [
          id,
          userId,
          input.schoolId,
          input.role,
          method,
          key,
          sanitized.mime,
          sanitized.bytes.length,
        ],
      );
    });
  } catch (error) {
    await removeDocument(key);
    throw error;
  }
  return schoolStatus(userId);
}
