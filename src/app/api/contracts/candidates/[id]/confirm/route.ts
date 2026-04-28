import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeBillingInterval, parseAmount } from "@/lib/contracts/costs";
import { createContractReminders } from "@/lib/contracts/reminders";
import { serializeContract } from "@/lib/contracts/serialize";

function parseDate(value: unknown, fallback?: Date | null) {
  if (value === undefined) return fallback ?? null;
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function text(value: unknown, fallback?: string | null) {
  if (value === undefined) return fallback ?? null;
  const str = String(value ?? "").trim();
  return str || null;
}

const include = {
  correspondent: { select: { id: true, name: true } },
  costs: {
    orderBy: [{ validFrom: "desc" as const }, { createdAt: "desc" as const }],
    include: { sourceDocument: { select: { id: true, title: true } } },
  },
  documents: {
    include: { document: { select: { id: true, title: true, thumbnailFile: true, documentDate: true, createdAt: true } } },
    orderBy: { createdAt: "desc" as const },
  },
  reminders: { orderBy: { remindAt: "asc" as const } },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const candidate = await prisma.contractCandidate.findUnique({
      where: { id },
      include: { document: { select: { correspondentId: true } } },
    });

    if (!candidate) {
      return NextResponse.json({ error: "Vorschlag nicht gefunden" }, { status: 404 });
    }
    if (candidate.status !== "pending") {
      return NextResponse.json({ error: "Vorschlag wurde bereits bearbeitet" }, { status: 400 });
    }

    const input = body.contract ?? body;
    const name = text(input.name, candidate.contractName) ?? "Neuer Vertrag";
    const category = text(input.category, candidate.category) ?? "other";
    const amount = parseAmount(input.amount ?? candidate.amount);
    const contractId = body.contractId ? String(body.contractId) : null;

    const contract = contractId
      ? await prisma.contract.update({
          where: { id: contractId },
          data: {
            updatedAt: new Date(),
            ...(body.updateContract
              ? {
                  name,
                  category,
                  providerName: text(input.providerName, candidate.providerName),
                  contractNumber: text(input.contractNumber, candidate.contractNumber),
                  customerNumber: text(input.customerNumber, candidate.customerNumber),
                  startDate: parseDate(input.startDate, candidate.startDate),
                  endDate: parseDate(input.endDate, candidate.endDate),
                  cancellationDeadline: parseDate(input.cancellationDeadline, candidate.cancellationDeadline),
                  cancellationPeriod: text(input.cancellationPeriod, candidate.cancellationPeriod),
                  renewalInterval: text(input.renewalInterval, candidate.renewalInterval),
                  notes: text(input.notes),
                }
              : {}),
          },
        })
      : await prisma.contract.create({
          data: {
            name,
            category,
            status: "active",
            providerName: text(input.providerName, candidate.providerName),
            correspondentId: input.correspondentId || candidate.document.correspondentId || null,
            contractNumber: text(input.contractNumber, candidate.contractNumber),
            customerNumber: text(input.customerNumber, candidate.customerNumber),
            startDate: parseDate(input.startDate, candidate.startDate),
            endDate: parseDate(input.endDate, candidate.endDate),
            cancellationDeadline: parseDate(input.cancellationDeadline, candidate.cancellationDeadline),
            cancellationPeriod: text(input.cancellationPeriod, candidate.cancellationPeriod),
            renewalInterval: text(input.renewalInterval, candidate.renewalInterval),
            notes: text(input.notes),
          },
        });

    await prisma.contractDocument.upsert({
      where: { contractId_documentId: { contractId: contract.id, documentId: candidate.documentId } },
      update: { role: "source" },
      create: { contractId: contract.id, documentId: candidate.documentId, role: "source" },
    });

    if (amount !== null) {
      await prisma.contractCost.create({
        data: {
          contractId: contract.id,
          amount: new Prisma.Decimal(amount),
          currency: text(input.currency, candidate.currency)?.toUpperCase() ?? "EUR",
          billingInterval: normalizeBillingInterval(input.billingInterval ?? candidate.billingInterval),
          validFrom: parseDate(input.costValidFrom ?? input.startDate, candidate.startDate),
          sourceDocumentId: candidate.documentId,
          note: "Aus KI-Vorschlag übernommen",
        },
      });
    }

    await prisma.contractCandidate.update({
      where: { id },
      data: { status: "confirmed", contractId: contract.id },
    });

    await createContractReminders(contract);

    const fullContract = await prisma.contract.findUnique({
      where: { id: contract.id },
      include,
    });

    return NextResponse.json(serializeContract(fullContract as unknown as Record<string, unknown>));
  } catch (error) {
    console.error("Confirm contract candidate error:", error);
    return NextResponse.json({ error: "Vorschlag konnte nicht bestätigt werden" }, { status: 500 });
  }
}
