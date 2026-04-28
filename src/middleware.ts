import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/sign",
  "/api/signatures/token",
  "/api/branding",
  "/api/settings/branding",
  "/api/share/",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow Next.js internals (static assets are already excluded by the matcher config)
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Bearer-token auth — for trusted external clients (e.g. NotchConverter Mac app).
  // Only valid on /api routes and only when API_TOKEN is configured.
  if (isApiRoute) {
    const authHeader =
      request.headers.get("authorization") ??
      request.headers.get("Authorization");

    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const presented = authHeader.slice(7).trim();
      const expected = process.env.API_TOKEN?.trim();

      if (expected && presented && timingSafeEqual(presented, expected)) {
        return NextResponse.next();
      }
    }
  }

  // Cookie-session auth (browser flow)
  const sessionToken = request.cookies.get("documind-session")?.value;
  if (sessionToken && (await verifySession(sessionToken))) {
    return NextResponse.next();
  }

  // Auth failed
  if (isApiRoute) {
    // API consumers expect JSON, not an HTML redirect to /login.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  if (sessionToken) response.cookies.delete("documind-session");
  return response;
}

// Constant-time string comparison to avoid timing attacks on token check.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
