import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.title !== undefined) data.title = body.title.trim();
    if (body.description !== undefined) data.description = body.description || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.priority !== undefined && [1, 2, 3, 4].includes(body.priority)) {
      data.priority = body.priority;
    }
    if (body.completed !== undefined) {
      data.completed = body.completed;
      data.completedAt = body.completed ? new Date() : null;
    }

    const todo = await prisma.todo.update({
      where: { id },
      data,
      include: {
        document: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(todo);
  } catch (error) {
    console.error("Todo update error:", error);
    return NextResponse.json(
      { error: "Todo konnte nicht aktualisiert werden" },
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
    await prisma.todo.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Todo delete error:", error);
    return NextResponse.json(
      { error: "Todo konnte nicht gelöscht werden" },
      { status: 500 }
    );
  }
}
