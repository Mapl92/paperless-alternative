import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// PATCH /api/reminders/[id] — update (dismiss, edit title/note/remindAt)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { title, note, remindAt, dismissed } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = String(title).trim();
    if (note !== undefined) updateData.note = note ? String(note).trim() : null;
    if (remindAt !== undefined) updateData.remindAt = new Date(remindAt);
    if (dismissed !== undefined) updateData.dismissed = Boolean(dismissed);

    const reminder = await prisma.reminder.update({
      where: { id },
      data: updateData,
      include: {
        document: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    console.error("Update reminder error:", error);
    return NextResponse.json(
      { error: "Erinnerung konnte nicht aktualisiert werden" },
      { status: 500 }
    );
  }
}

// DELETE /api/reminders/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await prisma.reminder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete reminder error:", error);
    return NextResponse.json(
      { error: "Erinnerung konnte nicht gelöscht werden" },
      { status: 500 }
    );
  }
}
