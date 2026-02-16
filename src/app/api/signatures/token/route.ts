import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// POST (authenticated): Create a new signing token
export async function POST(request: NextRequest) {
  const { name } = await request.json();

  if (!name) {
    return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
  }

  const token = await prisma.signingToken.create({
    data: {
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
