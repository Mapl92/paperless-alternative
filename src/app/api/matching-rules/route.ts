import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const rules = await prisma.matchingRule.findMany({
    orderBy: { order: "asc" },
    include: {
      setCorrespondent: { select: { id: true, name: true } },
      setDocumentType: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(rules);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, order, active, matchField, matchOperator, matchValue,
            setCorrespondentId, setDocumentTypeId, addTagIds } = body;

    if (!name?.trim() || !matchField || !matchOperator || !matchValue?.trim()) {
      return NextResponse.json(
        { error: "Name, Feld, Operator und Wert sind erforderlich" },
        { status: 400 }
      );
    }

    const rule = await prisma.matchingRule.create({
      data: {
        name: name.trim(),
        order: typeof order === "number" ? order : 0,
        active: active !== false,
        matchField,
        matchOperator,
        matchValue: matchValue.trim(),
        setCorrespondentId: setCorrespondentId || null,
        setDocumentTypeId: setDocumentTypeId || null,
        addTagIds: Array.isArray(addTagIds) ? addTagIds : [],
      },
      include: {
        setCorrespondent: { select: { id: true, name: true } },
        setDocumentType: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Create matching rule error:", error);
    return NextResponse.json({ error: "Regel konnte nicht erstellt werden" }, { status: 500 });
  }
}
