import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readFileFromStorage, saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";
import { logAuditEvent } from "@/lib/audit";
import { PDFDocument } from "pdf-lib";

const MAX_MERGE_DOCS = 50;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentIds, title, trashOriginals } = body as {
      documentIds: string[];
      title: string;
      trashOriginals?: boolean;
    };

    if (!documentIds?.length || documentIds.length < 2) {
      return NextResponse.json(
        { error: "Mindestens 2 Dokumente zum Zusammenführen erforderlich" },
        { status: 400 }
      );
    }
    if (documentIds.length > MAX_MERGE_DOCS) {
      return NextResponse.json(
        { error: `Maximal ${MAX_MERGE_DOCS} Dokumente pro Zusammenführung erlaubt` },
        { status: 400 }
      );
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: "Titel ist erforderlich" }, { status: 400 });
    }

    // Load source documents in requested order
    const docs = await prisma.document.findMany({
      where: { id: { in: documentIds }, deletedAt: null },
      select: { id: true, title: true, originalFile: true },
    });

    // Preserve the requested order
    const ordered = documentIds
      .map((id) => docs.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined);

    if (ordered.length < 2) {
      return NextResponse.json(
        { error: "Nicht genug gültige Dokumente gefunden" },
        { status: 400 }
      );
    }

    // Merge PDFs
    const mergedPdf = await PDFDocument.create();

    for (const doc of ordered) {
      if (!doc.originalFile) continue;
      const pdfBytes = await readFileFromStorage(doc.originalFile);
      const srcPdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const buffer = Buffer.from(mergedBytes);

    // Save merged file
    const mergedTitle = title.trim();
    const { path, checksum, fileSize } = await saveOriginal(buffer, `${mergedTitle}.pdf`);

    // Create new document record
    const newDoc = await prisma.document.create({
      data: {
        title: mergedTitle,
        originalFile: path,
        fileSize,
        checksum,
        mimeType: "application/pdf",
      },
    });

    // Optionally soft-delete originals
    if (trashOriginals) {
      await prisma.document.updateMany({
        where: { id: { in: ordered.map((d) => d.id) } },
        data: { deletedAt: new Date() },
      });
      for (const doc of ordered) {
        logAuditEvent({
          entityType: "document",
          entityId: doc.id,
          entityTitle: doc.title,
          action: "trash",
          changesSummary: `In Papierkorb nach Zusammenführung zu "${mergedTitle}"`,
          source: "ui",
        });
      }
    }

    // Log new merged document
    logAuditEvent({
      entityType: "document",
      entityId: newDoc.id,
      entityTitle: newDoc.title,
      action: "upload",
      changesSummary: `Erstellt durch Zusammenführen von: ${ordered.map((d) => d.title).join(", ")}`,
      source: "ui",
    });

    // Schedule AI processing
    processDocument(newDoc.id, buffer).catch((err) =>
      console.error(`Merge: processing failed for ${newDoc.id}:`, err)
    );

    return NextResponse.json({ document: { id: newDoc.id, title: newDoc.title } }, { status: 201 });
  } catch (error) {
    console.error("Merge error:", error);
    return NextResponse.json({ error: "Zusammenführen fehlgeschlagen" }, { status: 500 });
  }
}
