import { NextRequest, NextResponse } from "next/server";
import { stat } from "fs/promises";
import { extname } from "path";
import { prisma } from "@/lib/db/prisma";
import { getFullPath, readFileFromStorage } from "@/lib/files/storage";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/tiff": ".tiff",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
};

/** Percent-encoding for the filename* parameter (RFC 5987), stricter than encodeURIComponent. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") || "original";
  const asDownload = request.nextUrl.searchParams.get("download") === "1";

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
    // The stored extension decides the type. An original can be a photo, so
    // fall back to the MIME type recorded at upload, never to "it's a PDF".
    const contentType =
      MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ??
      (type === "original" && document.mimeType ? document.mimeType.toLowerCase() : null) ??
      "application/octet-stream";

    // Archive files and thumbnails are rewritten in place (signing,
    // reprocessing). The browser may keep a copy but has to ask whether it is
    // still current; size and modification time identify the version.
    const info = await stat(getFullPath(filePath));
    const etag = `"${info.size}-${Math.floor(info.mtimeMs)}"`;
    const cacheHeaders = {
      "Cache-Control": "private, no-cache",
      ETag: etag,
    };

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    const buffer = await readFileFromStorage(filePath);

    let disposition = "inline";
    if (type !== "thumbnail") {
      const extension = EXTENSION_BY_MIME[contentType] ?? extname(filePath).toLowerCase();
      const filename = `${document.title}${extension}`;
      disposition =
        `${asDownload ? "attachment" : "inline"}; ` +
        `filename="dokument${extension}"; ` +
        `filename*=UTF-8''${encodeRfc5987(filename)}`;
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        ...cacheHeaders,
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
