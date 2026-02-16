import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: true } } },
  });
  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  const { name, color } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
  }
  const tag = await prisma.tag.create({
    data: { name, color: color || "#6B7280" },
  });
  return NextResponse.json(tag, { status: 201 });
}
