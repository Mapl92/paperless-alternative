import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const conversation = await prisma.chatConversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  // Collect all referenced document IDs from assistant messages
  const allDocIds = new Set<string>();
  for (const msg of conversation.messages) {
    if (msg.role === "assistant" && Array.isArray(msg.referencedDocumentIds)) {
      for (const docId of msg.referencedDocumentIds as string[]) {
        allDocIds.add(docId);
      }
    }
  }

  // Fetch document details (thumbnail, title, correspondent) in one query
  let docMap = new Map<string, { id: string; title: string; thumbnailFile: string | null; correspondent: { name: string } | null }>();
  if (allDocIds.size > 0) {
    const docs = await prisma.document.findMany({
      where: { id: { in: Array.from(allDocIds) } },
      select: {
        id: true,
        title: true,
        thumbnailFile: true,
        correspondent: { select: { name: true } },
      },
    });
    docMap = new Map(docs.map((d) => [d.id, d]));
  }

  // Attach resolved documents to each assistant message
  const messagesWithDocs = conversation.messages.map((msg) => {
    if (msg.role === "assistant" && Array.isArray(msg.referencedDocumentIds)) {
      const referencedDocuments = (msg.referencedDocumentIds as string[])
        .map((docId) => docMap.get(docId))
        .filter(Boolean);
      return { ...msg, referencedDocuments };
    }
    return msg;
  });

  return NextResponse.json({ ...conversation, messages: messagesWithDocs });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.chatConversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const conversation = await prisma.chatConversation.update({
    where: { id },
    data: { title: body.title },
  });

  return NextResponse.json(conversation);
}
