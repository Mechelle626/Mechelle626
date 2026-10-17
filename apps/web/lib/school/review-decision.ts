import { message as bcText } from "../i18n/source";
import { transaction } from "../auth/db";
import { AuthError } from "../auth/security";
import { approve } from "./service";
import { db } from "../auth/db";
export async function reviewSchoolRequest(
  id: string,
  decision: "approve" | "reject" | "needs_information",
  reviewer: string,
  reason: string,
) {
  const owner = await db.query(
    "SELECT user_id FROM braincraze.school_verification_requests WHERE id=$1",
    [id],
  );
  if (!owner.rows[0]) throw new AuthError(400, bcText("ui.6eecd04f35f139c6"));
  await transaction(async (client) => {
    await client.query(
      "SELECT id FROM braincraze.users WHERE id=$1 FOR UPDATE",
      [owner.rows[0].user_id],
    );
    const { rows } = await client.query(
      "SELECT * FROM braincraze.school_verification_requests WHERE id=$1 FOR UPDATE",
      [id],
    );
    const row = rows[0];
    if (!row || !["pending_review", "needs_information"].includes(row.status))
      throw new AuthError(
        400,
        bcText("ui.d53d98ff8fef8e93"),
      );
    if (decision === "approve") {
      if (row.document_scan_status !== "clean")
        throw new AuthError(
          400,
          bcText("ui.b29515d8a2b8d403"),
        );
      await approve(client, row);
    } else
      await client.query(
        "UPDATE braincraze.school_verification_requests SET status=$2,updated_at=clock_timestamp() WHERE id=$1",
        [id, decision === "reject" ? "rejected" : "needs_information"],
      );
    await client.query(
      "UPDATE braincraze.school_verification_requests SET reviewer=$2,reason=$3 WHERE id=$1",
      [id, reviewer, reason],
    );
    await client.query(
      "INSERT INTO braincraze.school_review_logs(request_id,reviewer,action,reason) VALUES($1,$2,$3,$4)",
      [id, reviewer, decision, reason],
    );
  });
}
