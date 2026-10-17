import { message as bcText } from "./source";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db, transaction } from "../auth/db";
import { requireUser } from "../auth/session";
import { requireAdmin } from "../platform/access";
import { AuthError } from "../auth/security";
import { rateLimit } from "../auth/rate-limit";
import { json, failure, readJson, originCheck } from "../platform/http";
import {
  listLanguages,
  coverage,
  translationRows,
  saveTranslation,
  assertLocale,
} from "./store";
const statuses = z.enum([
  "Draft",
  "Pending Language Review",
  "Reviewed",
  "Approved",
]);
export async function localizationHandler(
  request: NextRequest,
  parts: string[],
) {
  try {
    const action = parts.join("/");
    if (request.method === "GET" && action === "languages")
      return json({ languages: await listLanguages() });
    if (request.method === "POST") originCheck(request);
    if (action === "reports" && request.method === "POST") {
      const user = await requireUser();
      await rateLimit(`translation-report:${user.id}`, 10, 3600);
      const body = z
        .object({
          language: z.string().max(60),
          key: z.string().min(1).max(2000),
          type: z.enum([
            "Incorrect translation",
            "Missing translation",
            "Poor translation quality",
          ]),
          notes: z.string().trim().min(1).max(2000),
        })
        .strict()
        .parse(await readJson(request));
      const language = await assertLocale(body.language);
      const result = await db.query(
        `INSERT INTO braincraze.translation_reports(user_id,language_id,translation_key,report_type,notes) SELECT $1,l.id,k.translation_key,$4,$5 FROM braincraze.languages l CROSS JOIN braincraze.translation_keys k WHERE l.code=$2 AND k.translation_key=$3 RETURNING id`,
        [user.id, language, body.key, body.type, body.notes],
      );
      if (!result.rowCount)
        throw new AuthError(404, bcText("ui.23a97964a4061ecd"));
      return json({ message: bcText("ui.210bf35cbc826adc") }, 201);
    }
    const actor = await requireAdmin();
    if (request.method === "GET") {
      if (action === "coverage")
        return json({
          coverage: await coverage(),
          languages: await listLanguages(true),
        });
      if (action === "translations") {
        const p = request.nextUrl.searchParams;
        const code = z
          .string()
          .max(60)
          .parse(p.get("language") ?? "en");
        const status = p.get("status") ?? "";
        if (status) statuses.parse(status);
        return json({
          translations: await translationRows(
            code,
            (p.get("q") ?? "").slice(0, 200),
            status,
            p.get("missing") === "true",
            z.coerce
              .number()
              .int()
              .min(1)
              .max(100000)
              .parse(p.get("page") ?? 1),
          ),
        });
      }
      if (action === "reports")
        return json({
          reports: (
            await db.query(
              `SELECT r.id,r.translation_key,r.report_type,r.notes,r.status,r.created_at,l.code,k.english_source FROM braincraze.translation_reports r JOIN braincraze.languages l ON l.id=r.language_id JOIN braincraze.translation_keys k ON k.translation_key=r.translation_key WHERE r.status=$1 ORDER BY r.created_at DESC LIMIT 100`,
              [
                z
                  .enum(["Open", "Resolved", "Dismissed"])
                  .parse(request.nextUrl.searchParams.get("status") ?? "Open"),
              ],
            )
          ).rows,
        });
    }
    if (request.method === "POST") {
      await rateLimit(`localization-admin:${actor.id}`, 120, 60);
      const body = await readJson(request);
      if (action === "translations") {
        const b = z
          .object({
            language: z.string().max(60),
            key: z.string().min(1).max(2000),
            value: z.string().max(12000),
            status: statuses,
            updatedAt: z.string().datetime().nullable(),
          })
          .strict()
          .parse(body);
        await saveTranslation(
          actor.id,
          b.language,
          b.key,
          b.value,
          b.status,
          b.updatedAt,
        );
        return json({ message: bcText("ui.dc060a7fe3a4dd1d") });
      }
      if (action === "languages") {
        const b = z
          .object({
            code: z
              .string()
              .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$/)
              .max(60),
            name: z.string().trim().min(1).max(100),
            nativeName: z.string().trim().min(1).max(100),
            direction: z.enum(["ltr", "rtl"]),
            enabled: z.boolean(),
          })
          .strict()
          .parse(body);
        try {
          b.code = Intl.getCanonicalLocales(b.code)[0];
          new Intl.DateTimeFormat(b.code).format();
        } catch {
          throw new AuthError(400, bcText("ui.67afdba2dde519db"));
        }
        if (b.code === "en" && !b.enabled)
          throw new AuthError(400, bcText("ui.88e7841ef503414d"));
        await transaction(async (c) => {
          await c.query(
            `INSERT INTO braincraze.languages(code,language_name,native_name,direction,enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(code) DO UPDATE SET language_name=$2,native_name=$3,direction=$4,enabled=$5`,
            [b.code, b.name, b.nativeName, b.direction, b.enabled],
          );
          await c.query(
            `INSERT INTO braincraze.translation_audit(actor_id,action,details) VALUES($1,'language.updated',$2)`,
            [actor.id, JSON.stringify(b)],
          );
        });
        return json({ message: bcText("ui.42154791e7743b93") });
      }
      if (action === "reports/review") {
        const b = z
          .object({ id: z.uuid(), status: z.enum(["Resolved", "Dismissed"]) })
          .strict()
          .parse(body);
        await transaction(async (c) => {
          const result = await c.query(
            "UPDATE braincraze.translation_reports SET status=$2,resolved_by=$3,resolved_at=now() WHERE id=$1 AND status='Open' RETURNING id",
            [b.id, b.status, actor.id],
          );
          if (!result.rowCount)
            throw new AuthError(409, bcText("ui.869c2a78ba5454ad"));
          await c.query(
            `INSERT INTO braincraze.translation_audit(actor_id,action,details) VALUES($1,'report.updated',$2)`,
            [actor.id, JSON.stringify(b)],
          );
        });
        return json({ message: bcText("ui.d0f839ae0d9d465a") });
      }
    }
    throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
  } catch (e) {
    return failure(e);
  }
}
