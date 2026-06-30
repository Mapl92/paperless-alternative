import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/projects — list all projects with their (non-trashed) document count.
 * Used by the sidebar "Projekte" mode and the /projects index page.
 */
export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { documents: { where: { deletedAt: null } } } },
    },
  });

  return NextResponse.json(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      createdAt: p.createdAt,
      documentCount: p._count.documents,
    }))
  );
}

/**
 * POST /api/projects — create a new project. Body: { name, color? }.
 */
export async function POST(request: NextRequest) {
  try {
    const { name, color } = await request.json();
    const trimmed = typeof name === "string" ? name.trim() : "";

    if (!trimmed) {
      return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: { name: trimmed, color: color || "#6B7280" },
    });

    return NextResponse.json(
      { id: project.id, name: project.name, color: project.color, createdAt: project.createdAt, documentCount: 0 },
      { status: 201 }
    );
  } catch (error) {
    // Unique constraint violation on name
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Ein Projekt mit diesem Namen existiert bereits" }, { status: 409 });
    }
    console.error("Project create error:", error);
    return NextResponse.json({ error: "Projekt konnte nicht erstellt werden" }, { status: 500 });
  }
}
