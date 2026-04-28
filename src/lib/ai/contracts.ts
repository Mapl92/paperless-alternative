import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { callOpenRouter } from "./openrouter";
import { getAISettings } from "./settings";
import { normalizeBillingInterval, parseAmount } from "@/lib/contracts/costs";

interface ContractDetection {
  isContract?: boolean;
  confidence?: number;
  contractName?: string | null;
  category?: string | null;
  providerName?: string | null;
  contractNumber?: string | null;
  customerNumber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cancellationDeadline?: string | null;
  cancellationPeriod?: string | null;
  renewalInterval?: string | null;
  amount?: string | number | null;
  currency?: string | null;
  billingInterval?: string | null;
  evidence?: string[];
}

function parseJsonResponse(content: string): ContractDetection {
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();
  return JSON.parse(jsonStr) as ContractDetection;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function clampConfidence(value: unknown) {
  const confidence = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

export async function detectContractCandidate(documentId: string, ocrText: string) {
  const existing = await prisma.contractCandidate.findUnique({
    where: { documentId },
    select: { id: true, status: true },
  });

  if (existing && existing.status !== "pending") {
    return null;
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      correspondent: { select: { name: true } },
    },
  });
  if (!document || !ocrText.trim()) return null;

  const aiSettings = await getAISettings();
  const response = await callOpenRouter(
    [
      {
        role: "system",
        content:
          "Du erkennst ausschließlich Verträge und Abos in deutschen Privatdokumenten. " +
          "Gemeint sind Versicherungen, Mobilfunk, Energie, Streaming, Software und Mitgliedschaften. " +
          "Keine Ausweise, Garantien, Rechnungen ohne Vertragsbezug oder allgemeine Fristen. " +
          "Antworte ausschließlich als JSON.",
      },
      {
        role: "user",
        content: `Analysiere den OCR-Text und gib dieses JSON zurück:
{
  "isContract": true,
  "confidence": 0.0,
  "contractName": "kurzer Name oder null",
  "category": "insurance | mobile | energy | streaming | software | membership | other",
  "providerName": "Anbieter oder null",
  "contractNumber": "Vertragsnummer oder null",
  "customerNumber": "Kundennummer oder null",
  "startDate": "YYYY-MM-DD oder null",
  "endDate": "YYYY-MM-DD oder null",
  "cancellationDeadline": "YYYY-MM-DD oder null",
  "cancellationPeriod": "z.B. 1 Monat oder null",
  "renewalInterval": "z.B. jährlich oder null",
  "amount": "aktueller Betrag als Zahl oder null",
  "currency": "EUR",
  "billingInterval": "monthly | quarterly | yearly | once | unknown",
  "evidence": ["maximal 3 kurze Textstellen"]
}

Dokumenttitel: ${document.title}
Korrespondent: ${document.correspondent?.name ?? "unbekannt"}

OCR:
${ocrText.slice(0, 10000)}`,
      },
    ],
    aiSettings.model,
    "contract-detect"
  );

  const result = parseJsonResponse(response.content);
  const confidence = clampConfidence(result.confidence);
  const isRelevant = Boolean(result.isContract) && confidence >= 0.55;
  const amount = parseAmount(result.amount);
  const providerName = cleanString(result.providerName) ?? document.correspondent?.name ?? null;

  const data = {
    status: isRelevant ? "pending" : "ignored",
    contractName: cleanString(result.contractName) ?? (isRelevant ? document.title : null),
    category: cleanString(result.category) ?? "other",
    providerName,
    contractNumber: cleanString(result.contractNumber),
    customerNumber: cleanString(result.customerNumber),
    startDate: parseDate(result.startDate),
    endDate: parseDate(result.endDate),
    cancellationDeadline: parseDate(result.cancellationDeadline),
    cancellationPeriod: cleanString(result.cancellationPeriod),
    renewalInterval: cleanString(result.renewalInterval),
    amount: amount === null ? null : new Prisma.Decimal(amount),
    currency: cleanString(result.currency)?.toUpperCase() ?? "EUR",
    billingInterval: normalizeBillingInterval(result.billingInterval),
    confidence,
    evidence: Array.isArray(result.evidence) ? result.evidence.slice(0, 3) : [],
    extractedData: JSON.parse(JSON.stringify(result)),
  };

  return prisma.contractCandidate.upsert({
    where: { documentId },
    update: data,
    create: {
      documentId,
      ...data,
    },
  });
}
