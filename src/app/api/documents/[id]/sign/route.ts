import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getFullPath, readFileFromStorage, saveArchive } from "@/lib/files/storage";
import { PDFDocument } from "pdf-lib";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { signatureId, page, x, y, width, height } = await request.json();

  // Validate input
  if (!signatureId || !page || x == null || y == null || !width || !height) {
    return NextResponse.json({ error: "Fehlende Parameter" }, { status: 400 });
  }

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
  }

  const signature = await prisma.signature.findUnique({
    where: { id: signatureId },
  });
  if (!signature) {
    return NextResponse.json({ error: "Unterschrift nicht gefunden" }, { status: 404 });
  }

  // Load PDF (archive if exists for re-signing, otherwise original)
  const pdfSource = doc.archiveFile || doc.originalFile;
  const pdfBuffer = await readFileFromStorage(pdfSource);
  const sigBuffer = await readFileFromStorage(signature.imageFile);

  // Use pdf-lib to embed signature
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pngImage = await pdfDoc.embedPng(sigBuffer);

  const pdfPage = pdfDoc.getPage(page - 1);
  const pageWidth = pdfPage.getWidth();
  const pageHeight = pdfPage.getHeight();

  // Convert fractional coordinates (top-left origin) to PDF coordinates (bottom-left origin)
  const sigWidth = width * pageWidth;
  const sigHeight = height * pageHeight;
  const sigX = x * pageWidth;
  const sigY = pageHeight - (y + height) * pageHeight; // flip Y

  pdfPage.drawImage(pngImage, {
    x: sigX,
    y: sigY,
    width: sigWidth,
    height: sigHeight,
  });

  const signedPdfBytes = await pdfDoc.save();
  const signedBuffer = Buffer.from(signedPdfBytes);

  // Save as archive
  const archivePath = await saveArchive(signedBuffer, id);

  // Update document
  await prisma.document.update({
    where: { id },
    data: { archiveFile: archivePath },
  });

  return NextResponse.json({ success: true, archiveFile: archivePath });
}
