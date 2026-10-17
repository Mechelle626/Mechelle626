import { message as bcText } from "../i18n/source";
import { db, transaction } from "../auth/db";
import { AuthError } from "../auth/security";
import { readDocument, type ScanResult } from "./documents";
import { scanWithClamAV } from "./scanner";
// Operational functions are exposed only through CLI tools, never public approval routes.
export async function scanSchoolRequest(
  id: string,
  reviewer: string,
  scanner: (bytes: Buffer) => Promise<ScanResult> = scanWithClamAV,
) {
  const { rows } = await db.query(
    "SELECT * FROM braincraze.school_verification_requests WHERE id=$1 AND status IN ('pending_review','needs_information') AND document_key IS NOT NULL",
    [id],
  );
  const row = rows[0];
  if (!row)
    throw new AuthError(400, bcText("ui.614563e939baf6de"));
  let state: "clean" | "infected" | "error";
  try {
    state = await scanner(
      await readDocument(row.document_key, row.user_id, row.id),
    );
  } catch {
    state = "error";
  }
  await transaction(async (client) => {
    await client.query(
      `UPDATE braincraze.school_verification_requests SET document_scan_status=$2,updated_at=clock_timestamp() WHERE id=$1 AND status IN ('pending_review','needs_information')`,
      [id, state],
    );
    await client.query(
      "INSERT INTO braincraze.school_review_logs(request_id,reviewer,action,reason) VALUES($1,$2,'scan',$3)",
      [id, reviewer, `Document scan: ${state}`],
    );
  });
  if (state === "error")
    throw new AuthError(
      503,
      bcText("ui.e989ddfffc73dc4f"),
    );
  return state;
}
export { reviewSchoolRequest } from "./review-decision";
