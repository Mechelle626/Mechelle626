import { message as bcText } from "../i18n/source";
import { loadCatalog } from "../i18n/server";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { Country, State } from "./geography";
import { db } from "../auth/db";
import { getSession, requireUser } from "../auth/session";
import { AuthError, secureCookies } from "../auth/security";
import { rateLimit } from "../auth/rate-limit";
import { bytes, failure, json, originCheck, readJson } from "../platform/http";
import { requireAdmin } from "../platform/access";
import {
  identityStatus,
  submitIdentityDocument,
  identityQueue,
  identityDocument,
  reviewIdentity,
} from "./identity";
import { maxDocumentBytes } from "../school/contracts";
import { enabledLocale, assertLocale } from "../i18n/store";

import {
  residenceSchema,
  validateResidence,
  applyResidence,
} from "./registration";
import { discover, tutorialStatus } from "./discovery";
import { requireIdentity } from "./flow";
export async function onboardingHandler(request: NextRequest, parts: string[]) {
  try {
    const action = parts.join("/");
    if (request.method === "GET" && action === "preferences") {
      const jar = await cookies(),
        language = jar.get("bc_language")?.value;
      return json({
        language: (await enabledLocale(language)) ?? "en",
        region: (jar.get("bc_region")?.value ?? "").slice(0, 160),
      });
    }
    if (request.method === "GET" && action === "messages") {
      const locale = await assertLocale(request.nextUrl.searchParams.get("language"));
      return json(await loadCatalog(locale));
    }
    if (request.method === "GET" && action === "options") {
      await rateLimit("location-options", 500, 60);
      const kind = request.nextUrl.searchParams.get("kind"),
        q = (request.nextUrl.searchParams.get("q") ?? "")
          .slice(0, 160)
          .toLowerCase();
      if (kind === "countries")
        return json({
          options: Country.getAllCountries()
            .filter((x) => x.name.toLowerCase().includes(q))
            .map((x) => ({ code: x.isoCode, name: x.name })),
        });
      if (kind === "regions") {
        const country = request.nextUrl.searchParams.get("country") ?? "";
        return json({
          options: State.getStatesOfCountry(country)
            .filter((x) => x.name.toLowerCase().includes(q))
            .map((x) => ({ code: x.isoCode, name: x.name })),
        });
      }
      if (kind === "institutions")
        return json({
          options: (
            await db.query(
              "SELECT id AS code,name FROM braincraze.schools WHERE active AND strpos(lower(name),$1)>0 ORDER BY name LIMIT 30",
              [q],
            )
          ).rows,
        });
      throw new AuthError(400, bcText("ui.24a42bebbf851d8a"));
    }
    if (request.method === "POST" && action === "preferences") {
      originCheck(request);
      await rateLimit("preferences", 300, 60);
      const input = z
        .object({
          language: z.string().min(2).max(60),
          region: z.string().trim().max(160).optional(),
        })
        .strict()
        .parse(await readJson(request));
      input.language = await assertLocale(input.language);
      const jar = await cookies();
      jar.set("bc_language", input.language, {
        httpOnly: true,
        secure: secureCookies(),
        sameSite: "lax",
        path: "/",
        maxAge: 31536000,
      });
      if (input.region !== undefined)
        jar.set("bc_region", input.region, {
          httpOnly: true,
          secure: secureCookies(),
          sameSite: "lax",
          path: "/",
          maxAge: 31536000,
        });
      const user = await getSession();
      if (user)
        await db.query(
          "UPDATE braincraze.users SET preferred_language=$2 WHERE id=$1",
          [user.id, input.language],
        );
      return json({ message: bcText("ui.60d6766a9e62463a") });
    }
    const user = await requireUser(action !== "discovery");
    if (request.method === "GET") {
      if (action === "identity/status")
        return json(await identityStatus(user.id));
      if (action === "registration")
        return json(
          (
            await db.query(
              "SELECT country,country_code,region,region_code,institution_name,institution_email,preferred_language FROM braincraze.users WHERE id=$1",
              [user.id],
            )
          ).rows[0],
        );
      if (action === "discovery") return json(await discover(user.id));
      if (action === "tutorial") return json(await tutorialStatus(user.id));
      if (action === "admin/identity") {
        await requireAdmin();
        const page = z.coerce
          .number()
          .int()
          .min(1)
          .max(10000)
          .parse(request.nextUrl.searchParams.get("page") ?? 1);
        return json({
          requests: await identityQueue(
            request.nextUrl.searchParams.get("status") ?? "pending_review",
            page,
          ),
        });
      }
      if (parts[0] === "admin" && parts[1] === "document" && parts.length === 3)
        return await identityDocument(parts[2]);
      throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
    }
    if (request.method !== "POST")
      throw new AuthError(405, bcText("ui.5765cf564d4dd7a2"));
    originCheck(request);
    await rateLimit(`onboarding:${user.id}`, 50, 60);
    if (action === "identity/document") {
      await requireUser(true, true);
      await rateLimit(`identity-upload:${user.id}`, 12, 3600);
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.startsWith("multipart/form-data;"))
        throw new AuthError(415, bcText("ui.50041a52d8924a60"));
      const raw = await bytes(request, maxDocumentBytes + 65536);
      let form: FormData;
      try {
        form = await new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: new Uint8Array(raw),
        }).formData();
      } catch {
        throw new AuthError(400, bcText("ui.07e54f9ec3c07507"));
      }
      const allowed = ["type", "method", "requestId", "document"];
      if (
        Array.from(form.keys()).some((k) => !allowed.includes(k)) ||
        ["type", "method", "document"].some(
          (k) => form.getAll(k).length !== 1,
        ) ||
        form.getAll("requestId").length > 1
      )
        throw new AuthError(
          400,
          bcText("ui.9f13e3ee6224867c"),
        );
      const input = z
        .object({
          type: z.string(),
          method: z.string(),
          requestId: z.uuid().optional(),
        })
        .strict()
        .parse({
          type: form.get("type"),
          method: form.get("method"),
          ...(form.has("requestId")
            ? { requestId: form.get("requestId") }
            : {}),
        });
      const file = form.get("document");
      if (!(file instanceof File))
        throw new AuthError(400, bcText("ui.d36cfc290bc3ff91"));
      return json(
        {
          verification: await submitIdentityDocument(
            user,
            input,
            Buffer.from(await file.arrayBuffer()),
            file.type,
          ),
        },
        201,
      );
    }
    const body = await readJson(request);
    if (action === "registration") {
      const input = residenceSchema.parse(body);
      await validateResidence(input);
      await applyResidence(user.id, input);
      return json({ message: bcText("ui.b4a83756000d9977") });
    }
    if (action === "admin/identity/review") {
      const actor = await requireAdmin();
      await reviewIdentity(actor, body);
      return json({ message: bcText("ui.8263170f593805dd") });
    }
    if (action === "tutorial") {
      await requireIdentity(user.id);
      const input = z
        .object({
          step: z.number().int().min(0).max(10),
          status: z.enum(["in_progress", "completed", "skipped"]),
        })
        .strict()
        .parse(body);
      if (input.status === "completed" && input.step !== 10)
        throw new AuthError(
          400,
          bcText("ui.7f53a3710ca3148e"),
        );
      await db.query(
        `INSERT INTO braincraze.onboarding_progress(user_id,tutorial_step,tutorial_status) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET tutorial_step=$2,tutorial_status=$3,updated_at=now()`,
        [user.id, input.step, input.status],
      );
      return json({ message: bcText("ui.0735e63b2d028869") });
    }
    throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
  } catch (e) {
    return failure(e);
  }
}
