import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readFileFromStorage } from "@/lib/files/storage";
import archiver from "archiver";
import { PassThrough } from "stream";

export async function POST(request: NextRequest) {
  try {
    const { documentIds } = await request.json();

    if (!documentIds?.length) {
      return NextResponse.json(
        { error: "Keine Dokumente ausgewählt" },
        { status: 400 }
      );
    }

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, title: true, originalFile: true, archiveFile: true },
    });

    if (documents.length === 0) {
      return NextResponse.json(
        { error: "Keine Dokumente gefunden" },
        { status: 404 }
      );
    }

    // Build unique filenames
    const nameCount = new Map<string, number>();
    const entries: Array<{ name: string; filePath: string }> = [];

    for (const doc of documents) {
      const filePath = doc.archiveFile || doc.originalFile;
      if (!filePath) continue;

      const ext = filePath.split(".").pop() || "pdf";
      const baseName = (doc.title || doc.id).replace(/[/\\:*?"<>|]/g, "_");
      const count = nameCount.get(baseName) || 0;
      nameCount.set(baseName, count + 1);
      const fileName = count === 0 ? `${baseName}.${ext}` : `${baseName} (${count}).${ext}`;
      entries.push({ name: fileName, filePath });
    }

    // Create ZIP archive
    const archive = archiver("zip", { zlib: { level: 1 } }); // fast compression for PDFs
    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    for (const entry of entries) {
      try {
        const buffer = await readFileFromStorage(entry.filePath);
        archive.append(buffer, { name: entry.name });
      } catch (err) {
        console.error(`Failed to read file ${entry.filePath}:`, err);
      }
    }

    await archive.finalize();

    // Collect into buffer for NextResponse
    const chunks: Buffer[] = [];
    for await (const chunk of passthrough) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="documind-export.zip"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (error) {
    console.error("ZIP export error:", error);
    return NextResponse.json(
      { error: "ZIP-Export fehlgeschlagen" },
      { status: 500 }
    );
  }
}
