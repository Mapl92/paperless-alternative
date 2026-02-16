import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, filters, sortField, sortOrder } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name.trim();
  if (filters !== undefined) data.filters = filters;
  if (sortField !== undefined) data.sortField = sortField;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  const view = await prisma.savedView.update({
    where: { id },
    data,
  });

  return NextResponse.json(view);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.savedView.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
