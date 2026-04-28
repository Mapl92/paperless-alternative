import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { serializeCandidate } from "@/lib/contracts/serialize";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const candidate = await prisma.contractCandidate.update({
      where: { id },
      data: { status: "ignored" },
      include: {
        document: { select: { id: true, title: true } },
      },
    });
    return NextResponse.json(serializeCandidate(candidate as unknown as Record<string, unknown>));
  } catch (error) {
    console.error("Ignore contract candidate error:", error);
    return NextResponse.json({ error: "Vorschlag konnte nicht ignoriert werden" }, { status: 500 });
  }
}
