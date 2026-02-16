import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { readFileFromStorage } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const document = await prisma.document.findUnique({ where: { id } });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    if (!document.originalFile) {
      return NextResponse.json(
        { error: "Keine Originaldatei vorhanden" },
        { status: 400 }
      );
    }

    // Reset AI fields before reprocessing
    await prisma.document.update({
      where: { id },
      data: {
        aiProcessed: false,
        aiSummary: null,
        aiExtractedData: Prisma.DbNull,
        content: null,
        tags: { set: [] },
      },
    });

    // Read original PDF and reprocess
    const pdfBuffer = await readFileFromStorage(document.originalFile);
    processDocument(id, Buffer.from(pdfBuffer)).catch((err) =>
      console.error("Reprocess failed:", err)
    );

    return NextResponse.json({ success: true, message: "Verarbeitung gestartet" });
  } catch (error) {
    console.error("Reprocess error:", error);
    return NextResponse.json(
      { error: "Erneute Verarbeitung fehlgeschlagen" },
      { status: 500 }
    );
  }
}
