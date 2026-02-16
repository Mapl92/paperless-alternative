import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readFileFromStorage } from "@/lib/files/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") || "original";

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json(
      { error: "Dokument nicht gefunden" },
      { status: 404 }
    );
  }

  let filePath: string | null = null;
  if (type === "original") filePath = document.originalFile;
  else if (type === "archive") filePath = document.archiveFile;
  else if (type === "thumbnail") filePath = document.thumbnailFile;

  if (!filePath) {
    return NextResponse.json(
      { error: "Datei nicht gefunden" },
      { status: 404 }
    );
  }

  try {
    const buffer = await readFileFromStorage(filePath);
    const contentType = filePath.endsWith(".webp")
      ? "image/webp"
      : filePath.endsWith(".png")
        ? "image/png"
        : "application/pdf";

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition":
          type === "thumbnail"
            ? "inline"
            : `inline; filename*=UTF-8''${encodeURIComponent(document.title)}.pdf`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("File read error:", filePath, error);
    return NextResponse.json(
      { error: "Datei nicht lesbar" },
      { status: 500 }
    );
  }
}
