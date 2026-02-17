import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const completed = searchParams.get("completed");
    const sortField = searchParams.get("sortField") || "dueDate";
    const sortOrder = searchParams.get("sortOrder") || "asc";

    const where: Record<string, unknown> = {};
    if (completed === "true") where.completed = true;
    else if (completed === "false") where.completed = false;

    const validSortFields = ["dueDate", "priority", "createdAt"];
    const field = validSortFields.includes(sortField) ? sortField : "dueDate";

    const todos = await prisma.todo.findMany({
      where,
      orderBy: [
        { [field]: sortOrder === "desc" ? "desc" : "asc" },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        document: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(todos);
  } catch (error) {
    console.error("Todos list error:", error);
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, dueDate, priority, documentId } = body;

    if (!title?.trim() || !documentId) {
      return NextResponse.json(
        { error: "Titel und Dokument-ID erforderlich" },
        { status: 400 }
      );
    }

    const todo = await prisma.todo.create({
      data: {
        title: title.trim(),
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: [1, 2, 3, 4].includes(priority) ? priority : 4,
        documentId,
      },
      include: {
        document: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error("Todo create error:", error);
    return NextResponse.json(
      { error: "Todo konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}
