import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Name erforderlich" },
        { status: 400 }
      );
    }

    const documentType = await prisma.documentType.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json(documentType);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Dokumenttyp nicht gefunden" },
        { status: 404 }
      );
    }
    console.error("DocumentType update error:", error);
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
    await prisma.documentType.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Dokumenttyp nicht gefunden" },
        { status: 404 }
      );
    }
    console.error("DocumentType delete error:", error);
    return NextResponse.json(
      { error: "Löschen fehlgeschlagen" },
      { status: 500 }
    );
  }
}
