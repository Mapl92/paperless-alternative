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
        { error: "Ziel-Tag erforderlich" },
        { status: 400 }
      );
    }

    if (sourceId === targetId) {
      return NextResponse.json(
        { error: "Quell- und Ziel-Tag dürfen nicht identisch sein" },
        { status: 400 }
      );
    }

    // Verify both tags exist
    const [source, target] = await Promise.all([
      prisma.tag.findUnique({
        where: { id: sourceId },
        include: { documents: { select: { id: true } } },
      }),
      prisma.tag.findUnique({
        where: { id: targetId },
        include: { documents: { select: { id: true } } },
      }),
    ]);

    if (!source) {
      return NextResponse.json(
        { error: "Quell-Tag nicht gefunden" },
        { status: 404 }
      );
    }
    if (!target) {
      return NextResponse.json(
        { error: "Ziel-Tag nicht gefunden" },
        { status: 404 }
      );
    }

    // Find documents that have the source tag but not the target tag
    const targetDocIds = new Set(target.documents.map((d) => d.id));
    const docsToConnect = source.documents
      .filter((d) => !targetDocIds.has(d.id))
      .map((d) => ({ id: d.id }));

    await prisma.$transaction([
      // Connect documents to target tag
      ...(docsToConnect.length > 0
        ? [
            prisma.tag.update({
              where: { id: targetId },
              data: { documents: { connect: docsToConnect } },
            }),
          ]
        : []),
      // Delete source tag (removes m2m entries automatically)
      prisma.tag.delete({ where: { id: sourceId } }),
    ]);

    return NextResponse.json({ success: true, merged: source.documents.length });
  } catch (error) {
    console.error("Tag merge error:", error);
    return NextResponse.json(
      { error: "Zusammenführung fehlgeschlagen" },
      { status: 500 }
    );
  }
}
