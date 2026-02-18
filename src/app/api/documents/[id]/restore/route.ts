import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(
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

    await prisma.document.update({
      where: { id },
      data: { deletedAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Restore error:", error);
    return NextResponse.json(
      { error: "Wiederherstellen fehlgeschlagen" },
      { status: 500 }
    );
  }
}
