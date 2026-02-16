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
        { error: "Ziel-Korrespondent erforderlich" },
        { status: 400 }
      );
    }

    if (sourceId === targetId) {
      return NextResponse.json(
        { error: "Quell- und Ziel-Korrespondent dürfen nicht identisch sein" },
        { status: 400 }
      );
    }

    // Verify both exist
    const [source, target] = await Promise.all([
      prisma.correspondent.findUnique({ where: { id: sourceId } }),
      prisma.correspondent.findUnique({ where: { id: targetId } }),
    ]);

    if (!source) {
      return NextResponse.json(
        { error: "Quell-Korrespondent nicht gefunden" },
        { status: 404 }
      );
    }
    if (!target) {
      return NextResponse.json(
        { error: "Ziel-Korrespondent nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      // Move all documents to target correspondent
      prisma.document.updateMany({
        where: { correspondentId: sourceId },
        data: { correspondentId: targetId },
      }),
      // Delete source correspondent
      prisma.correspondent.delete({ where: { id: sourceId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Correspondent merge error:", error);
    return NextResponse.json(
      { error: "Zusammenführung fehlgeschlagen" },
      { status: 500 }
    );
  }
}
