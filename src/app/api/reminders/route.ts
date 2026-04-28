import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/reminders — list all reminders (optionally filtered)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status"); // "pending" | "dismissed" | "all" (default: all)
  const documentId = searchParams.get("documentId");
  const contractId = searchParams.get("contractId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};

  if (status === "pending") {
    where.dismissed = false;
  } else if (status === "dismissed") {
    where.dismissed = true;
  }

  if (documentId) {
    where.documentId = documentId;
  }
  if (contractId) {
    where.contractId = contractId;
  }

  const [reminders, total] = await Promise.all([
    prisma.reminder.findMany({
      where,
      orderBy: { remindAt: "asc" },
      take: limit,
      skip: offset,
      include: {
        document: { select: { id: true, title: true } },
        contract: { select: { id: true, name: true } },
      },
    }),
    prisma.reminder.count({ where }),
  ]);

  return NextResponse.json({ reminders, total });
}

// POST /api/reminders — create a new reminder
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, note, remindAt, documentId, contractId } = body;

    if (!title || !remindAt) {
      return NextResponse.json(
        { error: "title und remindAt sind erforderlich" },
        { status: 400 }
      );
    }

    const reminder = await prisma.reminder.create({
      data: {
        title: String(title).trim(),
        note: note ? String(note).trim() : null,
        remindAt: new Date(remindAt),
        documentId: documentId ?? null,
        contractId: contractId ?? null,
      },
      include: {
        document: { select: { id: true, title: true } },
        contract: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    console.error("Create reminder error:", error);
    return NextResponse.json(
      { error: "Erinnerung konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}
