import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const entityType = searchParams.get("entityType");
  const action = searchParams.get("action");
  const entityId = searchParams.get("entityId");

  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (entityId) where.entityId = entityId;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function DELETE() {
  await prisma.auditLog.deleteMany({});
  return NextResponse.json({ success: true });
}
