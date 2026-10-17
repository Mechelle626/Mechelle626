import {
  reviewSchoolRequest,
  scanSchoolRequest,
} from "../apps/web/lib/school/review";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { db, transaction } from "../apps/web/lib/auth/db";
import { roles } from "../apps/web/lib/auth/contracts";
import { canonicalDomain } from "../apps/web/lib/school/service";
import { readDocument } from "../apps/web/lib/school/documents";
const [operation, arg, arg2, ...options] = process.argv.slice(2);
const option = (name: string) => {
  const i = options.indexOf(name);
  return i >= 0 ? options[i + 1] : undefined;
};
// import FILE --reviewer NAME has only one positional argument; review/document have two.
const all = process.argv.slice(3);
const reviewerIndex = all.indexOf("--reviewer");
try {
  const reviewer = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .parse(reviewerIndex >= 0 ? all[reviewerIndex + 1] : undefined);
  if (operation === "import") {
    const schema = z
      .array(
        z.object({
          name: z.string().trim().min(2).max(160),
          active: z.boolean().default(true),
          domains: z
            .array(
              z.object({
                domain: z.string(),
                emailRoles: z.array(z.enum(roles)).max(5).default([]),
                policyReference: z
                  .url()
                  .refine(
                    (value) => value.startsWith("https://"),
                    "Use an authoritative HTTPS policy reference.",
                  ),
              }),
            )
            .default([]),
        }),
      )
      .min(1)
      .max(1000);
    const input = schema.parse(JSON.parse(await readFile(arg, "utf8")));
    await transaction(async (client) => {
      for (const school of input) {
        const { rows } = await client.query(
          "INSERT INTO braincraze.schools(name,active) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET active=EXCLUDED.active RETURNING id",
          [school.name, school.active],
        );
        for (const rule of school.domains) {
          const domain = canonicalDomain(rule.domain);
          const existing = await client.query(
            "SELECT school_id FROM braincraze.school_email_domains WHERE domain=$1",
            [domain],
          );
          if (existing.rows[0] && existing.rows[0].school_id !== rows[0].id)
            throw new Error(
              "An email domain is already assigned to a different school.",
            );
          await client.query(
            `INSERT INTO braincraze.school_email_domains(school_id,domain,email_roles,policy_reference,reviewed_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(domain) DO UPDATE SET email_roles=EXCLUDED.email_roles,policy_reference=EXCLUDED.policy_reference,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now(),active=true`,
            [
              rows[0].id,
              domain,
              [...new Set(rule.emailRoles)],
              rule.policyReference,
              reviewer,
            ],
          );
        }
      }
    });
    console.log("Reviewed school configuration imported.");
  } else if (operation === "scan") {
    const id = z.uuid().parse(arg);
    console.log("Document scan result:", await scanSchoolRequest(id, reviewer));
  } else if (operation === "review") {
    const id = z.uuid().parse(arg),
      decision = z.enum(["approve", "reject", "needs_information"]).parse(arg2);
    const reason = z.string().trim().min(1).max(500).parse(option("--reason"));
    await reviewSchoolRequest(id, decision, reviewer, reason);
    console.log("School review decision saved.");
  } else if (operation === "document") {
    const id = z.uuid().parse(arg);
    const output = z.string().min(1).parse(arg2);
    const { rows } = await db.query(
      `SELECT * FROM braincraze.school_verification_requests WHERE id=$1 AND document_key IS NOT NULL AND document_scan_status='clean'`,
      [id],
    );
    if (!rows[0])
      throw new Error(
        "A clean-scanned document is required for review export.",
      );
    const row = rows[0];
    await writeFile(
      output,
      await readDocument(row.document_key, row.user_id, row.id),
      { flag: "wx", mode: 0o600 },
    );
    await db.query(
      "INSERT INTO braincraze.school_review_logs(request_id,reviewer,action,reason) VALUES($1,$2,'view_document','Private reviewer export')",
      [id, reviewer],
    );
    console.log("Private review copy written. Remove it after review.");
  } else
    throw new Error(
      "Use import, scan, review, or document. All require --reviewer.",
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "School administration failed.",
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
