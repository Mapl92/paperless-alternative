import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { content } = await request.json();

    if (!content?.trim()) {
      return NextResponse.json(
        { error: "Inhalt erforderlich" },
        { status: 400 }
      );
    }

    const note = await prisma.note.create({
      data: {
        content: content.trim(),
        documentId: id,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error("Note create error:", error);
    return NextResponse.json(
      { error: "Notiz konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const noteId = request.nextUrl.searchParams.get("noteId");

  if (!noteId) {
    return NextResponse.json(
      { error: "noteId erforderlich" },
      { status: 400 }
    );
  }

  try {
    await prisma.note.delete({
      where: { id: noteId, documentId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Note delete error:", error);
    return NextResponse.json(
      { error: "Notiz konnte nicht gelöscht werden" },
      { status: 500 }
    );
  }
}
