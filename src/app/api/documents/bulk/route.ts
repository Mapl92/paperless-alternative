import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteFile } from "@/lib/files/storage";

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

    switch (action) {
      case "delete": {
        const documents = await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, originalFile: true, archiveFile: true, thumbnailFile: true },
        });

        for (const doc of documents) {
          if (doc.originalFile) await deleteFile(doc.originalFile);
          if (doc.archiveFile) await deleteFile(doc.archiveFile);
          if (doc.thumbnailFile) await deleteFile(doc.thumbnailFile);
        }

        await prisma.document.deleteMany({
          where: { id: { in: documentIds } },
        });

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
