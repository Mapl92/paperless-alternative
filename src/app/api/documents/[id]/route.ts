import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteFile } from "@/lib/files/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      tags: true,
      correspondent: true,
      documentType: true,
      notes: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!document) {
    return NextResponse.json(
      { error: "Dokument nicht gefunden" },
      { status: 404 }
    );
  }

  return NextResponse.json(document);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const {
      title,
      correspondentId,
      documentTypeId,
      documentDate,
      tagIds,
    } = body;

    const updateData: Record<string, unknown> = {};

    if (title !== undefined) updateData.title = title;
    if (correspondentId !== undefined)
      updateData.correspondentId = correspondentId;
    if (documentTypeId !== undefined)
      updateData.documentTypeId = documentTypeId;
    if (documentDate !== undefined)
      updateData.documentDate = documentDate ? new Date(documentDate) : null;

    if (tagIds !== undefined) {
      updateData.tags = {
        set: tagIds.map((id: string) => ({ id })),
      };
    }

    const document = await prisma.document.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
        correspondent: true,
        documentType: true,
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json(
      { error: "Aktualisierung fehlgeschlagen" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const document = await prisma.document.findUnique({ where: { id } });
    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Delete files
    if (document.originalFile) await deleteFile(document.originalFile);
    if (document.archiveFile) await deleteFile(document.archiveFile);
    if (document.thumbnailFile) await deleteFile(document.thumbnailFile);

    // Delete document (cascades to notes)
    await prisma.document.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Löschen fehlgeschlagen" },
      { status: 500 }
    );
  }
}
