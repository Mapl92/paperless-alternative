import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteFile } from "@/lib/files/storage";

// #16: Limit bulk operations to prevent DoS via oversized payloads
const MAX_BULK_ITEMS = 500;

interface BulkRequest {
  action: "delete" | "addTags" | "removeTags" | "setCorrespondent" | "setDocumentType";
  documentIds: string[];
  tagIds?: string[];
  correspondentId?: string | null;
  documentTypeId?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body: BulkRequest = await request.json();
    const { action, documentIds, tagIds, correspondentId, documentTypeId } = body;

    if (!documentIds?.length) {
      return NextResponse.json(
        { error: "Keine Dokumente ausgewählt" },
        { status: 400 }
      );
    }

    // #16: Reject oversized batches
    if (documentIds.length > MAX_BULK_ITEMS) {
      return NextResponse.json(
        { error: `Maximal ${MAX_BULK_ITEMS} Dokumente pro Bulk-Operation erlaubt` },
        { status: 400 }
      );
    }

    switch (action) {
      case "delete": {
        const documents = await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, originalFile: true, archiveFile: true, thumbnailFile: true },
        });

        // #11: Delete DB records first — if file deletion fails, data is still consistent
        await prisma.document.deleteMany({
          where: { id: { in: documentIds } },
        });

        // Then delete files (best-effort, orphaned files are preferable to orphaned DB records)
        for (const doc of documents) {
          if (doc.originalFile) await deleteFile(doc.originalFile).catch((err) => console.error(`Failed to delete ${doc.originalFile}:`, err));
          if (doc.archiveFile) await deleteFile(doc.archiveFile).catch((err) => console.error(`Failed to delete ${doc.archiveFile}:`, err));
          if (doc.thumbnailFile) await deleteFile(doc.thumbnailFile).catch((err) => console.error(`Failed to delete ${doc.thumbnailFile}:`, err));
        }

        return NextResponse.json({ success: true, count: documents.length });
      }

      case "addTags": {
        if (!tagIds?.length) {
          return NextResponse.json({ error: "Keine Tags angegeben" }, { status: 400 });
        }

        for (const docId of documentIds) {
          await prisma.document.update({
            where: { id: docId },
            data: {
              tags: {
                connect: tagIds.map((id) => ({ id })),
              },
            },
          });
        }

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "removeTags": {
        if (!tagIds?.length) {
          return NextResponse.json({ error: "Keine Tags angegeben" }, { status: 400 });
        }

        for (const docId of documentIds) {
          await prisma.document.update({
            where: { id: docId },
            data: {
              tags: {
                disconnect: tagIds.map((id) => ({ id })),
              },
            },
          });
        }

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "setCorrespondent": {
        await prisma.document.updateMany({
          where: { id: { in: documentIds } },
          data: { correspondentId: correspondentId || null },
        });

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "setDocumentType": {
        await prisma.document.updateMany({
          where: { id: { in: documentIds } },
          data: { documentTypeId: documentTypeId || null },
        });

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      default:
        return NextResponse.json(
          { error: "Unbekannte Aktion" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Bulk operation error:", error);
    return NextResponse.json(
      { error: "Bulk-Operation fehlgeschlagen" },
      { status: 500 }
    );
  }
}
