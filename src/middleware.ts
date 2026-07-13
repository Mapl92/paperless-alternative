import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";

// Public pages (no auth) — prefix match
const PUBLIC_PAGES = ["/login", "/sign/"];

// Public API routes, restricted to the methods the public flows actually need.
// Paths ending in "/" are prefix-matched, all others exact. Everything else —
// insbesondere POST /api/signatures/token (Token-Erstellung) und
// PUT /api/settings/branding — requires auth like any other /api route.
const PUBLIC_API: { path: string; methods: string[] }[] = [
  { path: "/api/auth/login", methods: ["POST"] },
  { path: "/api/signatures/token", methods: ["GET", "HEAD"] },
  { path: "/api/signatures/token/complete", methods: ["POST"] },
  { path: "/api/branding/logo", methods: ["GET", "HEAD"] },
  { path: "/api/settings/branding", methods: ["GET", "HEAD"] },
  { path: "/api/share/", methods: ["GET", "HEAD"] },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");

  if (PUBLIC_PAGES.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const publicApi = PUBLIC_API.find((rule) =>
    rule.path.endsWith("/")
      ? pathname.startsWith(rule.path)
      : pathname === rule.path
  );
  if (publicApi && publicApi.methods.includes(request.method)) {
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
