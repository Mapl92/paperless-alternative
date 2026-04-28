import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createContractReminders } from "@/lib/contracts/reminders";
import { serializeContract } from "@/lib/contracts/serialize";

function parseDate(value: unknown) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

const include = {
  correspondent: { select: { id: true, name: true } },
  costs: {
    orderBy: [{ validFrom: "desc" as const }, { createdAt: "desc" as const }],
    include: { sourceDocument: { select: { id: true, title: true } } },
  },
  documents: {
    include: {
      document: {
        select: { id: true, title: true, thumbnailFile: true, documentDate: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  reminders: {
    orderBy: { remindAt: "asc" as const },
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({ where: { id }, include });
  if (!contract) {
    return NextResponse.json({ error: "Vertrag nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json(serializeContract(contract as unknown as Record<string, unknown>));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    for (const key of ["name", "category", "status", "providerName", "contractNumber", "customerNumber", "cancellationPeriod", "renewalInterval", "notes"]) {
      if (body[key] !== undefined) data[key] = body[key] ? String(body[key]).trim() : null;
    }
    if (body.correspondentId !== undefined) data.correspondentId = body.correspondentId || null;
    if (body.startDate !== undefined) data.startDate = parseDate(body.startDate);
    if (body.endDate !== undefined) data.endDate = parseDate(body.endDate);
    if (body.cancellationDeadline !== undefined) data.cancellationDeadline = parseDate(body.cancellationDeadline);

    const contract = await prisma.contract.update({
      where: { id },
      data,
      include,
    });

    await createContractReminders(contract);

    return NextResponse.json(serializeContract(contract as unknown as Record<string, unknown>));
  } catch (error) {
    console.error("Update contract error:", error);
    return NextResponse.json({ error: "Vertrag konnte nicht aktualisiert werden" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.contract.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete contract error:", error);
    return NextResponse.json({ error: "Vertrag konnte nicht gelöscht werden" }, { status: 500 });
  }
}
