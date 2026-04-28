import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { detectContractCandidate } from "@/lib/ai/contracts";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(parseInt(String(body.limit ?? "25")), 1), 100);

    const documents = await prisma.document.findMany({
      where: {
        deletedAt: null,
        aiProcessed: true,
        content: { not: null },
        contractCandidates: { none: {} },
        contractDocuments: { none: {} },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, content: true },
    });

    let pending = 0;
    let ignored = 0;
    const errors: Array<{ documentId: string; error: string }> = [];

    for (const document of documents) {
      try {
        const candidate = await detectContractCandidate(document.id, document.content ?? "");
        if (candidate?.status === "pending") pending++;
        else ignored++;
      } catch (error) {
        errors.push({
          documentId: document.id,
          error: error instanceof Error ? error.message : "Unbekannter Fehler",
        });
      }
    }

    const remaining = await prisma.document.count({
      where: {
        deletedAt: null,
        aiProcessed: true,
        content: { not: null },
        contractCandidates: { none: {} },
        contractDocuments: { none: {} },
      },
    });

    return NextResponse.json({
      scanned: documents.length,
      pending,
      ignored,
      errors,
      remaining,
    });
  } catch (error) {
    console.error("Contract backfill error:", error);
    return NextResponse.json({ error: "Backfill konnte nicht gestartet werden" }, { status: 500 });
  }
}
