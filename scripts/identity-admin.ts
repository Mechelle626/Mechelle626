import { db } from "../apps/web/lib/auth/db";
import { readDocument } from "../apps/web/lib/school/documents";
import { scanWithClamAV } from "../apps/web/lib/school/scanner";
import { z } from "zod";
const [command, id] = process.argv.slice(2);
try {
  if (command !== "scan")
    throw new Error("Usage: npm run identity:admin -- scan <document-id>");
  z.uuid().parse(id);
  const d = (
    await db.query(
      `SELECT * FROM braincraze."VerificationDocuments" WHERE id=$1`,
      [id],
    )
  ).rows[0];
  if (!d) throw new Error("Document not found.");
  let status = "error";
  try {
    status = await scanWithClamAV(
      await readDocument(d.document_key, d.user_id, d.id),
    );
  } finally {
    await db.query(
      `UPDATE braincraze."VerificationDocuments" SET scan_status=$2 WHERE id=$1`,
      [id, status],
    );
    await db.query(
      "INSERT INTO braincraze.identity_review_logs(verification_id,action,notes) VALUES($1,'scan',$2)",
      [d.verification_id, "Operator scan: " + status],
    );
  }
  console.log("Identity document scan: " + status);
} finally {
  await db.end();
}
