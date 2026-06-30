import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/projects/[id] — single project with its (non-trashed) document count.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({
    id: project.id,
    name: project.name,
    color: project.color,
    createdAt: project.createdAt,
    documentCount: project._count.documents,
  });
}

/**
 * PATCH /api/projects/[id] — rename / recolor. Body: { name?, color? }.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { name, color } = await request.json();
    const data: { name?: string; color?: string } = {};

    if (name !== undefined) {
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed) {
        return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
      }
      data.name = trimmed;
    }
    if (color !== undefined) data.color = color;

    const project = await prisma.project.update({ where: { id }, data });
    return NextResponse.json({ id: project.id, name: project.name, color: project.color });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code: string }).code;
      if (code === "P2002") {
        return NextResponse.json({ error: "Ein Projekt mit diesem Namen existiert bereits" }, { status: 409 });
      }
      if (code === "P2025") {
        return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
      }
    }
    console.error("Project update error:", error);
    return NextResponse.json({ error: "Projekt konnte nicht aktualisiert werden" }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id] — delete the project.
 * Documents are NEVER deleted: the FK is ON DELETE SET NULL, so member
 * documents simply move back to the general document pool (projectId = null).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
    }
    console.error("Project delete error:", error);
    return NextResponse.json({ error: "Projekt konnte nicht gelöscht werden" }, { status: 500 });
  }
}
