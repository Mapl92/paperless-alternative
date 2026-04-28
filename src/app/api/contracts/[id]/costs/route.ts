import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeBillingInterval, parseAmount } from "@/lib/contracts/costs";
import { serializeCost } from "@/lib/contracts/serialize";

function parseDate(value: unknown) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const costs = await prisma.contractCost.findMany({
    where: { contractId: id },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
    include: { sourceDocument: { select: { id: true, title: true } } },
  });
  return NextResponse.json(costs.map((cost) => serializeCost(cost as unknown as Record<string, unknown>)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const amount = parseAmount(body.amount);
    if (amount === null) return NextResponse.json({ error: "Betrag ist erforderlich" }, { status: 400 });

    const cost = await prisma.contractCost.create({
      data: {
        contractId: id,
        amount: new Prisma.Decimal(amount),
        currency: String(body.currency || "EUR").toUpperCase(),
        billingInterval: normalizeBillingInterval(body.billingInterval),
        validFrom: parseDate(body.validFrom) ?? null,
        validTo: parseDate(body.validTo) ?? null,
        sourceDocumentId: body.sourceDocumentId || null,
        note: body.note ? String(body.note).trim() : null,
      },
      include: { sourceDocument: { select: { id: true, title: true } } },
    });

    return NextResponse.json(serializeCost(cost as unknown as Record<string, unknown>), { status: 201 });
  } catch (error) {
    console.error("Create contract cost error:", error);
    return NextResponse.json({ error: "Kosten konnten nicht erstellt werden" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Kosten-ID ist erforderlich" }, { status: 400 });

    const data: Record<string, unknown> = {};
    const amount = body.amount !== undefined ? parseAmount(body.amount) : undefined;
    if (amount !== undefined) {
      if (amount === null) return NextResponse.json({ error: "Ungültiger Betrag" }, { status: 400 });
      data.amount = new Prisma.Decimal(amount);
    }
    if (body.currency !== undefined) data.currency = String(body.currency || "EUR").toUpperCase();
    if (body.billingInterval !== undefined) data.billingInterval = normalizeBillingInterval(body.billingInterval);
    if (body.validFrom !== undefined) data.validFrom = parseDate(body.validFrom);
    if (body.validTo !== undefined) data.validTo = parseDate(body.validTo);
    if (body.sourceDocumentId !== undefined) data.sourceDocumentId = body.sourceDocumentId || null;
    if (body.note !== undefined) data.note = body.note ? String(body.note).trim() : null;

    const cost = await prisma.contractCost.update({
      where: { id: String(body.id) },
      data,
      include: { sourceDocument: { select: { id: true, title: true } } },
    });
    return NextResponse.json(serializeCost(cost as unknown as Record<string, unknown>));
  } catch (error) {
    console.error("Update contract cost error:", error);
    return NextResponse.json({ error: "Kosten konnten nicht aktualisiert werden" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const costId = request.nextUrl.searchParams.get("costId");
  if (!costId) return NextResponse.json({ error: "Kosten-ID ist erforderlich" }, { status: 400 });

  try {
    await prisma.contractCost.delete({ where: { id: costId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete contract cost error:", error);
    return NextResponse.json({ error: "Kosten konnten nicht gelöscht werden" }, { status: 500 });
  }
}
