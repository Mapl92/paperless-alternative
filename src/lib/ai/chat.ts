// WARNING: findRelevantDocuments() contains raw SQL queries against the "Document" table (pgvector).
// Prisma does not type-check these queries. If the Document schema changes
// (column renames, type changes), these queries MUST be updated manually.

import { pool } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import {
  EMBEDDING_MODEL,
  generateQueryEmbedding,
  toVectorString,
} from "@/lib/ai/embeddings";
import {
  callOpenRouter,
  LUNA_MODEL,
  streamOpenRouter,
} from "@/lib/ai/openrouter";

const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || LUNA_MODEL;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DocumentContext {
  id: string;
  title: string;
  correspondent: string | null;
  documentType: string | null;
  documentDate: string | null;
  content: string | null;
}

/**
 * Stream a high-reasoning chat response from GPT-5.6 Luna via OpenRouter.
 * Yields text chunks as they arrive.
 */
export async function* streamChatResponse(
  systemPrompt: string,
  messages: ChatMessage[]
): AsyncGenerator<string> {
  yield* streamOpenRouter(
    [{ role: "system", content: systemPrompt }, ...messages],
    {
      model: CHAT_MODEL,
      action: "chat",
      reasoningEffort: "high",
      maxTokens: 16_384,
    }
  );
}

/**
 * Build a system prompt with document context.
 */
export function buildDocumentContext(documents: DocumentContext[]): string {
  const docSections = documents.map((doc, i) => {
    const meta = [
      doc.correspondent && `Korrespondent: ${doc.correspondent}`,
      doc.documentType && `Typ: ${doc.documentType}`,
      doc.documentDate && `Datum: ${new Date(doc.documentDate).toLocaleDateString("de-DE")}`,
    ]
      .filter(Boolean)
      .join(" | ");

    return `--- Dokument ${i + 1}: ${doc.title} ---
${meta ? meta + "\n" : ""}${doc.content || "(Kein Inhalt verfügbar)"}`;
  });

  const today = new Date().toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `Du bist ein hilfreicher Dokumenten-Assistent. Das heutige Datum ist ${today}. Der Benutzer hat dir folgende Dokumente zur Verfügung gestellt. Beantworte Fragen basierend auf dem Inhalt dieser Dokumente. Wenn die Antwort nicht in den Dokumenten zu finden ist, sage das ehrlich. Antworte auf Deutsch, es sei denn, der Benutzer schreibt in einer anderen Sprache.

${docSections.join("\n\n")}`;
}

/**
 * Find relevant documents using pgvector similarity search.
 */
export async function findRelevantDocuments(
  query: string,
  documentIds?: string[],
  limit = 5
): Promise<DocumentContext[]> {
  const embedding = await generateQueryEmbedding(query);

  let ids: string[];

  if (embedding) {
    const vectorStr = toVectorString(embedding);

    let sql: string;
    let params: (string | number)[];

    if (documentIds && documentIds.length > 0) {
      // Search within specific documents
      const placeholders = documentIds.map((_, i) => `$${i + 4}`).join(",");
      sql = `SELECT id, 1 - ("embedding" <=> $1::vector) as similarity
             FROM "Document"
             WHERE "embedding" IS NOT NULL
               AND "embeddingModel" = $3
               AND "id" IN (${placeholders})
             ORDER BY "embedding" <=> $1::vector
             LIMIT $2`;
      params = [vectorStr, limit, EMBEDDING_MODEL, ...documentIds];
    } else {
      // Search all documents
      sql = `SELECT id, 1 - ("embedding" <=> $1::vector) as similarity
             FROM "Document"
             WHERE "embedding" IS NOT NULL
               AND "embeddingModel" = $3
             ORDER BY "embedding" <=> $1::vector
             LIMIT $2`;
      params = [vectorStr, limit, EMBEDDING_MODEL];
    }

    const result = await pool.query(sql, params);
    ids = result.rows.map((r: { id: string }) => r.id);
  } else if (documentIds && documentIds.length > 0) {
    // No embedding available, just use provided IDs
    ids = documentIds.slice(0, limit);
  } else {
    return [];
  }

  if (ids.length === 0) return [];

  const documents = await prisma.document.findMany({
    where: { id: { in: ids } },
    include: { correspondent: true, documentType: true },
  });

  return documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    correspondent: doc.correspondent?.name ?? null,
    documentType: doc.documentType?.name ?? null,
    documentDate: doc.documentDate?.toISOString() ?? null,
    content: doc.content,
  }));
}

/**
 * Generate a short title for a conversation based on the first message.
 */
export async function generateTitle(userMessage: string): Promise<string> {
  try {
    const response = await callOpenRouter(
      [
        {
          role: "user",
          content: `Gib mir einen kurzen Titel (3-5 Wörter, ohne Punkt, ohne Anführungszeichen) für eine Chat-Konversation die mit dieser Nachricht beginnt:\n\n${userMessage}`,
        },
      ],
      {
        model: CHAT_MODEL,
        action: "title",
        reasoningEffort: "none",
        maxTokens: 64,
      }
    );
    const raw = response.content.trim();
    if (!raw) return "Neuer Chat";
    const title = raw.replace(/^["„»]+|["»"]+$/g, "").replace(/\.+$/, "").trim();
    return title || "Neuer Chat";
  } catch {
    return "Neuer Chat";
  }
}
