import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const todos = await prisma.todo.findMany({
      where: { documentId: id },
      orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { priority: "asc" }],
    });

    return NextResponse.json(todos);
  } catch (error) {
    console.error("Document todos error:", error);
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { title, description, dueDate, priority } = body;

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Titel erforderlich" },
        { status: 400 }
      );
    }

    const todo = await prisma.todo.create({
      data: {
        title: title.trim(),
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: [1, 2, 3, 4].includes(priority) ? priority : 4,
        documentId: id,
      },
    });

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error("Document todo create error:", error);
    return NextResponse.json(
      { error: "Todo konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}
