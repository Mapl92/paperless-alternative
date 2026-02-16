import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const views = await prisma.savedView.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(views);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, filters, sortField, sortOrder } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }

  const view = await prisma.savedView.create({
    data: {
      name: name.trim(),
      filters: filters ?? {},
      sortField: sortField ?? "createdAt",
      sortOrder: sortOrder ?? "desc",
    },
  });

  return NextResponse.json(view, { status: 201 });
}
