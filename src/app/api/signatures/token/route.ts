import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { randomBytes } from "crypto";

// #7: Rate-limit public token validation to prevent brute-force
const tokenValidationAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 20;
const WINDOW_MS = 60 * 1000; // 20 attempts per minute per IP

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = tokenValidationAttempts.get(ip);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string): void {
  const now = Date.now();
  const entry = tokenValidationAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    tokenValidationAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

// POST (authenticated): Create a new signing token
export async function POST(request: NextRequest) {
  const { name } = await request.json();

  if (!name) {
    return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
  }

  // #7: Generate a cryptographically secure token (256 bit) instead of UUID v4 (~122 bit)
  const secureToken = randomBytes(32).toString("hex");

  const token = await prisma.signingToken.create({
    data: {
      token: secureToken,
      name,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    },
  });

  const host = request.headers.get("host") || request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const url = `${protocol}://${host}/sign/${token.token}`;

  return NextResponse.json({ token: token.token, url, id: token.id }, { status: 201 });
}

// GET (public): Validate a token
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return NextResponse.json({ valid: false, reason: "rate_limited" }, { status: 429 });
  }
  recordAttempt(ip);

  const tokenValue = request.nextUrl.searchParams.get("token");

  if (!tokenValue) {
    return NextResponse.json({ error: "Token erforderlich" }, { status: 400 });
  }

  const token = await prisma.signingToken.findUnique({
    where: { token: tokenValue },
  });

  if (!token) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }

  if (token.usedAt) {
    return NextResponse.json({ valid: false, reason: "used" });
  }

  if (token.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }

  return NextResponse.json({ valid: true, name: token.name });
}
