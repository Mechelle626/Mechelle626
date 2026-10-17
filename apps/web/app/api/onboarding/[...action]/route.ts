import { NextRequest } from "next/server";
import { onboardingHandler } from "../../../../lib/onboarding/handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  r: NextRequest,
  c: { params: Promise<{ action: string[] }> },
) {
  return onboardingHandler(r, (await c.params).action);
}
export async function POST(
  r: NextRequest,
  c: { params: Promise<{ action: string[] }> },
) {
  return onboardingHandler(r, (await c.params).action);
}
