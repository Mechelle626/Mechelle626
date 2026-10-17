import { message as bcText } from "../i18n/source";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, transaction } from "../auth/db";
import type { AuthUser } from "../auth/session";
import { AuthError } from "../auth/security";
import {
  documentsConfigured,
  validateDocument,
  storeDocument,
  removeDocument,
  readDocument,
} from "../school/documents";
import { approve } from "../school/service";
import { requireAdmin } from "../platform/access";
import { documentTypes, type IdentityStatus } from "./contracts";
export async function identityStatus(id: string): Promise<IdentityStatus> {
  const u = (
    await db.query(
      "SELECT onboarding_required,email_verified_at,human_verified,identity_verification_status,selfie_verification_status FROM braincraze.users WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!u) throw new AuthError(401, bcText("ui.e30c2ec3ce0121a5"));
  const row = (
    await db.query(
      "SELECT * FROM braincraze.identity_verifications WHERE user_id=$1 AND status<>'superseded' ORDER BY updated_at DESC,id LIMIT 1",
      [id],
    )
  ).rows[0];
  const documents = row
    ? (
        await db.query(
          `SELECT id,document_type AS type,verification_status AS status,scan_status AS "scanStatus",uploaded_at AS "uploadedAt" FROM braincraze."VerificationDocuments" WHERE verification_id=$1 ORDER BY uploaded_at`,
          [row.id],
        )
      ).rows
    : [];
  return {
    checklist: {email:!!u.email_verified_at,human:!!u.human_verified,selfie:documents.some(d=>d.type==="selfie"),document:documents.some(d=>d.type!=="selfie"),scanned:documents.length===2&&documents.every(d=>d.scanStatus==="clean"),approved:u.identity_verification_status==="verified"},
    required: u.onboarding_required,
    status: u.identity_verification_status,
    selfieStatus: u.selfie_verification_status,
    configured: documentsConfigured(),
    request: row
      ? {
          id: row.id,
          status: row.status,
          notes: row.reviewer_notes,
          schoolId: row.school_id,
          institutionName: row.institution_name,
          role: row.role,
          documents,
        }
      : null,
  };
}
export async function submitIdentityDocument(
  user: AuthUser,
  body: { type: string; method: string; requestId?: string },
  data: Buffer,
  mime: string,
) {
  const type = z.enum(documentTypes).parse(body.type),
    method = z.enum(["upload", "camera"]).parse(body.method);
  if (type === "selfie" && method !== "camera")
    throw new AuthError(400, bcText("ui.a51d6d515f63558c"));
  const validated = await validateDocument(data, mime);
  if (
    (type === "selfie" || method === "camera") &&
    validated.mime !== "image/jpeg"
  )
    throw new AuthError(400, bcText("ui.2407a846a47ff688"));
  const docId = randomUUID(),
    key = randomUUID();
  await storeDocument(key, user.id, docId, validated.bytes);
  try {
    await transaction(async (client) => {
      const owner = (
        await client.query(
          `SELECT u.* FROM braincraze.users u JOIN braincraze.sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.id=$2 AND u.account_status='active' AND s.expires_at>now() AND s.last_seen_at>now()-CASE WHEN s.remember THEN interval '7 days' ELSE interval '30 minutes' END FOR UPDATE OF u,s`,
          [user.id, user.session_id],
        )
      ).rows[0];
      if (!owner) throw new AuthError(401, bcText("ui.e30c2ec3ce0121a5"));
      if (!owner.email_verified_at || !owner.human_verified)
        throw new AuthError(
          403,
          bcText("ui.0e60bc0fffc97133"),
        );
      let requestId: string;
      if (type === "selfie") {
        await client.query(
          "UPDATE braincraze.identity_verifications SET status='superseded',updated_at=now() WHERE user_id=$1 AND status<>'superseded'",
          [user.id],
        );
        requestId = randomUUID();
        await client.query(
          "INSERT INTO braincraze.identity_verifications(id,user_id,institution_name,school_id,role) VALUES($1,$2,$3,$4,$5)",
          [
            requestId,
            user.id,
            owner.institution_name ?? owner.school,
            owner.institution_id,
            owner.role,
          ],
        );
        await client.query(
          "UPDATE braincraze.users SET selfie_verification_status='pending_review',identity_verification_status='not_started' WHERE id=$1",
          [user.id],
        );
      } else {
        requestId = z.uuid().parse(body.requestId);
        const request = (
          await client.query(
            "SELECT * FROM braincraze.identity_verifications WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [requestId, user.id],
          )
        ).rows[0];
        if (!request || request.status !== "collecting")
          throw new AuthError(
            409,
            bcText("ui.cc683d82096c97da"),
          );
        const selfie = (
          await client.query(
            `SELECT id FROM braincraze."VerificationDocuments" WHERE verification_id=$1 AND document_type='selfie'`,
            [requestId],
          )
        ).rows[0];
        if (!selfie) throw new AuthError(400, bcText("ui.27781f852a5c1aa6"));
        await client.query(
          "UPDATE braincraze.identity_verifications SET status='pending_review',submitted_at=now(),updated_at=now() WHERE id=$1",
          [requestId],
        );
        await client.query(
          "UPDATE braincraze.users SET identity_verification_status='pending_review',selfie_verification_status='pending_review' WHERE id=$1",
          [user.id],
        );
      }
      await client.query(
        `INSERT INTO braincraze."VerificationDocuments"(id,user_id,verification_id,document_type,document_url,document_key,mime,bytes,capture_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          docId,
          user.id,
          requestId,
          type,
          `private://${key}`,
          key,
          validated.mime,
          validated.bytes.length,
          method,
        ],
      );
    });
  } catch (e) {
    await removeDocument(key);
    throw e;
  }
  return identityStatus(user.id);
}
export async function identityQueue(status: string, page: number) {
  const filter = z
    .enum([
      "pending_review",
      "under_review",
      "verified",
      "additional_information_required",
      "rejected",
    ])
    .parse(status);
  return (
    await db.query(
      `SELECT r.id,r.user_id,u.first_name,u.last_name,u.username,r.institution_name,r.school_id,r.role,r.status,r.submitted_at,r.reviewer_notes,
 EXISTS(SELECT 1 FROM braincraze."VerificationDocuments" d WHERE d.verification_id=r.id AND d.document_type NOT IN ('selfie','institution_id')) AS alternative,
 COALESCE((SELECT json_agg(json_build_object('id',d.id,'type',d.document_type,'scanStatus',d.scan_status,'status',d.verification_status)) FROM braincraze."VerificationDocuments" d WHERE d.verification_id=r.id),'[]') AS documents
 FROM braincraze.identity_verifications r JOIN braincraze.users u ON u.id=r.user_id WHERE r.status=$1 ORDER BY r.submitted_at LIMIT 50 OFFSET $2`,
      [filter, (page - 1) * 50],
    )
  ).rows;
}
export async function reviewIdentity(actor: AuthUser, input: unknown) {
  const v = z
    .object({
      id: z.uuid(),
      decision: z.enum([
        "under_review",
        "verified",
        "additional_information_required",
        "rejected",
      ]),
      notes: z.string().trim().min(5).max(1000),
      approveAffiliation: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  await transaction(async (client) => {
    const owner = (
      await client.query(
        "SELECT user_id FROM braincraze.identity_verifications WHERE id=$1",
        [v.id],
      )
    ).rows[0];
    if (!owner) throw new AuthError(404, bcText("ui.6eecd04f35f139c6"));
    if (owner.user_id === actor.id)
      throw new AuthError(403, bcText("ui.1f96545af958e5c8"));
    const user = (
      await client.query(
        "SELECT * FROM braincraze.users WHERE id=$1 FOR UPDATE",
        [owner.user_id],
      )
    ).rows[0];
    const r = (
      await client.query(
        "SELECT * FROM braincraze.identity_verifications WHERE id=$1 FOR UPDATE",
        [v.id],
      )
    ).rows[0];
    if (
      ![
        "pending_review",
        "under_review",
        "additional_information_required",
      ].includes(r.status)
    )
      throw new AuthError(
        409,
        bcText("ui.e15d745ba9ecb838"),
      );
    const docs = (
      await client.query(
        `SELECT * FROM braincraze."VerificationDocuments" WHERE verification_id=$1 FOR UPDATE`,
        [v.id],
      )
    ).rows;
    if (v.decision === "verified") {
      if (
        user.account_status !== "active" ||
        !user.email_verified_at ||
        !user.human_verified
      )
        throw new AuthError(
          403,
          bcText("ui.108456fa04a3bf97"),
        );
      if (
        docs.length !== 2 ||
        !docs.some((d) => d.document_type === "selfie") ||
        docs.some((d) => d.scan_status !== "clean")
      )
        throw new AuthError(
          400,
          bcText("ui.f94799e840d81967"),
        );
      if (v.approveAffiliation) {
        const id = docs.find((d) => d.document_type === "institution_id");
        if (!id || !r.school_id)
          throw new AuthError(
            400,
            bcText("ui.07b0f5c7f1649163"),
          );
        await client.query(
          "UPDATE braincraze.school_verification_requests SET status='superseded',code_hash=NULL,updated_at=now() WHERE user_id=$1 AND status IN ('awaiting_email','pending_review','needs_information','approved')",
          [r.user_id],
        );
        await client.query(
          `INSERT INTO braincraze.school_verification_requests(id,user_id,school_id,role,method,status,document_key,document_mime,document_bytes,document_scan_status,reviewer,reason) VALUES($1,$2,$3,$4,$5,'pending_review',$6,$7,$8,'clean',$9,$10)`,
          [
            id.id,
            r.user_id,
            r.school_id,
            r.role,
            id.capture_method,
            id.document_key,
            id.mime,
            id.bytes,
            actor.id,
            v.notes,
          ],
        );
        await approve(client, {
          id: id.id,
          user_id: r.user_id,
          school_id: r.school_id,
          role: r.role,
        });
        await client.query(
          "INSERT INTO braincraze.school_review_logs(request_id,reviewer,action,reason) VALUES($1,$2,'approve',$3)",
          [id.id, actor.id, v.notes],
        );
      }
    } else if (v.approveAffiliation)
      throw new AuthError(
        400,
        bcText("ui.303990d96219be51"),
      );
    await client.query(
      "UPDATE braincraze.identity_verifications SET status=$2,reviewer_id=$3,reviewer_notes=$4,reviewed_at=now(),updated_at=now() WHERE id=$1",
      [v.id, v.decision, actor.id, v.notes],
    );
    await client.query(
      `UPDATE braincraze."VerificationDocuments" SET verification_status=$2,reviewer_notes=$3 WHERE verification_id=$1`,
      [v.id, v.decision, v.notes],
    );
    await client.query(
      "UPDATE braincraze.users SET identity_verification_status=$2,selfie_verification_status=$2 WHERE id=$1",
      [r.user_id, v.decision],
    );
    await client.query(
      "INSERT INTO braincraze.identity_review_logs(verification_id,actor_id,action,notes) VALUES($1,$2,$3,$4)",
      [v.id, actor.id, v.decision, v.notes],
    );
  });
}
export async function identityDocument(id: string) {
  const actor = await requireAdmin();
  z.uuid().parse(id);
  const d = (
    await db.query(
      `SELECT * FROM braincraze."VerificationDocuments" WHERE id=$1`,
      [id],
    )
  ).rows[0];
  if (!d) throw new AuthError(404, bcText("ui.4ee2bebb8a5b3a3a"));
  if (d.user_id === actor.id)
    throw new AuthError(403, bcText("ui.1f96545af958e5c8"));
  if (d.scan_status !== "clean")
    throw new AuthError(
      403,
      bcText("ui.d8ed6e701080e4d0"),
    );
  const data = await readDocument(d.document_key, d.user_id, d.id);
  await db.query(
    "INSERT INTO braincraze.identity_review_logs(verification_id,actor_id,action,notes) VALUES($1,$2,'view_document',$3)",
    [d.verification_id, actor.id, `Opened ${d.document_type}`],
  );
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": d.mime,
      "Content-Disposition": `attachment; filename="verification.${d.mime === "application/pdf" ? "pdf" : "jpg"}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
