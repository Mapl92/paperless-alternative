import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getFullPath } from "@/lib/files/storage";
import { renderPdfPage, getPdfPageCount } from "@/lib/files/pdf-render";
import sharp from "sharp";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const page = request.nextUrl.searchParams.get("page");

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  // Use archive if available (for re-signing), otherwise original
  const filePath = getFullPath(doc.archiveFile || doc.originalFile);

  if (!page) {
    // Return page info
    const pageCount = await getPdfPageCount(filePath);
    return NextResponse.json({ pageCount });
  }

  const pageNum = parseInt(page, 10);
  if (isNaN(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: "Ungültige Seitennummer" }, { status: 400 });
  }

  const pngBuffer = await renderPdfPage(filePath, pageNum, 150);

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache",
    },
  });
}
