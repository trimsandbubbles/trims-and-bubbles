import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Next.js 16 renamed Middleware to Proxy (same mechanics, see AGENTS.md).
 *
 * IMPORTANT: this is an OPTIMISTIC, UX-only check — it only confirms a session
 * cookie is present, not that it's valid or what role it belongs to (Proxy
 * shouldn't do slow data/DB fetching). It stops a logged-out visitor from ever
 * seeing a flash of /portal or /admin, but it is NOT the real security
 * boundary: Server Actions are invoked as direct POSTs and can bypass this
 * matcher entirely, so every Server Action / Route Handler touching client,
 * pet, appointment, or payment data must independently call
 * requireSession()/requireStaffOrOwner()/requireOwner() from src/lib/session.ts.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  const isAdminLogin = pathname === "/admin/login";
  const isAdminRoute = pathname.startsWith("/admin") && !isAdminLogin;
  const isPortalRoute = pathname.startsWith("/portal");

  if ((isAdminRoute || isPortalRoute) && !sessionCookie) {
    const loginPath = isAdminRoute ? "/admin/login" : "/login";
    const url = new URL(loginPath, request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*"],
};
