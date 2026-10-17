import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./lib/auth/session";
import { sessionCookie } from "./lib/auth/security";
export async function proxy(request: NextRequest) {
  const user = await getSession(
    request.cookies.get(sessionCookie())?.value ?? "",
  );
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!user.email_verified_at)
    return NextResponse.redirect(new URL("/verify-email", request.url));
  if (
    !user.human_verified &&
    (request.nextUrl.pathname.startsWith("/account") ||
      request.nextUrl.pathname.startsWith("/school-verification"))
  )
    return NextResponse.redirect(new URL("/human-verification", request.url));
  if (user.onboarding_required && user.identity_verification_status!=="verified" && (request.nextUrl.pathname.startsWith("/account")||request.nextUrl.pathname.startsWith("/school-verification")))
    return NextResponse.redirect(new URL("/identity-verification",request.url));
  if (!user.onboarding_required && !user.school_verified && request.nextUrl.pathname.startsWith("/account"))
    return NextResponse.redirect(new URL("/school-verification", request.url));
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/account/:path*",
    "/human-verification/:path*",
    "/school-verification/:path*",
  ],
};
