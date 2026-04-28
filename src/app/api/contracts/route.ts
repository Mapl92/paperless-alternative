import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parseAmount, normalizeBillingInterval, costToMonthly, costToYearly } from "@/lib/contracts/costs";
import { createContractReminders } from "@/lib/contracts/reminders";
import { serializeContract } from "@/lib/contracts/serialize";

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function contractInclude() {
  return {
    correspondent: { select: { id: true, name: true } },
    costs: {
      orderBy: [{ validFrom: "desc" as const }, { createdAt: "desc" as const }],
      include: { sourceDocument: { select: { id: true, title: true } } },
    },
    documents: {
      include: {
        document: {
          select: {
            id: true,
            title: true,
            thumbnailFile: true,
            documentDate: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" as const },
    },
    reminders: {
      where: { dismissed: false },
      orderBy: { remindAt: "asc" as const },
      take: 5,
    },
  };
}

async function buildStats() {
  const [activeCount, pendingCandidates, activeContracts] = await Promise.all([
    prisma.contract.count({ where: { status: "active" } }),
    prisma.contractCandidate.count({ where: { status: "pending" } }),
    prisma.contract.findMany({
      where: { status: "active" },
      select: {
        cancellationDeadline: true,
        endDate: true,
        costs: {
          orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { amount: true, billingInterval: true },
        },
      },
    }),
  ]);

  const now = Date.now();
  const soonLimit = now + 90 * 24 * 60 * 60 * 1000;
  let monthlyTotal = 0;
  let yearlyTotal = 0;
  let cancellableSoon = 0;

  for (const contract of activeContracts) {
    const date = contract.cancellationDeadline ?? contract.endDate;
    if (date && date.getTime() >= now && date.getTime() <= soonLimit) cancellableSoon++;
    const cost = contract.costs[0];
    if (cost) {
      const amount = Number(cost.amount);
      monthlyTotal += costToMonthly(amount, cost.billingInterval);
      yearlyTotal += costToYearly(amount, cost.billingInterval);
    }
  }

  return { activeCount, pendingCandidates, cancellableSoon, monthlyTotal, yearlyTotal };
}

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "active";
  const where =
    status === "all"
      ? {}
      : status === "archive"
        ? { status: { in: ["archived", "cancelled", "expired"] } }
        : { status };

  const [contracts, stats] = await Promise.all([
    prisma.contract.findMany({
      where,
      orderBy: [{ cancellationDeadline: "asc" }, { endDate: "asc" }, { createdAt: "desc" }],
      include: contractInclude(),
    }),
    buildStats(),
  ]);

  return NextResponse.json({
    contracts: contracts.map((contract) => serializeContract(contract as unknown as Record<string, unknown>)),
    stats,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const amount = parseAmount(body.amount);

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    }

    const contract = await prisma.contract.create({
      data: {
        name: String(body.name).trim(),
        category: String(body.category || "other"),
        status: String(body.status || "active"),
        providerName: body.providerName ? String(body.providerName).trim() : null,
        correspondentId: body.correspondentId || null,
        contractNumber: body.contractNumber ? String(body.contractNumber).trim() : null,
        customerNumber: body.customerNumber ? String(body.customerNumber).trim() : null,
        startDate: parseDate(body.startDate),
        endDate: parseDate(body.endDate),
        cancellationDeadline: parseDate(body.cancellationDeadline),
        cancellationPeriod: body.cancellationPeriod ? String(body.cancellationPeriod).trim() : null,
        renewalInterval: body.renewalInterval ? String(body.renewalInterval).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        costs: amount !== null ? {
          create: {
            amount: new Prisma.Decimal(amount),
            currency: String(body.currency || "EUR").toUpperCase(),
            billingInterval: normalizeBillingInterval(body.billingInterval),
            validFrom: parseDate(body.costValidFrom) ?? parseDate(body.startDate),
            note: body.costNote ? String(body.costNote).trim() : null,
          },
        } : undefined,
      },
      include: contractInclude(),
    });

    await createContractReminders(contract);

    return NextResponse.json(serializeContract(contract as unknown as Record<string, unknown>), { status: 201 });
  } catch (error) {
    console.error("Create contract error:", error);
    return NextResponse.json({ error: "Vertrag konnte nicht erstellt werden" }, { status: 500 });
  }
}
