import {validationFields} from "../i18n/validation";
import { message as bcText } from "../i18n/source";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appOrigin, AuthError } from "../auth/security";
export const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function bytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthError(400, bcText("ui.6e05cc730b7f1690"));
  const chunks: Uint8Array[] = [];
  let count = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    count += value.length;
    if (count > limit) {
      await reader.cancel();
      throw new AuthError(413, bcText("ui.fb5a64779155dcd2"));
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AuthError(415, bcText("ui.a164cd2abe96c4c3"));
  try {
    return JSON.parse((await bytes(request, 16384)).toString());
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(400, bcText("ui.677275edb6b61c01"));
  }
}
export function originCheck(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    throw new AuthError(403, bcText("ui.0b1789e68e952de5"));
}
export function failure(error: unknown) {
  if (error instanceof AuthError)
    return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        error: bcText("ui.4a3ac9bb1378a7e9"),
        fields: validationFields(error),
      },
      400,
    );
  if ((error as { code?: string }).code === "23505")
    return json({ error: bcText("ui.865689190ea5c6c9") }, 409);
  console.error(
    "Account request failed.",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    { error: bcText("ui.4a1551132acd1842") },
    503,
  );
}
