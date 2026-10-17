import { NextRequest } from "next/server";
import { platformHandler } from "../../../../lib/platform/handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ action: string[] }> },
) {
  return platformHandler(request, (await context.params).action);
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string[] }> },
) {
  return platformHandler(request, (await context.params).action);
}
