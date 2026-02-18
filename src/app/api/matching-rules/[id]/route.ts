import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, order, active, matchField, matchOperator, matchValue,
            setCorrespondentId, setDocumentTypeId, addTagIds } = body;

    const rule = await prisma.matchingRule.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(order !== undefined && { order }),
        ...(active !== undefined && { active }),
        ...(matchField !== undefined && { matchField }),
        ...(matchOperator !== undefined && { matchOperator }),
        ...(matchValue !== undefined && { matchValue: matchValue.trim() }),
        setCorrespondentId: setCorrespondentId ?? null,
        setDocumentTypeId: setDocumentTypeId ?? null,
        ...(addTagIds !== undefined && { addTagIds: Array.isArray(addTagIds) ? addTagIds : [] }),
      },
      include: {
        setCorrespondent: { select: { id: true, name: true } },
        setDocumentType: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Update matching rule error:", error);
    return NextResponse.json({ error: "Regel konnte nicht aktualisiert werden" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.matchingRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete matching rule error:", error);
    return NextResponse.json({ error: "Regel konnte nicht gelöscht werden" }, { status: 500 });
  }
}
