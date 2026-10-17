import {validationFields} from "../i18n/validation";
import { message as bcText } from "../i18n/source";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { AuthError, appOrigin } from "../auth/security";
import { rateLimit } from "../auth/rate-limit";
import { maxDocumentBytes } from "./contracts";
import {
  searchSchools,
  schoolStatus,
  startSchoolEmail,
  resendSchoolEmail,
  confirmSchoolEmail,
  submitSchoolDocument,
  selectionSchema,
  emailRequestSchema,
  schoolCodeSchema,
} from "./service";
async function bodyBytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, bcText("ui.6e05cc730b7f1690"));
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AuthError(
        413,
        bcText("ui.862bc35613076d9e"),
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export async function schoolHandler(request: NextRequest, parts: string[]) {
  try {
    const action = parts.join("/"),
      user = await requireUser(true, true);
    if (request.method === "GET") {
      if (action === "schools") {
        await rateLimit(`school-search:${user.id}`, 120, 60);
        return json({
          schools: await searchSchools(
            request.nextUrl.searchParams.get("q") ?? "",
          ),
        });
      }
      if (action === "status") return json(await schoolStatus(user.id));
      throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
    }
    if (request.method !== "POST")
      throw new AuthError(405, bcText("ui.5765cf564d4dd7a2"));
    if (request.headers.get("origin") !== appOrigin())
      throw new AuthError(403, bcText("ui.0b1789e68e952de5"));
    if (action === "submit-document") {
      await rateLimit(`school-submit:${user.id}`, 5, 3600);
      if (
        !request.headers.get("content-type")?.startsWith("multipart/form-data;")
      )
        throw new AuthError(415, bcText("ui.50041a52d8924a60"));
      const bytes = await bodyBytes(request, maxDocumentBytes + 65536);
      let form: FormData;
      try {
        form = await new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": request.headers.get("content-type")! },
          body: new Uint8Array(bytes),
        }).formData();
      } catch {
        throw new AuthError(400, bcText("ui.07e54f9ec3c07507"));
      }
      const allowed = ["schoolId", "role", "method", "document"];
      if (Array.from(form.keys()).some(key => !allowed.includes(key)) ||
          allowed.some(key => form.getAll(key).length !== 1))
        throw new AuthError(400, bcText("ui.38ec89a882a79936"));
      const input = selectionSchema.parse({
        schoolId: form.get("schoolId"),
        role: form.get("role"),
      });
      const method = z.enum(["upload", "camera"]).parse(form.get("method"));
      const file = form.get("document");
      if (!(file instanceof File))
        throw new AuthError(400, bcText("ui.1c2944557e4dc232"));
      if (form.getAll("document").length !== 1)
        throw new AuthError(400, bcText("ui.302114cc4af9eec8"));
      const result = await submitSchoolDocument(
        user.id,
        user.session_id,
        input,
        method,
        Buffer.from(await file.arrayBuffer()),
        file.type,
      );
      return json(
        {
          verification: result,
          message:
            bcText("ui.4139d659f584f317"),
        },
        201,
      );
    }
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new AuthError(415, bcText("ui.a164cd2abe96c4c3"));
    const bytes = await bodyBytes(request, 16384);
    let body: unknown;
    try {
      body = JSON.parse(bytes.toString());
    } catch {
      throw new AuthError(400, bcText("ui.677275edb6b61c01"));
    }
    if (action === "email/start") {
      const input = emailRequestSchema.parse(body);
      await rateLimit(`school-submit:${user.id}`, 5, 3600);
      return json(await startSchoolEmail(user.id, user.session_id, input), 201);
    }
    if (action === "email/resend") {
      const { requestId } = z
        .object({ requestId: z.uuid() })
        .strict()
        .parse(body);
      await rateLimit(`school-email-send:${user.id}`, 10, 3600);
      return json(await resendSchoolEmail(user.id, user.session_id, requestId));
    }
    if (action === "email/confirm") {
      const input = schoolCodeSchema.parse(body);
      await rateLimit(`school-email-attempt:${user.id}`, 10, 600);
      return json({
        verification: await confirmSchoolEmail(
          user.id,
          user.session_id,
          input.requestId,
          input.code,
        ),
        message: bcText("ui.f38729b87ccfbb6d"),
      });
    }
    throw new AuthError(404, bcText("ui.9655eebc96749ab6"));
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error:
            bcText("ui.ecccdc4314a00f26"),
          fields: validationFields(error),
        },
        400,
      );
    if (error instanceof AuthError)
      return json({ error: error.message }, error.status);
    if ((error as { code?: string }).code === "23505")
      return json(
        {
          error:
            bcText("ui.b4641a1f87cad2e8"),
        },
        409,
      );
    console.error(
      "School verification request failed.",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      {
        error:
          bcText("ui.998a7a295e9c87f2"),
      },
      503,
    );
  }
}
