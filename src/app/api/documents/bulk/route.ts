import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteFile } from "@/lib/files/storage";
import { logAuditEvent } from "@/lib/audit";

// #16: Limit bulk operations to prevent DoS via oversized payloads
const MAX_BULK_ITEMS = 500;

interface BulkRequest {
  action: "delete" | "trash" | "restore" | "permanentDelete" | "addTags" | "removeTags" | "setCorrespondent" | "setDocumentType";
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

    const bulkId = crypto.randomUUID();

    switch (action) {
      case "delete":
      case "trash": {
        // Fetch titles before update for audit log
        const docs = await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, title: true },
        });

        // Soft delete — move to trash
        await prisma.document.updateMany({
          where: { id: { in: documentIds } },
          data: { deletedAt: new Date() },
        });

        for (const doc of docs) {
          logAuditEvent({
            entityType: "document",
            entityId: doc.id,
            entityTitle: doc.title,
            action: "bulk",
            changesSummary: "In den Papierkorb verschoben (Bulk)",
            source: "ui",
            bulkId,
          });
        }

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "restore": {
        const docs = await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, title: true },
        });

        await prisma.document.updateMany({
          where: { id: { in: documentIds } },
          data: { deletedAt: null },
        });

        for (const doc of docs) {
          logAuditEvent({
            entityType: "document",
            entityId: doc.id,
            entityTitle: doc.title,
            action: "bulk",
            changesSummary: "Wiederhergestellt (Bulk)",
            source: "ui",
            bulkId,
          });
        }

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "permanentDelete": {
        const documents = await prisma.document.findMany({
          where: { id: { in: documentIds }, deletedAt: { not: null } },
          select: { id: true, title: true, originalFile: true, archiveFile: true, thumbnailFile: true },
        });

        for (const doc of documents) {
          logAuditEvent({
            entityType: "document",
            entityId: doc.id,
            entityTitle: doc.title,
            action: "bulk",
            changesSummary: "Endgültig gelöscht (Bulk)",
            source: "ui",
            bulkId,
          });
        }

        // #11: Delete DB records first — if file deletion fails, data is still consistent
        await prisma.document.deleteMany({
          where: { id: { in: documents.map((d) => d.id) } },
        });

        // Then delete files (best-effort)
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

        const tagNames = await prisma.tag.findMany({
          where: { id: { in: tagIds } },
          select: { name: true },
        });
        const tagSummary = tagNames.map((t) => t.name).join(", ");

        for (const docId of documentIds) {
          await prisma.document.update({
            where: { id: docId },
            data: {
              tags: {
                connect: tagIds.map((id) => ({ id })),
              },
            },
          });
          logAuditEvent({
            entityType: "document",
            entityId: docId,
            action: "bulk",
            changesSummary: `Tags hinzugefügt: ${tagSummary}`,
            source: "ui",
            bulkId,
          });
        }

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "removeTags": {
        if (!tagIds?.length) {
          return NextResponse.json({ error: "Keine Tags angegeben" }, { status: 400 });
        }

        const tagNames = await prisma.tag.findMany({
          where: { id: { in: tagIds } },
          select: { name: true },
        });
        const tagSummary = tagNames.map((t) => t.name).join(", ");

        for (const docId of documentIds) {
          await prisma.document.update({
            where: { id: docId },
            data: {
              tags: {
                disconnect: tagIds.map((id) => ({ id })),
              },
            },
          });
          logAuditEvent({
            entityType: "document",
            entityId: docId,
            action: "bulk",
            changesSummary: `Tags entfernt: ${tagSummary}`,
            source: "ui",
            bulkId,
          });
        }

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "setCorrespondent": {
        const docs = await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, title: true },
        });

        await prisma.document.updateMany({
          where: { id: { in: documentIds } },
          data: { correspondentId: correspondentId || null },
        });

        let corrName = "—";
        if (correspondentId) {
          const corr = await prisma.correspondent.findUnique({ where: { id: correspondentId }, select: { name: true } });
          if (corr) corrName = corr.name;
        }

        for (const doc of docs) {
          logAuditEvent({
            entityType: "document",
            entityId: doc.id,
            entityTitle: doc.title,
            action: "bulk",
            changesSummary: `Korrespondent gesetzt: ${corrName}`,
            source: "ui",
            bulkId,
          });
        }

        return NextResponse.json({ success: true, count: documentIds.length });
      }

      case "setDocumentType": {
        const docs = await prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, title: true },
        });

        await prisma.document.updateMany({
          where: { id: { in: documentIds } },
          data: { documentTypeId: documentTypeId || null },
        });

        let typeName = "—";
        if (documentTypeId) {
          const dtype = await prisma.documentType.findUnique({ where: { id: documentTypeId }, select: { name: true } });
          if (dtype) typeName = dtype.name;
        }

        for (const doc of docs) {
          logAuditEvent({
            entityType: "document",
            entityId: doc.id,
            entityTitle: doc.title,
            action: "bulk",
            changesSummary: `Dokumenttyp gesetzt: ${typeName}`,
            source: "ui",
            bulkId,
          });
        }

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
