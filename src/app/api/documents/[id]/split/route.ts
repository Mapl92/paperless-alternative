import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readFileFromStorage, saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";
import { logAuditEvent } from "@/lib/audit";
import { PDFDocument } from "pdf-lib";

interface SplitRange {
  from: number; // 1-indexed, inclusive
  to: number;   // 1-indexed, inclusive
  title?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { ranges } = body as { ranges: SplitRange[] };

    if (!ranges?.length || ranges.length < 1) {
      return NextResponse.json(
        { error: "Mindestens ein Seitenbereich erforderlich" },
        { status: 400 }
      );
    }

    // Load source document
    const sourceDoc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, originalFile: true, pageCount: true },
    });
    if (!sourceDoc) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }
    if (!sourceDoc.originalFile) {
      return NextResponse.json({ error: "Keine Originaldatei vorhanden" }, { status: 400 });
    }

    const pdfBytes = await readFileFromStorage(sourceDoc.originalFile);
    const srcPdf = await PDFDocument.load(pdfBytes);
    const totalPages = srcPdf.getPageCount();

    // Validate ranges
    for (const range of ranges) {
      if (range.from < 1 || range.to > totalPages || range.from > range.to) {
        return NextResponse.json(
          { error: `Ungültiger Seitenbereich: ${range.from}–${range.to} (Dokument hat ${totalPages} Seiten)` },
          { status: 400 }
        );
      }
    }

    const created: Array<{ id: string; title: string }> = [];

    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const rangeTitle = range.title?.trim() ||
        `${sourceDoc.title} (S. ${range.from}–${range.to})`;

      // Build new PDF for this range
      const newPdf = await PDFDocument.create();
      const pageIndices = Array.from(
        { length: range.to - range.from + 1 },
        (_, k) => range.from - 1 + k  // convert to 0-indexed
      );
      const copiedPages = await newPdf.copyPages(srcPdf, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      const buffer = Buffer.from(newPdfBytes);

      // Save file
      const { path, checksum, fileSize } = await saveOriginal(buffer, `${rangeTitle}.pdf`);

      // Create document record
      const newDoc = await prisma.document.create({
        data: {
          title: rangeTitle,
          originalFile: path,
          fileSize,
          checksum,
          mimeType: "application/pdf",
        },
      });

      // Log
      logAuditEvent({
        entityType: "document",
        entityId: newDoc.id,
        entityTitle: newDoc.title,
        action: "upload",
        changesSummary: `Erstellt durch Aufteilen von "${sourceDoc.title}" (S. ${range.from}–${range.to})`,
        source: "ui",
      });

      // Schedule AI processing (fire-and-forget)
      processDocument(newDoc.id, buffer).catch((err) =>
        console.error(`Split: processing failed for ${newDoc.id}:`, err)
      );

      created.push({ id: newDoc.id, title: newDoc.title });
    }

    // Log split action on source document
    logAuditEvent({
      entityType: "document",
      entityId: id,
      entityTitle: sourceDoc.title,
      action: "update",
      changesSummary: `In ${ranges.length} Teil(e) aufgeteilt`,
      source: "ui",
    });

    return NextResponse.json({ documents: created }, { status: 201 });
  } catch (error) {
    console.error("Split error:", error);
    return NextResponse.json({ error: "Aufteilen fehlgeschlagen" }, { status: 500 });
  }
}
