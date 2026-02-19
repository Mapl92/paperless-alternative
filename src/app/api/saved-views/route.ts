import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type DatePreset = "today" | "yesterday" | "last7days" | "last30days" | "thisYear";

interface ViewFilters {
  search?: string;
  tagId?: string;
  correspondentId?: string;
  documentTypeId?: string;
  dateField?: "documentDate" | "addedAt";
  datePreset?: DatePreset;
  dateFrom?: string;
  dateTo?: string;
}

function resolveDatePreset(preset: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "last7days": {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "last30days": {
      const f = new Date(now); f.setDate(f.getDate() - 29);
      return { from: startOfDay(f), to: endOfDay(now) };
    }
    case "thisYear":
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
  }
}

function buildWhereFromFilters(filters: ViewFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { deletedAt: null };

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { content: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.tagId) where.tags = { some: { id: filters.tagId } };
  if (filters.correspondentId) where.correspondentId = filters.correspondentId;
  if (filters.documentTypeId) where.documentTypeId = filters.documentTypeId;

  const dateField = filters.dateField ?? "documentDate";
  if (filters.datePreset) {
    const { from, to } = resolveDatePreset(filters.datePreset);
    where[dateField] = { gte: from, lte: to };
  } else if (filters.dateFrom || filters.dateTo) {
    where[dateField] = {};
    if (filters.dateFrom) (where[dateField] as Record<string, unknown>).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where[dateField] as Record<string, unknown>).lte = new Date(filters.dateTo);
  }

  return where;
}

export async function GET() {
  const views = await prisma.savedView.findMany({ orderBy: { name: "asc" } });

  // Count documents matching each view's filters in parallel
  const counts = await Promise.all(
    views.map((v) =>
      prisma.document.count({
        where: buildWhereFromFilters(v.filters as ViewFilters),
      })
    )
  );

  const result = views.map((v, i) => ({ ...v, count: counts[i] }));
  return NextResponse.json(result);
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
