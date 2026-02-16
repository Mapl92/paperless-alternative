import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const conversations = await prisma.chatConversation.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      documentScope: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json(conversations);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { documentScope = "all", selectedDocumentIds } = body;

  const conversation = await prisma.chatConversation.create({
    data: {
      documentScope,
      selectedDocumentIds:
        documentScope === "selected" && selectedDocumentIds
          ? JSON.parse(JSON.stringify(selectedDocumentIds))
          : undefined,
    },
  });

  return NextResponse.json(conversation, { status: 201 });
}
