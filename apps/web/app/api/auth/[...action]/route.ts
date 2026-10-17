import { NextRequest } from "next/server";
import { authHandler } from "../../../../lib/auth/handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string[] }> };
export async function GET(request: NextRequest, context: Context) {
  return authHandler(request, (await context.params).action);
}
export async function POST(request: NextRequest, context: Context) {
  return authHandler(request, (await context.params).action);
}
