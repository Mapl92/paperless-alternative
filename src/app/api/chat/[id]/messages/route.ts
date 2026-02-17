import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  streamChatResponse,
  buildDocumentContext,
  findRelevantDocuments,
  generateTitle,
} from "@/lib/ai/chat";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content, pinnedDocIds, excludedDocIds, searchNewDocs } = await request.json();

  // Load conversation
  const conversation = await prisma.chatConversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    return new Response("Konversation nicht gefunden", { status: 404 });
  }

  // Save user message
  await prisma.chatMessage.create({
    data: {
      conversationId: id,
      role: "user",
      content,
    },
  });

  // Determine which documents to use
  let referencedDocumentIds: string[];
  let systemPrompt: string;

  const usePinned = Array.isArray(pinnedDocIds) && pinnedDocIds.length > 0 && !searchNewDocs;

  if (usePinned) {
    // Use pinned docs, filtering out excluded ones
    const excludedSet = new Set<string>(excludedDocIds ?? []);
    referencedDocumentIds = pinnedDocIds.filter((docId: string) => !excludedSet.has(docId));

    // Load pinned docs directly from DB — no embedding search needed
    const pinnedDocs = await prisma.document.findMany({
      where: { id: { in: referencedDocumentIds } },
      select: {
        id: true,
        title: true,
        content: true,
        documentDate: true,
        correspondent: { select: { name: true } },
        documentType: { select: { name: true } },
      },
    });
    systemPrompt = buildDocumentContext(
      pinnedDocs.map((d) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        documentDate: d.documentDate?.toISOString() ?? null,
        correspondent: d.correspondent?.name ?? null,
        documentType: d.documentType?.name ?? null,
      }))
    );
  } else {
    // Find relevant documents via embedding search
    const selectedIds =
      conversation.documentScope === "selected" && conversation.selectedDocumentIds
        ? (conversation.selectedDocumentIds as string[])
        : undefined;

    // When explicitly searching for new docs, only use current message
    // to avoid previous conversation context pulling results to old topic
    const searchQuery = searchNewDocs
      ? content
      : [...conversation.messages
            .filter((m) => m.role === "user")
            .slice(-2)
            .map((m) => m.content),
          content,
        ].join("\n");

    let relevantDocs;
    if (selectedIds && selectedIds.length <= 10) {
      relevantDocs = await findRelevantDocuments(searchQuery, selectedIds, selectedIds.length);
    } else {
      relevantDocs = await findRelevantDocuments(searchQuery, selectedIds, 5);
    }
    referencedDocumentIds = relevantDocs.map((d) => d.id);
    systemPrompt = buildDocumentContext(relevantDocs);
  }

  // Build message history for Gemini
  const geminiMessages = [
    ...conversation.messages.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    })),
    { role: "user" as const, parts: [{ text: content }] },
  ];

  // Fetch document info for refs event
  const refDocs = await prisma.document.findMany({
    where: { id: { in: referencedDocumentIds } },
    select: {
      id: true,
      title: true,
      thumbnailFile: true,
      correspondent: { select: { name: true } },
    },
  });

  // SSE streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send referenced documents first
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "refs", documents: refDocs })}\n\n`
        )
      );

      let fullResponse = "";

      try {
        for await (const chunk of streamChatResponse(systemPrompt, geminiMessages)) {
          fullResponse += chunk;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`
            )
          );
        }
      } catch (error) {
        console.error("Streaming error:", error);

        // #10: Save whatever partial response arrived before the error
        if (fullResponse) {
          await prisma.chatMessage.create({
            data: {
              conversationId: id,
              role: "assistant",
              content: fullResponse,
              referencedDocumentIds: JSON.parse(JSON.stringify(referencedDocumentIds)),
            },
          }).catch((e) => console.error("Failed to save partial message:", e));
        }

        const errMsg =
          error instanceof Error ? error.message : "Streaming fehlgeschlagen";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`
          )
        );
        controller.close();
        return;
      }

      // Save assistant message
      await prisma.chatMessage.create({
        data: {
          conversationId: id,
          role: "assistant",
          content: fullResponse,
          referencedDocumentIds: JSON.parse(JSON.stringify(referencedDocumentIds)),
        },
      });

      // Auto-generate title on first exchange
      if (conversation.messages.length === 0) {
        const title = await generateTitle(content);
        await prisma.chatConversation.update({
          where: { id },
          data: { title },
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "title", title })}\n\n`
          )
        );
      }

      // Update conversation timestamp
      await prisma.chatConversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
