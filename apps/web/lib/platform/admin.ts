import { message as bcText } from "../i18n/source";
import { z } from "zod";
import { db, transaction } from "../auth/db";
import { AuthError } from "../auth/security";
import { readDocument } from "../school/documents";
import { reviewSchoolRequest } from "../school/review-decision";
import { requireAdmin } from "./access";
export async function pendingVerifications(status: string, page: number) {
  const selected = z
    .enum([
      "pending_review",
      "needs_information",
      "approved",
      "rejected",
      "awaiting_email",
    ])
    .parse(status);
  const { rows } = await db.query(
    `SELECT r.id,u.id AS user_id,u.first_name,u.last_name,u.username,u.account_status,s.name AS school,r.role,r.method,r.submitted_at,r.status,r.document_scan_status
    FROM braincraze.school_verification_requests r JOIN braincraze.users u ON u.id=r.user_id JOIN braincraze.schools s ON s.id=r.school_id
    WHERE r.status=$1 ORDER BY r.submitted_at DESC LIMIT 50 OFFSET $2`,
    [selected, (page - 1) * 50],
  );
  return rows;
}
export async function adminAction(body: unknown) {
  const actor = await requireAdmin();
  const input = z
    .object({
      id: z.uuid(),
      action: z.enum([
        "approve",
        "reject",
        "needs_information",
        "suspend",
        "ban",
        "activate",
      ]),
      reason: z.string().trim().min(5).max(1000),
    })
    .strict()
    .parse(body);
  if (["approve", "reject", "needs_information"].includes(input.action)) {
    const request = (
      await db.query(
        "SELECT user_id FROM braincraze.school_verification_requests WHERE id=$1",
        [input.id],
      )
    ).rows[0];
    if (!request) throw new AuthError(404, bcText("ui.6eecd04f35f139c6"));
    if (request.user_id === actor.id)
      throw new AuthError(403, bcText("ui.e0cc72e4e2c01d0c"));
    await reviewSchoolRequest(
      input.id,
      input.action as "approve" | "reject" | "needs_information",
      actor.id,
      input.reason,
    );
    // The review transaction itself records the decision with the authenticated actor ID.
    return;
  }
  if (input.id === actor.id)
    throw new AuthError(403, bcText("ui.5889b913a0d2ef75"));
  await transaction(async (client) => {
    const target = (
      await client.query(
        "SELECT * FROM braincraze.users WHERE id=$1 FOR UPDATE",
        [input.id],
      )
    ).rows[0];
    if (!target) throw new AuthError(404, bcText("ui.e9b1e0403a1e9dd2"));
    if (target.is_admin)
      throw new AuthError(
        403,
        bcText("ui.de33abc79c199cf8"),
      );
    await client.query(
      "UPDATE braincraze.users SET account_status=$2,updated_at=now() WHERE id=$1",
      [
        input.id,
        input.action === "activate"
          ? "active"
          : input.action === "ban"
            ? "banned"
            : "suspended",
      ],
    );
    await client.query("DELETE FROM braincraze.sessions WHERE user_id=$1", [
      input.id,
    ]);
    await client.query("DELETE FROM braincraze.mfa_logins WHERE user_id=$1", [
      input.id,
    ]);
    await client.query(
      "INSERT INTO braincraze.admin_audit(actor_id,subject_id,action,reason) VALUES($1,$2,$3,$4)",
      [actor.id, input.id, input.action, input.reason],
    );
  });
}
export async function reviewDocument(id: string) {
  const actor = await requireAdmin();
  z.uuid().parse(id);
  const row = (
    await db.query(
      "SELECT * FROM braincraze.school_verification_requests WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!row?.document_key) throw new AuthError(404, bcText("ui.4ee2bebb8a5b3a3a"));
  if (row.user_id === actor.id)
    throw new AuthError(403, bcText("ui.e771abf18b7f020a"));
  if (row.document_scan_status !== "clean")
    throw new AuthError(
      403,
      bcText("ui.506c198811f7d791"),
    );
  const bytes = await readDocument(row.document_key, row.user_id, row.id);
  await db.query(
    "INSERT INTO braincraze.school_review_logs(request_id,reviewer,action,reason) VALUES($1,$2,'view_document','Authenticated administrator opened evidence')",
    [id, actor.id],
  );
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": row.document_mime,
      "Content-Disposition": `attachment; filename="school-id.${row.document_mime === "application/pdf" ? "pdf" : "jpg"}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
