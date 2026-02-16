import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const types = await prisma.documentType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: true } } },
  });
  return NextResponse.json(types);
}

export async function POST(request: NextRequest) {
  const { name } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
  }
  const type = await prisma.documentType.create({ data: { name } });
  return NextResponse.json(type, { status: 201 });
}
