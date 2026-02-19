import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logAuditEvent } from "@/lib/audit";

/**
 * GET /api/documents/[id]/relations — all relations for a document (both directions)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const [asSource, asTarget] = await Promise.all([
      prisma.documentRelation.findMany({
        where: { sourceDocumentId: id },
        include: {
          targetDocument: {
            select: {
              id: true,
              title: true,
              thumbnailFile: true,
              correspondent: { select: { name: true } },
              documentType: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.documentRelation.findMany({
        where: { targetDocumentId: id },
        include: {
          sourceDocument: {
            select: {
              id: true,
              title: true,
              thumbnailFile: true,
              correspondent: { select: { name: true } },
              documentType: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Normalize: always return the "other" document
    const relations = [
      ...asSource.map((r) => ({
        id: r.id,
        type: r.type,
        createdAt: r.createdAt,
        document: r.targetDocument,
      })),
      ...asTarget.map((r) => ({
        id: r.id,
        type: r.type,
        createdAt: r.createdAt,
        document: r.sourceDocument,
      })),
    ];

    return NextResponse.json(relations);
  } catch (error) {
    console.error("Failed to fetch relations:", error);
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

/**
 * POST /api/documents/[id]/relations — create a relation
 * Body: { targetDocumentId: string, type?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { targetDocumentId, type = "related" } = body;

    if (!targetDocumentId || targetDocumentId === id) {
      return NextResponse.json(
        { error: "Ungültige Ziel-Dokument-ID" },
        { status: 400 }
      );
    }

    // Normalize: smaller ID = source to prevent A↔B duplicates
    const [sourceId, targetId] =
      id < targetDocumentId ? [id, targetDocumentId] : [targetDocumentId, id];

    const relation = await prisma.documentRelation.create({
      data: {
        sourceDocumentId: sourceId,
        targetDocumentId: targetId,
        type,
      },
      include: {
        sourceDocument: {
          select: { id: true, title: true, thumbnailFile: true, correspondent: { select: { name: true } }, documentType: { select: { name: true } } },
        },
        targetDocument: {
          select: { id: true, title: true, thumbnailFile: true, correspondent: { select: { name: true } }, documentType: { select: { name: true } } },
        },
      },
    });

    // Audit log for both documents
    const otherDoc = relation.sourceDocumentId === id
      ? relation.targetDocument
      : relation.sourceDocument;

    logAuditEvent({
      entityType: "document",
      entityId: id,
      action: "update",
      changesSummary: `Verknüpfung erstellt mit "${otherDoc.title}" (${type})`,
    });
    logAuditEvent({
      entityType: "document",
      entityId: otherDoc.id,
      action: "update",
      changesSummary: `Verknüpfung erstellt mit "${relation.sourceDocumentId === id ? relation.sourceDocument.title : relation.targetDocument.title}" (${type})`,
    });

    // Return normalized
    return NextResponse.json({
      id: relation.id,
      type: relation.type,
      createdAt: relation.createdAt,
      document: otherDoc,
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Verknüpfung existiert bereits" },
        { status: 409 }
      );
    }
    console.error("Failed to create relation:", error);
    return NextResponse.json({ error: "Fehler beim Erstellen" }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/[id]/relations?relationId=x — remove a relation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const relationId = request.nextUrl.searchParams.get("relationId");

  if (!relationId) {
    return NextResponse.json({ error: "relationId fehlt" }, { status: 400 });
  }

  try {
    const relation = await prisma.documentRelation.findUnique({
      where: { id: relationId },
      include: {
        sourceDocument: { select: { id: true, title: true } },
        targetDocument: { select: { id: true, title: true } },
      },
    });

    if (!relation) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    // Ensure the document is part of the relation
    if (relation.sourceDocumentId !== id && relation.targetDocumentId !== id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
    }

    await prisma.documentRelation.delete({ where: { id: relationId } });

    const otherDoc =
      relation.sourceDocumentId === id
        ? relation.targetDocument
        : relation.sourceDocument;

    logAuditEvent({
      entityType: "document",
      entityId: id,
      action: "update",
      changesSummary: `Verknüpfung entfernt mit "${otherDoc.title}"`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete relation:", error);
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}
