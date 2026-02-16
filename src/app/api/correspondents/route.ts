import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const correspondents = await prisma.correspondent.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: true } } },
  });
  return NextResponse.json(correspondents);
}

export async function POST(request: NextRequest) {
  const { name } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
  }
  const correspondent = await prisma.correspondent.create({ data: { name } });
  return NextResponse.json(correspondent, { status: 201 });
}
