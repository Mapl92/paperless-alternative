import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// GET /api/reminders/pending — count + list of due, undismissed reminders (for notification bell)
export async function GET() {
  const now = new Date();

  const reminders = await prisma.reminder.findMany({
    where: {
      dismissed: false,
      remindAt: { lte: now },
    },
    orderBy: { remindAt: "asc" },
    take: 10,
    include: {
      document: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({
    count: reminders.length,
    reminders,
  });
}
