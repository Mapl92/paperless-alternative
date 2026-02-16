import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceId } = await params;

  try {
    const { targetId } = await request.json();

    if (!targetId) {
      return NextResponse.json(
        { error: "Ziel-Dokumenttyp erforderlich" },
        { status: 400 }
      );
    }

    if (sourceId === targetId) {
      return NextResponse.json(
        { error: "Quell- und Ziel-Dokumenttyp dürfen nicht identisch sein" },
        { status: 400 }
      );
    }

    // Verify both exist
    const [source, target] = await Promise.all([
      prisma.documentType.findUnique({ where: { id: sourceId } }),
      prisma.documentType.findUnique({ where: { id: targetId } }),
    ]);

    if (!source) {
      return NextResponse.json(
        { error: "Quell-Dokumenttyp nicht gefunden" },
        { status: 404 }
      );
    }
    if (!target) {
      return NextResponse.json(
        { error: "Ziel-Dokumenttyp nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      // Move all documents to target type
      prisma.document.updateMany({
        where: { documentTypeId: sourceId },
        data: { documentTypeId: targetId },
      }),
      // Delete source type
      prisma.documentType.delete({ where: { id: sourceId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DocumentType merge error:", error);
    return NextResponse.json(
      { error: "Zusammenführung fehlgeschlagen" },
      { status: 500 }
    );
  }
}
